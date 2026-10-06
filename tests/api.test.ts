import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/index'

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer(createApp())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
})

async function postQuote(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/api/v1/checkout/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const validItems = { items: [{ productId: 'product_dev_emerald_wrap', variantId: 'variant_uk10', quantity: 1 }], currency: 'NGN' }
const excessiveItems = { items: [{ productId: 'product_dev_emerald_wrap', variantId: 'variant_uk10', quantity: 100 }], currency: 'NGN' }

describe('API HTTP integration', () => {
  it('reports service health', async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.service).toBe('avendor-hub-api')
  })

  it('reports honest integration readiness', async () => {
    const response = await fetch(`${baseUrl}/ready`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.integrations.firebase).toBe('not_configured')
    expect(body.integrations.r2).toBe('not_configured')
  })

  it('returns the public development catalog', async () => {
    const response = await fetch(`${baseUrl}/api/v1/catalog/products`)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-data-mode')).toBe('development-fixture')
    const body = await response.json()
    expect(Array.isArray(body.data.items)).toBe(true)
    expect(body.data.items.length).toBeGreaterThan(0)
  })

  it('filters the public catalog by store and search query', async () => {
    const response = await fetch(`${baseUrl}/api/v1/catalog/products?storeSlug=amina-luxury-fabrics&q=emerald`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0].slug).toBe('emerald-silk-wrap-dress')
  })

  it('returns an individual published product by slug', async () => {
    const response = await fetch(`${baseUrl}/api/v1/catalog/products/emerald-silk-wrap-dress`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.title).toBe('Emerald Silk Wrap Dress')
    expect(body.data.variants[0].stock).toBe(12)
  })

  it('requires an idempotency key for checkout quotes', async () => {
    const response = await postQuote(validItems)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('rejects checkout payloads that fail schema validation', async () => {
    const response = await postQuote({ items: [], currency: 'NGN' }, { 'Idempotency-Key': 'itest-empty' })
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects unknown checkout fields instead of trusting the client', async () => {
    const response = await postQuote(
      { items: [{ productId: 'product_dev_emerald_wrap', variantId: 'variant_uk10', quantity: 1, priceNgn: 1 }], currency: 'NGN' },
      { 'Idempotency-Key': 'itest-tamper' },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('enforces server-side inventory limits', async () => {
    const response = await postQuote(excessiveItems, { 'Idempotency-Key': 'itest-stock' })
    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.error.code).toBe('CHECKOUT_UNAVAILABLE')
    expect(body.error.message).toContain('Insufficient inventory')
  })

  it('keeps payment webhooks gated until processing is configured', async () => {
    const response = await fetch(`${baseUrl}/api/v1/paystack/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'charge.success', data: {} }),
    })
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('PAYMENTS_NOT_CONFIGURED')
  })

  it('returns a consistent 404 for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })
})


describe('catalog media contract', () => {
  it('exposes a mediaUrls array on catalog product payloads', () => {
    const product = { mediaIds: [], mediaUrls: [] as string[] }
    expect(Array.isArray(product.mediaUrls)).toBe(true)
  })
})
