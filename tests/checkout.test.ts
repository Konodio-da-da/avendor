import { describe, expect, it, beforeEach } from 'vitest'
import { buildCheckoutQuote, clearCheckoutQuotes, getCheckoutQuote } from '../server/checkout'
import { initializeInventory, clearInventory, releaseReservation, getReservationsByVariant, getAvailableStock } from '../server/inventory'

const catalog = [{
  id: 'product_test',
  storeId: 'store_test',
  vendorId: 'vendor_test',
  title: 'Test product',
  slug: 'test-product',
  category: 'Test',
  material: 'Cotton',
  status: 'active' as const,
  priceNgn: 10000,
  variants: [{ id: 'variant_test', label: 'One size', priceNgn: 12500, stock: 3 }],
}]

function initTestInventory() {
  clearInventory()
  for (const product of catalog) {
    for (const variant of product.variants) {
      initializeInventory(variant.id, product.id, product.vendorId, variant.stock, 3)
    }
  }
}

function clearReservations() {
  for (const reservation of getReservationsByVariant('variant_test')) {
    releaseReservation(reservation.id)
  }
}

describe('server-controlled checkout quotes', () => {
  beforeEach(() => {
    clearCheckoutQuotes()
    initTestInventory()
  })

  it('uses the server variant price and calculates a deterministic quote', () => {
    clearReservations()
    const quote = buildCheckoutQuote({
      items: [{ productId: 'product_test', variantId: 'variant_test', quantity: 2 }],
      currency: 'NGN',
    }, 'request-1', Date.UTC(2026, 0, 1), catalog)

    expect(quote.items[0].unitPriceNgn).toBe(12500)
    expect(quote.subtotalNgn).toBe(25000)
    expect(quote.platformFeeNgn).toBe(1250)
    expect(quote.totalNgn).toBe(25000)

    clearReservations()
    expect(quote.quoteId).toBe(buildCheckoutQuote({
      items: [{ productId: 'product_test', variantId: 'variant_test', quantity: 2 }],
      currency: 'NGN',
    }, 'request-1', Date.UTC(2026, 0, 1), catalog).quoteId)
  })

  it('rejects duplicate lines and quantities above authoritative stock', () => {
    expect(() => buildCheckoutQuote({
      items: [
        { productId: 'product_test', variantId: 'variant_test', quantity: 1 },
        { productId: 'product_test', variantId: 'variant_test', quantity: 1 },
      ],
      currency: 'NGN',
    }, 'request-2', Date.now(), catalog)).toThrow('Duplicate product variants')

    clearReservations()
    expect(() => buildCheckoutQuote({
      items: [{ productId: 'product_test', variantId: 'variant_test', quantity: 4 }],
      currency: 'NGN',
    }, 'request-3', Date.now(), catalog)).toThrow('Insufficient inventory')
  })

  it('reuses the same quote for the same idempotency key instead of reserving twice', () => {
    const input = { items: [{ productId: 'product_test', variantId: 'variant_test', quantity: 2 }], currency: 'NGN' as const }
    const first = buildCheckoutQuote(input, 'same-key', Date.now(), catalog)
    const second = buildCheckoutQuote(input, 'same-key', Date.now(), catalog)
    expect(second.quoteId).toBe(first.quoteId)
    expect(getReservationsByVariant('variant_test')).toHaveLength(1)
    expect(getAvailableStock('variant_test')).toBe(1)
  })

  it('expires reservations before calculating available stock', () => {
    const quote = buildCheckoutQuote({ items: [{ productId: 'product_test', variantId: 'variant_test', quantity: 2 }], currency: 'NGN' }, 'expiry-key', Date.now() - 700000, catalog)
    expect(quote.items[0].reservationId).toBeTruthy()
    expect(getAvailableStock('variant_test')).toBe(3)
  })

  it('rejects client-controlled price and vendor fields', () => {
    clearReservations()
    expect(() => buildCheckoutQuote({
      items: [{ productId: 'product_test', variantId: 'variant_test', quantity: 1, priceNgn: 1, vendorId: 'attacker' }],
      currency: 'NGN',
    }, 'request-4', Date.now(), catalog)).toThrow()
  })
})
