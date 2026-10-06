import type { RequestHandler } from 'express'
import { createHash } from 'node:crypto'
import { demoCatalog } from './fixtures.js'
import { checkoutSchema } from './validation.js'
import { getAvailableStock, createReservation, releaseReservation } from './inventory.js'
import { getDocuments, isPersistentDataEnabled, saveDocument } from './persistence.js'

const PLATFORM_COMMISSION_RATE = 0.05
const CHECKOUT_QUOTE_TTL_MS = 10 * 60 * 1000
const checkoutQuotes = new Map<string, CheckoutQuote>()

export async function hydrateCheckoutQuotes(): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const docs = await getDocuments('checkoutQuotes')
  for (const doc of docs) checkoutQuotes.set(doc.id, doc.data as unknown as CheckoutQuote)
}

type CatalogProduct = (typeof demoCatalog)[number]

function calculateCommission(subtotalNgn: number, commissionRate: number): number {
  if (!Number.isSafeInteger(subtotalNgn) || subtotalNgn < 0) throw new Error('Subtotal must be a non-negative whole number.')
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 1) throw new Error('Commission rate must be between 0 and 1.')
  return Math.round(subtotalNgn * commissionRate)
}

export type CheckoutQuote = {
  quoteId: string
  currency: 'NGN'
  expiresAt: string
  items: Array<{
    productId: string
    variantId: string
    title: string
    variantLabel: string
    quantity: number
    unitPriceNgn: number
    lineTotalNgn: number
    storeId: string
    vendorId: string
    reservationId?: string
  }>
  subtotalNgn: number
  platformFeeNgn: number
  shippingNgn: number
  totalNgn: number
  dataMode: 'development-fixture'
}

function makeQuoteId(idempotencyKey: string, body: unknown): string {
  return createHash('sha256').update(`${idempotencyKey}:${JSON.stringify(body)}`).digest('hex').slice(0, 24)
}

export function buildCheckoutQuote(input: unknown, idempotencyKey: string, now = Date.now(), catalog: readonly CatalogProduct[] = demoCatalog): CheckoutQuote {
  const parsed = checkoutSchema.parse(input)
  const quoteId = makeQuoteId(idempotencyKey, parsed)
  const existing = checkoutQuotes.get(quoteId)
  if (existing && new Date(existing.expiresAt).getTime() > now) return existing
  if (existing) {
    for (const item of existing.items) {
      if (item.reservationId) releaseReservation(item.reservationId)
    }
    checkoutQuotes.delete(quoteId)
  }

  const seen = new Set<string>()
  const reservationIds: string[] = []

  try {
    const items = parsed.items.map(item => {
      const itemKey = `${item.productId}:${item.variantId}`
      if (seen.has(itemKey)) throw new Error('Duplicate product variants are not allowed.')
      seen.add(itemKey)

      const product = catalog.find(candidate => candidate.id === item.productId && candidate.status === 'active')
      if (!product) throw new Error('One or more products are no longer available.')
      const variant = product.variants.find(candidate => candidate.id === item.variantId)
      if (!variant) throw new Error('One or more product variants are no longer available.')

      const available = getAvailableStock(variant.id)
      if (item.quantity > available) throw new Error(`Insufficient inventory for ${product.title}. Available: ${available}`)

      const reservation = createReservation(variant.id, item.quantity, quoteId)
      if (!reservation) throw new Error(`Could not reserve inventory for ${product.title}.`)

      reservationIds.push(reservation.id)

      return {
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        variantLabel: variant.label,
        quantity: item.quantity,
        unitPriceNgn: variant.priceNgn,
        lineTotalNgn: variant.priceNgn * item.quantity,
        storeId: product.storeId,
        vendorId: product.vendorId,
        reservationId: reservation.id,
      }
    })

    const subtotalNgn = items.reduce((sum, item) => sum + item.lineTotalNgn, 0)
    const platformFeeNgn = calculateCommission(subtotalNgn, PLATFORM_COMMISSION_RATE)
    const shippingNgn = 0

    const quote: CheckoutQuote = {
      quoteId,
      currency: parsed.currency,
      expiresAt: new Date(now + CHECKOUT_QUOTE_TTL_MS).toISOString(),
      items,
      subtotalNgn,
      platformFeeNgn,
      shippingNgn,
      totalNgn: subtotalNgn + shippingNgn,
      dataMode: 'development-fixture',
    }
    checkoutQuotes.set(quote.quoteId, quote)
    void saveDocument('checkoutQuotes', quote.quoteId, { ...structuredClone(quote) })
    return quote
  } catch (error) {
    for (const reservationId of reservationIds) {
      releaseReservation(reservationId)
    }
    throw error
  }
}

export const prepareCheckout: RequestHandler = (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Data-Mode', 'development-fixture')

  const idempotencyKey = req.header('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 128) {
    res.status(400).json({ success: false, error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid Idempotency-Key header is required.' }, requestId: res.locals.requestId })
    return
  }

  const parsed = checkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The checkout request is invalid.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
    return
  }

  try {
    const quote = buildCheckoutQuote(parsed.data, idempotencyKey)
    res.json({ success: true, data: quote, requestId: res.locals.requestId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The checkout quote could not be prepared.'
    res.status(409).json({ success: false, error: { code: 'CHECKOUT_UNAVAILABLE', message }, requestId: res.locals.requestId })
  }
}


export function getCheckoutQuote(quoteId: string, now = Date.now()): CheckoutQuote | null {
  const quote = checkoutQuotes.get(quoteId)
  if (!quote) return null
  if (new Date(quote.expiresAt).getTime() <= now) {
    for (const item of quote.items) {
      if (item.reservationId) releaseReservation(item.reservationId)
    }
    checkoutQuotes.delete(quoteId)
    return null
  }
  return quote
}

export function clearCheckoutQuotes(): void {
  for (const quote of checkoutQuotes.values()) {
    for (const item of quote.items) {
      if (item.reservationId) releaseReservation(item.reservationId)
    }
  }
  checkoutQuotes.clear()
}
