import { describe, expect, it } from 'vitest'
import { assertTransition, calculateCommission, canTransitionOrder, canTransitionPayment } from '../shared/domain'

describe('trusted commerce state rules', () => {
  it('allows only ordered fulfillment transitions', () => {
    expect(canTransitionOrder('PAID', 'PROCESSING')).toBe(true)
    expect(canTransitionOrder('DELIVERED', 'PENDING_PAYMENT')).toBe(false)
    expect(() => assertTransition(canTransitionOrder('DELIVERED', 'PENDING_PAYMENT'), 'order', 'DELIVERED', 'PENDING_PAYMENT')).toThrow()
  })

  it('does not skip payment verification', () => {
    expect(canTransitionPayment('SUCCESS', 'VERIFIED')).toBe(true)
    expect(canTransitionPayment('PENDING', 'ORDER_CONFIRMED')).toBe(false)
  })

  it('calculates a fixed commission from the transaction snapshot', () => {
    expect(calculateCommission(50000, 0.05)).toBe(2500)
    expect(() => calculateCommission(50000, 1.1)).toThrow()
  })
})
