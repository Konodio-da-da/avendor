import { createHash, randomUUID } from 'node:crypto'
import { getFirebaseAdmin } from './firebase-admin.js'
import { getDocuments, isPersistentDataEnabled, runFirestoreTransaction, saveDocument } from './persistence.js'
import { getAllOrders, getLedgerForOrder, type Order, type LedgerEntry } from './orders.js'
import { getAllRefunds } from './refunds.js'

export type PayoutStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'cancelled'

export interface VendorSettlement {
  vendorId: string
  currency: 'NGN'
  grossSalesNgn: number
  platformFeesNgn: number
  refundsNgn: number
  adjustmentsNgn: number
  pendingNgn: number
  availableNgn: number
  paidOutNgn: number
  generatedAt: string
}

export interface PayoutRequest {
  id: string
  vendorId: string
  amountNgn: number
  status: PayoutStatus
  requestedBy: string
  destinationId: string | null
  note: string
  createdAt: string
  updatedAt: string
  paidAt: string | null
  idempotencyKey: string | null
}

const payouts = new Map<string, PayoutRequest>()
const payoutIdempotency = new Map<string, string>()

export async function hydrateSettlements(): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const docs = await getDocuments('payouts')
  for (const doc of docs) {
    const payout = doc.data as unknown as PayoutRequest
    payouts.set(doc.id, { ...payout, idempotencyKey: payout.idempotencyKey ?? null })
    if (payout.idempotencyKey) payoutIdempotency.set(`${payout.vendorId}:${payout.idempotencyKey}`, payout.id)
  }
}

function eligibleForSettlement(status: string): boolean {
  return ['DELIVERED', 'SETTLEMENT_PENDING', 'SETTLED'].includes(status)
}

