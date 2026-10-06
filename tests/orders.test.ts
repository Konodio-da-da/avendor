import { describe, it, expect, beforeEach } from 'vitest'
import { createOrderFromPayment, getOrderByPaymentRef, getOrderByQuoteId, transitionOrder, createLedgerEntries, getLedgerForOrder, markWebhookProcessed, isWebhookProcessed, clearOrders, getAllOrders } from '../server/orders'

describe('In-memory order store and ledger', () => {
  beforeEach(() => {
    clearOrders()
  })

  it('creates an order from payment data', () => {
    const order = createOrderFromPayment({
      quoteId: 'quote_abc123',
      paymentRef: 'pay_xyz789',
      userId: 'user_123',
      userRole: 'customer',
      items: [{ productId: 'prod_1', variantId: 'var_1', quantity: 2, title: 'Test Product', variantLabel: 'Large', unitPriceNgn: 10000, lineTotalNgn: 20000, storeId: 'store_1', vendorId: 'vendor_1' }],
      subtotalNgn: 20000,
      platformFeeNgn: 1000,
      shippingNgn: 0,
      totalNgn: 20000,
    })

    expect(order.id).toMatch(/^order_/)
    expect(order.quoteId).toBe('quote_abc123')
    expect(order.paymentRef).toBe('pay_xyz789')
    expect(order.userId).toBe('user_123')
    expect(order.status).toBe('PAID')
    expect(order.items).toHaveLength(1)
  })

  it('retrieves order by payment reference', () => {
    const order = createOrderFromPayment({
      quoteId: 'quote_1',
      paymentRef: 'pay_ref_1',
      userId: 'user_1',
      userRole: 'customer',
      items: [],
      subtotalNgn: 10000,
      platformFeeNgn: 500,
      shippingNgn: 0,
      totalNgn: 10000,
    })

    const found = getOrderByPaymentRef('pay_ref_1')
    expect(found).toBeDefined()
    expect(found?.id).toBe(order.id)
  })

  it('retrieves order by quote ID', () => {
    const order = createOrderFromPayment({
      quoteId: 'quote_2',
      paymentRef: 'pay_ref_2',
      userId: 'user_2',
      userRole: 'customer',
      items: [],
      subtotalNgn: 10000,
      platformFeeNgn: 500,
      shippingNgn: 0,
      totalNgn: 10000,
    })

    const found = getOrderByQuoteId('quote_2')
    expect(found).toBeDefined()
    expect(found?.id).toBe(order.id)
  })

  it('transitions order status correctly', () => {
    const order = createOrderFromPayment({
      quoteId: 'quote_3',
      paymentRef: 'pay_ref_3',
      userId: 'user_3',
      userRole: 'customer',
      items: [],
      subtotalNgn: 10000,
      platformFeeNgn: 500,
      shippingNgn: 0,
      totalNgn: 10000,
    })

    const updated = transitionOrder(order.id, 'PROCESSING')
    expect(updated.status).toBe('PROCESSING')

    // Valid transition chain
    transitionOrder(order.id, 'READY_TO_SHIP')
    expect(getOrderByPaymentRef('pay_ref_3')?.status).toBe('READY_TO_SHIP')

    // Invalid transition should throw
    expect(() => transitionOrder(order.id, 'PENDING_PAYMENT')).toThrow()
  })

  it('creates ledger entries for an order', () => {
    const order = createOrderFromPayment({
      quoteId: 'quote_4',
      paymentRef: 'pay_ref_4',
      userId: 'user_4',
      userRole: 'customer',
      items: [
        { productId: 'prod_1', variantId: 'var_1', quantity: 1, title: 'Product A', variantLabel: 'One size', unitPriceNgn: 15000, lineTotalNgn: 15000, storeId: 'store_1', vendorId: 'vendor_A' },
        { productId: 'prod_2', variantId: 'var_2', quantity: 1, title: 'Product B', variantLabel: 'One size', unitPriceNgn: 10000, lineTotalNgn: 10000, storeId: 'store_2', vendorId: 'vendor_B' },
      ],
      subtotalNgn: 25000,
      platformFeeNgn: 1250,
      shippingNgn: 0,
      totalNgn: 25000,
    })

    const entries = createLedgerEntries(order)
    expect(entries.length).toBe(4) // payment + platform_fee + vendor_A + vendor_B

    const paymentEntry = entries.find(e => e.type === 'payment')
    expect(paymentEntry).toBeDefined()
    expect(paymentEntry?.amountNgn).toBe(25000)

    const feeEntry = entries.find(e => e.type === 'platform_fee')
    expect(feeEntry).toBeDefined()
    expect(feeEntry?.amountNgn).toBe(1250)

    const vendorAEntry = entries.find(e => e.type === 'vendor_amount' && e.vendorId === 'vendor_A')
    expect(vendorAEntry).toBeDefined()
    expect(vendorAEntry?.amountNgn).toBe(15000)

    const vendorBEntry = entries.find(e => e.type === 'vendor_amount' && e.vendorId === 'vendor_B')
    expect(vendorBEntry).toBeDefined()
    expect(vendorBEntry?.amountNgn).toBe(10000)

    // Verify stored ledger
    const stored = getLedgerForOrder(order.id)
    expect(stored.length).toBe(4)
  })

  it('prevents duplicate webhook processing', () => {
    markWebhookProcessed('ref_123', 'charge.success', { event: 'charge.success', data: {} })
    expect(isWebhookProcessed('ref_123', 'charge.success')).toBe(true)

    expect(() => markWebhookProcessed('ref_123', 'charge.success', { event: 'charge.success', data: {} })).toThrow('Duplicate webhook event')
  })

  it('gets all orders', () => {
    createOrderFromPayment({ quoteId: 'q1', paymentRef: 'p1', userId: 'u1', userRole: 'customer', items: [], subtotalNgn: 1000, platformFeeNgn: 50, shippingNgn: 0, totalNgn: 1000 })
    createOrderFromPayment({ quoteId: 'q2', paymentRef: 'p2', userId: 'u2', userRole: 'customer', items: [], subtotalNgn: 2000, platformFeeNgn: 100, shippingNgn: 0, totalNgn: 2000 })

    const all = getAllOrders()
    expect(all.length).toBe(2)
  })
})