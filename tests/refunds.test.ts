import { describe, expect, it } from 'vitest'
import { assertRefundable } from '../server/refunds.js'

describe('refund rules', () => {
  const order = {
    id: 'o1', quoteId: 'q1', paymentRef: 'p1', userId: 'u1', userRole: 'customer', status: 'PAID', items: [],
    subtotalNgn: 10000, platformFeeNgn: 500, shippingNgn: 0, totalNgn: 10000,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), paidAt: new Date().toISOString(),
  } as any

  it('allows a full refund for a paid order', () => expect(() => assertRefundable(order, 10000)).not.toThrow())
  it('rejects a refund larger than the order', () => expect(() => assertRefundable(order, 10001)).toThrow())
  it('rejects refunding a cancelled order', () => expect(() => assertRefundable({ ...order, status: 'CANCELLED' }, 100)).toThrow())
})
