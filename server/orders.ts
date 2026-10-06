import { createHash } from 'node:crypto'
import { getDocuments, saveDocument, isPersistentDataEnabled, runFirestoreTransaction } from './persistence.js'
import { getFirebaseAdmin } from './firebase-admin.js'

function calculateCommission(subtotalNgn: number, commissionRate: number): number {
  if (!Number.isSafeInteger(subtotalNgn) || subtotalNgn < 0) throw new Error('Subtotal must be a non-negative whole number.')
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) throw new Error('Commission rate must be between 0 and 1.')
  return Math.round(subtotalNgn * commissionRate)
}

const orderTransitions: Record<string, readonly string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'REFUND_PENDING', 'DISPUTED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED', 'REFUND_PENDING', 'DISPUTED'],
  READY_TO_SHIP: ['SHIPPED', 'REFUND_PENDING', 'DISPUTED'],
  SHIPPED: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['SETTLEMENT_PENDING', 'REFUND_PENDING', 'DISPUTED'],
  SETTLEMENT_PENDING: ['SETTLED', 'REFUND_PENDING', 'DISPUTED'],
  SETTLED: ['REFUND_PENDING', 'DISPUTED'],
  CANCELLED: [],
  REFUND_PENDING: ['REFUNDED', 'DISPUTED'],
  REFUNDED: [],
  DISPUTED: ['REFUND_PENDING', 'SETTLEMENT_PENDING', 'CANCELLED'],
}

function canTransitionOrder(from: string, to: string): boolean {
  return orderTransitions[from]?.includes(to) ?? false
}

function assertTransition(allowed: boolean, entity: string, from: string, to: string): void {
  if (!allowed) throw new Error(`Invalid ${entity} transition: ${from} -> ${to}`)
}

export interface CheckoutQuoteItem {
  productId: string
  variantId: string
  title: string
  variantLabel: string
  quantity: number
  unitPriceNgn: number
  lineTotalNgn: number
  storeId: string
  vendorId: string
}

export interface Order {
  id: string
  quoteId: string
  paymentRef: string
  userId: string
  userRole: string
  status: string
  items: CheckoutQuoteItem[]
  subtotalNgn: number
  platformFeeNgn: number
  shippingNgn: number
  totalNgn: number
  createdAt: string
  updatedAt: string
  paidAt: string | null
}

export interface LedgerEntry {
  id: string
  orderId: string
  type: 'payment' | 'platform_fee' | 'vendor_amount' | 'refund' | 'payout' | 'hold' | 'release' | 'adjustment' | 'chargeback'
  amountNgn: number
  currency: 'NGN'
  vendorId: string | null
  description: string
  createdAt: string
}

export interface WebhookEvent {
  id: string
  event: string
  reference: string
  payload: unknown
  processed: boolean
  createdAt: string
}

const orders = new Map<string, Order>()
const ledger = new Map<string, LedgerEntry[]>()
const processedWebhooks = new Map<string, WebhookEvent>()

export async function hydrateOrders(): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const [orderDocs, ledgerDocs, webhookDocs] = await Promise.all([
    getDocuments('orders'),
    getDocuments('ledger'),
    getDocuments('webhookEvents'),
  ])
  for (const doc of orderDocs) orders.set(doc.id, doc.data as unknown as Order)
  for (const doc of ledgerDocs) {
    const entry = doc.data as unknown as LedgerEntry
    const current = ledger.get(entry.orderId) ?? []
    current.push(entry)
    ledger.set(entry.orderId, current)
  }
  for (const doc of webhookDocs) {
    const event = doc.data as unknown as WebhookEvent
    processedWebhooks.set(doc.id, event)
  }
}

async function persistOrder(order: Order): Promise<void> {
  await saveDocument('orders', order.id, { ...structuredClone(order) })
}


function generateId(prefix: string): string {
  return `${prefix}_${createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 20)}`
}

