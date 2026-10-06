import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyPaystackSignature } from '../server/paystack'

describe('Paystack webhook signature verification', () => {
  it('accepts the exact provider signature', () => {
    const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'ref_dev' } }))
    const signature = createHmac('sha512', 'test-secret').update(body).digest('hex')
    expect(verifyPaystackSignature(body, signature, 'test-secret')).toBe(true)
  })

  it('rejects a forged signature', () => {
    expect(verifyPaystackSignature(Buffer.from('{}'), 'forged', 'test-secret')).toBe(false)
  })
})
