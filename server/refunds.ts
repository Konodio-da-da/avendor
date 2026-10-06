import { createHash } from 'node:crypto'
import { getFirebaseAdmin } from './firebase-admin.js'
import { isPersistentDataEnabled, runFirestoreTransaction, saveDocument } from './persistence.js'
import { getOrder, getLedgerForOrder, type LedgerEntry, transitionOrder, type Order } from './orders.js'
import { adjustInventory } from './inventory.js'

export type RefundStatus = 'requested' | 'queued' | 'processed' | 'failed'

export interface RefundRecord {
  id: string
  orderId: string
  paymentRef: string
  amountNgn: number
  status: RefundStatus
  reason: string
  requestedBy: string
  paystackRefundId: string | null
  createdAt: string
  updatedAt: string
}

const refunds = new Map<string, RefundRecord>()

export async function hydrateRefunds(): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const { getDocuments } = await import('./persistence.js')
  const docs = await getDocuments('refunds')
  for (const doc of docs) refunds.set(doc.id, doc.data as unknown as RefundRecord)
}

function refundId(orderId: string, amountNgn: number): string {
  return `refund_${createHash('sha256').update(`${orderId}:${amountNgn}`).digest('hex').slice(0, 32)}`
}

export function getRefund(id: string): RefundRecord | undefined { return refunds.get(id) }
export function getRefundsForOrder(orderId: string): RefundRecord[] { return Array.from(refunds.values()).filter(r => r.orderId === orderId) }
export function getAllRefunds(): RefundRecord[] { return Array.from(refunds.values()).map(refund => structuredClone(refund)) }

function refundedAmount(orderId: string): number {
  return getRefundsForOrder(orderId)
    .filter(r => r.status === 'queued' || r.status === 'processed')
    .reduce((sum, r) => sum + r.amountNgn, 0)
}

export function assertRefundable(order: Order, amountNgn: number): void {
  if (!['PAID', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'SETTLEMENT_PENDING', 'SETTLED', 'REFUND_PENDING'].includes(order.status)) {
    throw new Error(`Order ${order.id} cannot be refunded from status ${order.status}.`)
  }
  if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0 || amountNgn > order.totalNgn) throw new Error('Refund amount is invalid.')
  if (refundedAmount(order.id) + amountNgn > order.totalNgn) throw new Error('Refund amount exceeds the remaining refundable balance.')
}

export async function requestRefund(orderId: string, amountNgn: number, reason: string, requestedBy: string): Promise<RefundRecord> {
  const order = getOrder(orderId)
  if (!order) throw new Error('Order not found.')
  assertRefundable(order, amountNgn)

  const id = refundId(orderId, amountNgn)
  const existing = refunds.get(id)
  if (existing) return existing

  const now = new Date().toISOString()
  const record: RefundRecord = {
    id, orderId, paymentRef: order.paymentRef, amountNgn, status: 'requested', reason: reason.trim(), requestedBy,
    paystackRefundId: null, createdAt: now, updatedAt: now,
  }
  refunds.set(id, record)
  await saveDocument('refunds', id, { ...structuredClone(record) })
  if (order.status !== 'REFUND_PENDING') transitionOrder(order.id, 'REFUND_PENDING')
  return record
}

export async function initiatePaystackRefund(secret: string, refund: RefundRecord): Promise<RefundRecord> {
  if (!secret) throw new Error('Payment provider is not configured.')
  const existing = refunds.get(refund.id) ?? refund
  if (existing.status === 'queued' || existing.status === 'processed') return existing

  const response = await fetch('https://api.paystack.co/refund', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: existing.paymentRef, amount: existing.amountNgn * 100, currency: 'NGN', customer_note: existing.reason, merchant_note: `V-Hub refund ${existing.id}` }),
  })
  const data = await response.json() as Record<string, any>
  if (!response.ok || !data.status || !data.data) throw new Error(data.message ?? 'Paystack refund initiation failed.')

  const now = new Date().toISOString()
  const updated: RefundRecord = { ...existing, status: 'queued', paystackRefundId: String(data.data.id ?? ''), updatedAt: now }
  refunds.set(updated.id, updated)
  await saveDocument('refunds', updated.id, { ...structuredClone(updated) })
  return updated
}

export async function completeRefund(refundIdValue: string, paystackStatus: string): Promise<RefundRecord> {
  const refund = refunds.get(refundIdValue)
  if (!refund) throw new Error('Refund not found.')
  if (refund.status === 'processed') return refund
  if (!['processed', 'processing', 'completed'].includes(paystackStatus)) throw new Error(`Refund is not complete: ${paystackStatus}`)

  const order = getOrder(refund.orderId)
  if (!order) throw new Error('Order not found.')

  const now = new Date().toISOString()
  if (isPersistentDataEnabled()) {
    const result = await runFirestoreTransaction(async transaction => {
      const { adminDb } = getFirebaseAdmin()
      const refundRef = adminDb.collection('refunds').doc(refund.id)
      const orderRef = adminDb.collection('orders').doc(order.id)
      const ledgerRef = adminDb.collection('ledger').doc(`${order.id}_refund_${refund.id}`)
      const [refundSnap, orderSnap] = await Promise.all([transaction.get(refundRef), transaction.get(orderRef)])
      if (refundSnap.exists && (refundSnap.data()?.status === 'processed')) return refundSnap.data() as RefundRecord
      if (!orderSnap.exists) throw new Error('Order persistence record not found.')
      const currentOrder = orderSnap.data() as Order
      const updatedOrder: Order = { ...currentOrder, status: 'REFUNDED', updatedAt: now }
      const updatedRefund: RefundRecord = { ...refund, status: 'processed', updatedAt: now }
      const entry: LedgerEntry = { id: ledgerRef.id, orderId: order.id, type: 'refund', amountNgn: refund.amountNgn, currency: 'NGN', vendorId: null, description: `Refund ${refund.id} for order ${order.id}`, createdAt: now }
      transaction.set(refundRef, updatedRefund)
      transaction.set(orderRef, updatedOrder)
      transaction.set(ledgerRef, entry)
      return updatedRefund
    })
    if (!result) throw new Error('Refund transaction could not be started.')
    refunds.set(result.id, result)
    return result
  }

  const updated: RefundRecord = { ...refund, status: 'processed', updatedAt: now }
  refunds.set(updated.id, updated)
  await saveDocument('refunds', updated.id, { ...structuredClone(updated) })
  if (order.status !== 'REFUNDED') transitionOrder(order.id, 'REFUNDED')
  const entries = getLedgerForOrder(order.id)
  if (!entries.some(entry => entry.id === `${order.id}_refund_${refund.id}`)) {
    const entry: LedgerEntry = { id: `${order.id}_refund_${refund.id}`, orderId: order.id, type: 'refund', amountNgn: refund.amountNgn, currency: 'NGN', vendorId: null, description: `Refund ${refund.id} for order ${order.id}`, createdAt: now }
    entries.push(entry)
    await saveDocument('ledger', entry.id, { ...structuredClone(entry) })
  }
  return updated
}

export async function restoreInventoryForCancelledOrder(order: Order): Promise<void> {
  if (['SHIPPED', 'DELIVERED', 'SETTLEMENT_PENDING', 'SETTLED'].includes(order.status)) return
  for (const item of order.items) {
    const existing = getRefundsForOrder(order.id).find(r => r.id === `restock_${order.id}_${item.variantId}`)
    if (existing) continue
    adjustInventory(item.variantId, 'return', item.quantity, `Cancelled order ${order.id}`, `cancel:${order.id}:${item.variantId}`)
  }
}