export function createOrderFromPayment(data: {
  quoteId: string
  paymentRef: string
  userId: string
  userRole: string
  items: CheckoutQuoteItem[]
  subtotalNgn: number
  platformFeeNgn: number
  shippingNgn: number
  totalNgn: number
}): Order {
  const now = new Date().toISOString()
  const order: Order = {
    id: `order_${createHash('sha256').update(data.paymentRef).digest('hex').slice(0, 32)}`,
    quoteId: data.quoteId,
    paymentRef: data.paymentRef,
    userId: data.userId,
    userRole: data.userRole,
    status: 'PAID',
    items: data.items,
    subtotalNgn: data.subtotalNgn,
    platformFeeNgn: data.platformFeeNgn,
    shippingNgn: data.shippingNgn,
    totalNgn: data.totalNgn,
    createdAt: now,
    updatedAt: now,
    paidAt: now,
  }
  orders.set(order.id, order)
  void persistOrder(order)
  return order
}


export async function finalizeSuccessfulPayment(data: {
  quoteId: string
  paymentRef: string
  userId: string
  userRole: string
  items: CheckoutQuoteItem[]
  reservationIds: string[]
  subtotalNgn: number
  platformFeeNgn: number
  shippingNgn: number
  totalNgn: number
  paidAt: string | null
  webhookEvent: string
  webhookPayload: unknown
}): Promise<Order> {
  const orderId = `order_${createHash('sha256').update(data.paymentRef).digest('hex').slice(0, 32)}`
  const webhookKey = `${data.webhookEvent}:${data.paymentRef}`

  if (!isPersistentDataEnabled()) {
    const existing = getOrderByPaymentRef(data.paymentRef) ?? getOrderByQuoteId(data.quoteId)
    if (existing) return existing
    const reservationIds = [...new Set(data.reservationIds)]
    const { confirmReservations } = await import('./inventory.js')
    if (reservationIds.length !== data.items.length || !confirmReservations(reservationIds)) {
      throw new Error('Inventory confirmation failed; payment requires manual reconciliation')
    }
    const order = createOrderFromPayment(data)
    createLedgerEntries(order)
    markWebhookProcessed(data.paymentRef, data.webhookEvent, data.webhookPayload)
    return order
  }

  const result = await runFirestoreTransaction(async transaction => {
    const { adminDb } = getFirebaseAdmin()
    const orderRef = adminDb.collection('orders').doc(orderId)
    const webhookRef = adminDb.collection('webhookEvents').doc(webhookKey)
    const existingOrderSnap = await transaction.get(orderRef)
    const webhookSnap = await transaction.get(webhookRef)
    if (existingOrderSnap.exists) return existingOrderSnap.data() as Order
    if (webhookSnap.exists) {
      const byRef = await adminDb.collection('orders').where('paymentRef', '==', data.paymentRef).limit(1).get()
      if (!byRef.empty) return byRef.docs[0].data() as Order
      throw new Error('Webhook is already marked processed but its order is missing.')
    }

    const reservationRefs = data.reservationIds.map(id => adminDb.collection('reservations').doc(id))
    const inventoryIds = [...new Set(data.items.map(item => item.variantId))]
    const inventoryRefs = inventoryIds.map(id => adminDb.collection('inventory').doc(id))
    const reservationSnaps = await Promise.all(reservationRefs.map(ref => transaction.get(ref)))
    const inventorySnaps = await Promise.all(inventoryRefs.map(ref => transaction.get(ref)))

    const inventoryByVariant = new Map<string, Record<string, any>>()
    inventorySnaps.forEach((snap, index) => {
      if (!snap.exists) throw new Error(`Inventory record missing for variant ${inventoryIds[index]}.`)
      inventoryByVariant.set(inventoryIds[index], snap.data() as Record<string, any>)
    })

    const reservationsById = new Map<string, Record<string, any>>()
    reservationSnaps.forEach((snap, index) => {
      if (!snap.exists) throw new Error(`Reservation ${data.reservationIds[index]} is missing.`)
      reservationsById.set(data.reservationIds[index], snap.data() as Record<string, any>)
    })

    const quantitiesByVariant = new Map<string, number>()
    for (const item of data.items) {
      const qty = quantitiesByVariant.get(item.variantId) ?? 0
      quantitiesByVariant.set(item.variantId, qty + item.quantity)
    }

    for (const reservationId of data.reservationIds) {
      const reservation = reservationsById.get(reservationId)!
      if (reservation.status !== 'pending' || reservation.quoteId !== data.quoteId) {
        throw new Error(`Reservation ${reservationId} is not available for confirmation.`)
      }
    }

    for (const [variantId, quantity] of quantitiesByVariant) {
      const inventory = inventoryByVariant.get(variantId)!
      if (Number(inventory.stock) < quantity || Number(inventory.reserved) < quantity) {
        throw new Error(`Inventory confirmation failed for variant ${variantId}.`)
      }
    }

    const now = new Date().toISOString()
    const order: Order = {
      id: orderId,
      quoteId: data.quoteId,
      paymentRef: data.paymentRef,
      userId: data.userId,
      userRole: data.userRole,
      status: 'PAID',
      items: data.items,
      subtotalNgn: data.subtotalNgn,
      platformFeeNgn: data.platformFeeNgn,
      shippingNgn: data.shippingNgn,
      totalNgn: data.totalNgn,
      createdAt: now,
      updatedAt: now,
      paidAt: data.paidAt ?? now,
    }

    transaction.set(orderRef, order)

    for (const [variantId, quantity] of quantitiesByVariant) {
      const inventory = inventoryByVariant.get(variantId)!
      transaction.update(adminDb.collection('inventory').doc(variantId), {
        stock: Number(inventory.stock) - quantity,
        reserved: Number(inventory.reserved) - quantity,
        updatedAt: now,
      })
    }

    for (const reservationId of data.reservationIds) {
      transaction.update(adminDb.collection('reservations').doc(reservationId), {
        status: 'confirmed',
        updatedAt: now,
      })
    }

    const vendorTotals = new Map<string, number>()
    for (const item of data.items) {
      vendorTotals.set(item.vendorId, (vendorTotals.get(item.vendorId) ?? 0) + item.lineTotalNgn)
    }

    const ledgerEntries: LedgerEntry[] = [
      { id: `${orderId}_payment`, orderId, type: 'payment', amountNgn: order.totalNgn, currency: 'NGN', vendorId: null, description: `Payment received for order ${orderId}`, createdAt: now },
      { id: `${orderId}_platform_fee`, orderId, type: 'platform_fee', amountNgn: order.platformFeeNgn, currency: 'NGN', vendorId: null, description: `Platform commission for order ${orderId}`, createdAt: now },
      ...Array.from(vendorTotals.entries()).map(([vendorId, amount]) => ({
        id: `${orderId}_vendor_${vendorId}`,
        orderId,
        type: 'vendor_amount' as const,
        amountNgn: amount,
        currency: 'NGN' as const,
        vendorId,
        description: `Vendor payout for order ${orderId}`,
        createdAt: now,
      })),
    ]

    for (const entry of ledgerEntries) {
      transaction.set(adminDb.collection('ledger').doc(entry.id), entry)
    }

    const eventRecord: WebhookEvent = {
      id: webhookKey,
      event: data.webhookEvent,
      reference: data.paymentRef,
      payload: data.webhookPayload,
      processed: true,
      createdAt: now,
    }
    transaction.set(webhookRef, eventRecord)

    return order
  })

  if (!result) throw new Error('Persistent payment transaction could not be started.')

  orders.set(result.id, result)
  const now = result.updatedAt
  const vendorTotals = new Map<string, number>()
  for (const item of result.items) vendorTotals.set(item.vendorId, (vendorTotals.get(item.vendorId) ?? 0) + item.lineTotalNgn)
  const entries: LedgerEntry[] = [
    { id: `${result.id}_payment`, orderId: result.id, type: 'payment', amountNgn: result.totalNgn, currency: 'NGN', vendorId: null, description: `Payment received for order ${result.id}`, createdAt: now },
    { id: `${result.id}_platform_fee`, orderId: result.id, type: 'platform_fee', amountNgn: result.platformFeeNgn, currency: 'NGN', vendorId: null, description: `Platform commission for order ${result.id}`, createdAt: now },
    ...Array.from(vendorTotals.entries()).map(([vendorId, amount]) => ({
      id: `${result.id}_vendor_${vendorId}`,
      orderId: result.id,
      type: 'vendor_amount' as const,
      amountNgn: amount,
      currency: 'NGN' as const,
      vendorId,
      description: `Vendor payout for order ${result.id}`,
      createdAt: now,
    })),
  ]
  ledger.set(result.id, entries)
  processedWebhooks.set(webhookKey, {
    id: webhookKey,
    event: data.webhookEvent,
    reference: data.paymentRef,
    payload: data.webhookPayload,
    processed: true,
    createdAt: result.updatedAt,
  })
  return result
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id)
}

