import { beforeEach, describe, expect, it } from 'vitest'
import { calculateVendorSettlement, requestPayout, updatePayoutStatus, clearSettlements } from '../server/settlements.js'
import type { Order } from '../server/orders.js'

function order(status: Order['status'], paymentRef: string): Order {
  return {
    id: `order_${paymentRef}`, quoteId: 'q', paymentRef, userId: 'u', userRole: 'customer', status,
    items: [
      { productId: 'p1', variantId: 'v1', title: 'A', variantLabel: 'M', quantity: 1, unitPriceNgn: 10000, lineTotalNgn: 10000, storeId: 's', vendorId: 'vendor_A' },
      { productId: 'p2', variantId: 'v2', title: 'B', variantLabel: 'M', quantity: 1, unitPriceNgn: 5000, lineTotalNgn: 5000, storeId: 's', vendorId: 'vendor_B' },
    ],
    subtotalNgn: 15000, platformFeeNgn: 1500, shippingNgn: 0, totalNgn: 15000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), paidAt: new Date().toISOString(),
  }
}

describe('vendor settlements', () => {
  beforeEach(() => clearSettlements())
  it('separates pending and available vendor balances and applies proportional platform fees', () => {
    const orders = [order('PAID', 'a'), order('DELIVERED', 'b')]
    const balance = calculateVendorSettlement('vendor_A', orders)
    expect(balance.pendingNgn).toBe(9000)
    expect(balance.availableNgn).toBe(9000)
    expect(balance.platformFeesNgn).toBe(1000)
    expect(balance.grossSalesNgn).toBe(20000)
  })

  it('does not allow payout above available balance', async () => {
    await expect(requestPayout('vendor_A', 9001, 'admin')).rejects.toThrow('available balance')
  })

  it('tracks requested payouts as reserved and paid payouts as ledger settlement', async () => {
    const orders = [order('DELIVERED', 'c')]
    const balance = calculateVendorSettlement('vendor_A', orders)
    expect(balance.availableNgn).toBe(9000)
    const payout = await requestPayout('vendor_A', 5000, 'admin')
    expect(payout.status).toBe('requested')
    expect(calculateVendorSettlement('vendor_A', orders).availableNgn).toBe(4000)
    const paid = await updatePayoutStatus(payout.id, 'paid')
    expect(paid.status).toBe('paid')
    expect(calculateVendorSettlement('vendor_A', orders).availableNgn).toBe(4000)
  })
})


  it('returns the same payout for a repeated idempotency key', async () => {
    const first = await requestPayout('vendor_A', 5000, 'admin', null, '', 'payout-repeat-1')
    const second = await requestPayout('vendor_A', 5000, 'admin', null, '', 'payout-repeat-1')
    expect(second.id).toBe(first.id)
    expect(second.idempotencyKey).toBe('payout-repeat-1')
  })