function blockedFromSettlement(status: string): boolean {
  return ['CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'DISPUTED', 'PENDING_PAYMENT'].includes(status)
}

function vendorOrderGross(order: Order, vendorId: string): number {
  return order.items.filter(item => item.vendorId === vendorId).reduce((sum, item) => sum + item.lineTotalNgn, 0)
}

function vendorOrderShare(order: Order, vendorId: string): number {
  const gross = vendorOrderGross(order, vendorId)
  if (!gross || !order.subtotalNgn) return 0
  return gross / order.subtotalNgn
}

function vendorOrderFee(order: Order, vendorId: string): number {
  return Math.round(order.platformFeeNgn * vendorOrderShare(order, vendorId))
}

function vendorOrderRefunds(order: Order, vendorId: string): number {
  const refunds = getAllRefunds().filter(refund => refund.orderId === order.id && ['queued', 'processed'].includes(refund.status))
  return refunds.reduce((sum, refund) => sum + Math.round(refund.amountNgn * vendorOrderShare(order, vendorId)), 0)
}

function vendorPaidOut(vendorId: string): number {
  let total = 0
  for (const payout of payouts.values()) {
    if (payout.vendorId === vendorId && ['requested', 'processing', 'paid'].includes(payout.status)) total += payout.amountNgn
  }
  return total
}

export function calculateVendorSettlement(vendorId: string, orders: Order[] = getAllOrders()): VendorSettlement {
  let grossSalesNgn = 0
  let platformFeesNgn = 0
  let refundsNgn = 0
  let pendingNgn = 0
  let availableNgn = 0

  for (const order of orders) {
    const gross = vendorOrderGross(order, vendorId)
    if (!gross) continue
    const fee = vendorOrderFee(order, vendorId)
    const refund = vendorOrderRefunds(order, vendorId)
    const net = Math.max(0, gross - fee - refund)
    if (blockedFromSettlement(order.status)) continue
    grossSalesNgn += gross
    platformFeesNgn += fee
    refundsNgn += refund
    if (eligibleForSettlement(order.status)) availableNgn += net
    else pendingNgn += net
  }

  const paidOutNgn = vendorPaidOut(vendorId)
  availableNgn = Math.max(0, availableNgn - paidOutNgn)

  return {
    vendorId,
    currency: 'NGN',
    grossSalesNgn,
    platformFeesNgn,
    refundsNgn,
    adjustmentsNgn: 0,
    pendingNgn,
    availableNgn,
    paidOutNgn,
    generatedAt: new Date().toISOString(),
  }
}

export function getPayout(id: string): PayoutRequest | undefined {
  return payouts.get(id)
}

export function getPayoutsForVendor(vendorId: string): PayoutRequest[] {
  return Array.from(payouts.values()).filter(payout => payout.vendorId === vendorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getAllPayouts(): PayoutRequest[] {
  return Array.from(payouts.values()).map(payout => structuredClone(payout))
}

function payoutId(vendorId: string, amountNgn: number): string {
  const nonce = new Date().toISOString().slice(0, 13)
  return `payout_${createHash('sha256').update(`${vendorId}:${amountNgn}:${nonce}`).digest('hex').slice(0, 32)}`
}

export async function requestPayout(vendorId: string, amountNgn: number, requestedBy: string, destinationId: string | null = null, note = '', idempotencyKey?: string): Promise<PayoutRequest> {
  if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0) throw new Error('Payout amount must be a positive whole NGN amount.')
  const settlement = calculateVendorSettlement(vendorId)
  if (amountNgn > settlement.availableNgn) throw new Error('Payout amount exceeds the vendor available balance.')

  const normalizedKey = idempotencyKey?.trim()
  if (normalizedKey) {
    const existingId = payoutIdempotency.get(`${vendorId}:${normalizedKey}`)
    if (existingId) {
      const existingPayout = payouts.get(existingId)
      if (existingPayout) return existingPayout
    }
  }
  const id = normalizedKey ? `payout_${createHash('sha256').update(`${vendorId}:${normalizedKey}`).digest('hex').slice(0, 32)}` : payoutId(vendorId, amountNgn) + `_${randomUUID().slice(0, 8)}`
  const existing = payouts.get(id)
  if (existing) return existing
  const now = new Date().toISOString()
  const payout: PayoutRequest = { id, vendorId, amountNgn, status: 'requested', requestedBy, destinationId, note: note.trim(), createdAt: now, updatedAt: now, paidAt: null, idempotencyKey: normalizedKey ?? null }
  payouts.set(id, payout)
  if (normalizedKey) payoutIdempotency.set(`${vendorId}:${normalizedKey}`, id)
  await saveDocument('payouts', id, { ...structuredClone(payout) })
  return payout
}

export async function updatePayoutStatus(id: string, status: Exclude<PayoutStatus, 'requested'>): Promise<PayoutRequest> {
  const existing = payouts.get(id)
  if (!existing) throw new Error('Payout not found.')
  if (existing.status === 'paid' && status !== 'paid') return existing
  if (existing.status === 'cancelled' || existing.status === 'failed') throw new Error(`Payout ${id} is already ${existing.status}.`)
  if (status === 'processing' && existing.status !== 'requested') throw new Error('Only requested payouts can enter processing.')
  if (status === 'paid' && !['requested', 'processing'].includes(existing.status)) throw new Error('Only requested or processing payouts can be paid.')
  const now = new Date().toISOString()
  const updated = { ...existing, status, updatedAt: now, paidAt: status === 'paid' ? now : existing.paidAt }
  payouts.set(id, updated)
  await saveDocument('payouts', id, { ...structuredClone(updated) })
  if (status === 'paid') {
    const ledgerId = `${id}_ledger`
    const entry: LedgerEntry = { id: ledgerId, orderId: `payout:${id}`, type: 'payout', amountNgn: existing.amountNgn, currency: 'NGN', vendorId: existing.vendorId, description: `Vendor payout ${id}`, createdAt: now }
    await saveDocument('ledger', ledgerId, { ...structuredClone(entry) })
  }
  return updated
}

export function clearSettlements(): void {
  payouts.clear()
  payoutIdempotency.clear()
}