export function getOrderByPaymentRef(paymentRef: string): Order | undefined {
  for (const order of orders.values()) {
    if (order.paymentRef === paymentRef) return order
  }
  return undefined
}

export function getOrderByQuoteId(quoteId: string): Order | undefined {
  for (const order of orders.values()) {
    if (order.quoteId === quoteId) return order
  }
  return undefined
}

export function getOrdersByUser(userId: string): Order[] {
  return Array.from(orders.values()).filter(order => order.userId === userId)
}

export function getOrdersByVendor(vendorId: string): Order[] {
  return Array.from(orders.values()).filter(order => order.items.some(item => item.vendorId === vendorId))
}

export function transitionOrder(orderId: string, newStatus: string): Order {
  const order = orders.get(orderId)
  if (!order) throw new Error('Order not found')
  assertTransition(canTransitionOrder(order.status, newStatus), 'order', order.status, newStatus)
  order.status = newStatus
  order.updatedAt = new Date().toISOString()
  void persistOrder(order)
  return order
}

export function createLedgerEntries(order: Order): LedgerEntry[] {
  const existing = ledger.get(order.id)
  if (existing?.length) return existing
  const now = new Date().toISOString()
  const entries: LedgerEntry[] = []

  // Payment received
  entries.push({
    id: generateId('ledger'),
    orderId: order.id,
    type: 'payment',
    amountNgn: order.totalNgn,
    currency: 'NGN',
    vendorId: null,
    description: `Payment received for order ${order.id}`,
    createdAt: now,
  })

  // Platform fee
  entries.push({
    id: generateId('ledger'),
    orderId: order.id,
    type: 'platform_fee',
    amountNgn: order.platformFeeNgn,
    currency: 'NGN',
    vendorId: null,
    description: `Platform commission for order ${order.id}`,
    createdAt: now,
  })

  // Vendor amounts per vendor
  const vendorTotals = new Map<string, { amount: number; vendorId: string }>()
  for (const item of order.items) {
    const vendorAmount = item.lineTotalNgn
    const existing = vendorTotals.get(item.vendorId)
    if (existing) {
      existing.amount += vendorAmount
    } else {
      vendorTotals.set(item.vendorId, { amount: vendorAmount, vendorId: item.vendorId })
    }
  }

  for (const { amount, vendorId } of vendorTotals.values()) {
    entries.push({
      id: generateId('ledger'),
      orderId: order.id,
      type: 'vendor_amount',
      amountNgn: amount,
      currency: 'NGN',
      vendorId,
      description: `Vendor payout for order ${order.id}`,
      createdAt: now,
    })
  }

  // Store ledger entries
  const orderLedger = ledger.get(order.id) || []
  orderLedger.push(...entries)
  ledger.set(order.id, orderLedger)
  for (const entry of entries) void saveDocument('ledger', entry.id, { ...structuredClone(entry) })

  return entries
}

export function getLedgerForOrder(orderId: string): LedgerEntry[] {
  return ledger.get(orderId) || []
}

export function markWebhookProcessed(reference: string, event: string, payload: unknown): void {
  const key = `${event}:${reference}`
  if (processedWebhooks.has(key)) {
    throw new Error('Duplicate webhook event')
  }
  const eventRecord: WebhookEvent = {
    id: generateId('webhook'),
    event,
    reference,
    payload,
    processed: true,
    createdAt: new Date().toISOString(),
  }
  processedWebhooks.set(key, eventRecord)
  void saveDocument('webhookEvents', key, { ...structuredClone(eventRecord) })
}

export function isWebhookProcessed(reference: string, event: string): boolean {
  return processedWebhooks.has(`${event}:${reference}`)
}

export function clearOrders() {
  orders.clear()
  ledger.clear()
  processedWebhooks.clear()
}

export function getAllOrders(): Order[] {
  return Array.from(orders.values())
}