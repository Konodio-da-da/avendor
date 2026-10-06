export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PROCESSING'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'DISPUTED'

export type PaymentStatus = 'CREATED' | 'INITIALIZED' | 'PENDING' | 'FAILED' | 'ABANDONED' | 'SUCCESS' | 'VERIFIED' | 'ORDER_CONFIRMED'

const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
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

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['INITIALIZED', 'ABANDONED'],
  INITIALIZED: ['PENDING', 'FAILED', 'ABANDONED'],
  PENDING: ['SUCCESS', 'FAILED', 'ABANDONED'],
  FAILED: [],
  ABANDONED: [],
  SUCCESS: ['VERIFIED'],
  VERIFIED: ['ORDER_CONFIRMED'],
  ORDER_CONFIRMED: [],
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return orderTransitions[from].includes(to)
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return paymentTransitions[from].includes(to)
}

export function assertTransition<T extends string>(allowed: boolean, entity: string, from: T, to: T): void {
  if (!allowed) throw new Error(`Invalid ${entity} transition: ${from} -> ${to}`)
}

export function calculateCommission(subtotalNgn: number, commissionRate: number) {
  if (!Number.isSafeInteger(subtotalNgn) || subtotalNgn < 0) throw new Error('Subtotal must be a non-negative whole number.')
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) throw new Error('Commission rate must be between 0 and 1.')
  return Math.round(subtotalNgn * commissionRate)
}
