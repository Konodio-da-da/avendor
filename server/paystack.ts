import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { RequestHandler } from 'express'
import { getOrderByPaymentRef, getOrderByQuoteId, isWebhookProcessed, finalizeSuccessfulPayment } from './orders.js'
import { getCheckoutQuote } from './checkout.js'

const eventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.record(z.unknown()),
}).passthrough()

export function verifyPaystackSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const provided = Buffer.from(signature, 'utf8')
  const calculated = Buffer.from(expected, 'utf8')
  return provided.length === calculated.length && timingSafeEqual(provided, calculated)
}

export interface InitializePaymentInput {
  email: string
  amountNgn: number
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
}

export interface InitializePaymentResult {
  authorizationUrl: string
  accessCode: string
  reference: string
}

export async function initializePaystackPayment(secret: string, input: InitializePaymentInput): Promise<InitializePaymentResult> {
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountNgn * 100,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      currency: 'NGN',
    }),
  })

  const data = await response.json()
  if (!data.status || !data.data?.authorization_url) {
    throw new Error(data.message ?? 'Paystack initialization failed')
  }
  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  }
}

export async function verifyPaystackTransaction(secret: string, reference: string): Promise<{ status: string; amount: number; paidAt: string | null; currency: string }> {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { 'Authorization': `Bearer ${secret}` },
  })
  const data = await response.json()
  if (!data.status || !data.data) {
    throw new Error(data.message ?? 'Paystack verification failed')
  }
  return {
    status: data.data.status,
    amount: data.data.amount,
    paidAt: data.data.paid_at,
    currency: data.data.currency,
  }
}

export function createPaystackWebhookHandler(secret?: string): RequestHandler {
  return (req, res) => {
    if (!secret) {
      res.status(503).json({ success: false, error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Payment webhooks are not enabled in this environment.' }, requestId: res.locals.requestId })
      return
    }

    const signature = req.header('x-paystack-signature')
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
    if (!signature || !verifyPaystackSignature(rawBody, signature, secret)) {
      res.status(401).json({ success: false, error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Webhook signature verification failed.' }, requestId: res.locals.requestId })
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      res.status(400).json({ success: false, error: { code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Webhook payload is invalid.' }, requestId: res.locals.requestId })
      return
    }

    const parsed = eventSchema.safeParse(payload)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Webhook payload is invalid.' }, requestId: res.locals.requestId })
      return
    }

    const event = parsed.data.event
    const data = parsed.data.data as Record<string, unknown>

    // Process charge.success events
    if (event === 'charge.success') {
      const reference = data.reference as string | undefined
      if (!reference) {
        res.status(400).json({ success: false, error: { code: 'INVALID_WEBHOOK_PAYLOAD', message: 'Missing reference in charge.success event.' }, requestId: res.locals.requestId })
        return
      }

      // Idempotency check
      if (isWebhookProcessed(reference, event)) {
        res.json({ success: true, data: { message: 'Webhook already processed.' }, requestId: res.locals.requestId })
        return
      }

      // Verify transaction with Paystack (re-verification)
      verifyPaystackTransaction(secret, reference)
        .then(verification => {
          if (verification.status !== 'success') {
            throw new Error(`Transaction not successful: ${verification.status}`)
          }
          if (verification.currency !== 'NGN') {
            throw new Error(`Unexpected payment currency: ${verification.currency}`)
          }

          const metadata = data.metadata as Record<string, unknown> | undefined
          const quoteId = metadata?.quoteId as string | undefined
          if (!quoteId) throw new Error('Missing checkout quote ID in payment metadata')
          const quote = getCheckoutQuote(quoteId)
          if (!quote) throw new Error('Checkout quote is missing or expired; payment requires manual reconciliation')
          if (verification.amount !== quote.totalNgn * 100) {
            throw new Error(`Payment amount mismatch: expected ${quote.totalNgn * 100}, received ${verification.amount}`)
          }

          if (!metadata?.userId) throw new Error('Missing user ID in payment metadata')

          const reservationIds = quote.items.map(item => item.reservationId).filter((id): id is string => Boolean(id))
          if (reservationIds.length !== quote.items.length) {
            throw new Error('Checkout reservation data is incomplete; payment requires manual reconciliation')
          }

          await finalizeSuccessfulPayment({
            quoteId: quote.quoteId,
            paymentRef: reference,
            userId: metadata.userId as string,
            userRole: (metadata.userRole as string) ?? 'customer',
            items: quote.items.map(({ reservationId: _reservationId, ...item }) => item),
            reservationIds,
            subtotalNgn: quote.subtotalNgn,
            platformFeeNgn: quote.platformFeeNgn,
            shippingNgn: quote.shippingNgn,
            totalNgn: quote.totalNgn,
            paidAt: verification.paidAt,
            webhookEvent: event,
            webhookPayload: parsed.data,
          })

          res.json({ success: true, data: { message: 'Webhook processed successfully.' }, requestId: res.locals.requestId })
        })
        .catch(error => {
          const message = error instanceof Error ? error.message : 'Webhook processing failed.'
          res.status(500).json({ success: false, error: { code: 'WEBHOOK_PROCESSING_FAILED', message }, requestId: res.locals.requestId })
        })
      return
    }

    // Other events: acknowledge but don't process yet
    res.json({ success: true, data: { message: `Event ${event} acknowledged.` }, requestId: res.locals.requestId })
  }
}