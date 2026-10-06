import express from 'express'
import helmet from 'helmet'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { config } from './config.js'
import { isR2Configured } from './r2.js'
import { errorHandler, notFound, requestId, authenticate, optionalAuthenticate, requireRole, requireVendorAccess } from './middleware.js'
import { getProducts, getProduct, getStore } from './catalog.js'
import { corsAllowlist, rateLimit } from './security.js'
import { createPaystackWebhookHandler, initializePaystackPayment, type InitializePaymentInput } from './paystack.js'
import { prepareCheckout, getCheckoutQuote, hydrateCheckoutQuotes } from './checkout.js'
import { verifyIdToken, getFirebaseAdmin, type FirebaseUser } from './firebase-admin.js'
import { checkoutSchema } from './validation.js'
import { initializeDemoInventory } from './fixtures.js'
import { initializeProducts, hydrateProducts, listProducts, getManagedProduct, createProduct, updateProduct, adjustVariantStock, setVariantThreshold, getVariantAdjustments, attachMedia, detachMedia } from './products.js'
import { hydrateInventory } from './inventory.js'
import { hydrateOrders } from './orders.js'
import { hydrateRefunds, requestRefund, initiatePaystackRefund, completeRefund, getRefund, getRefundsForOrder } from './refunds.js'
import { getAdminOverview } from './admin.js'
import { hydrateSettlements, calculateVendorSettlement, getPayoutsForVendor, getAllPayouts, requestPayout, updatePayoutStatus } from './settlements.js'

export function createApp() {
  const app = express()

  initializeDemoInventory()
  initializeProducts()
  const persistenceReady = Promise.all([hydrateInventory(), hydrateProducts(), hydrateOrders(), hydrateCheckoutQuotes(), hydrateRefunds(), hydrateSettlements()]).catch(error => {
    console.error('Persistent data hydration failed:', error)
  })

  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false }))
  app.use(requestId)
  app.post('/api/v1/paystack/webhook', express.raw({ type: 'application/json', limit: '256kb' }), rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'paystack-webhook' }), createPaystackWebhookHandler(config.PAYSTACK_SECRET_KEY))
  app.use(express.json({ limit: '100kb' }))
  app.use(corsAllowlist(config.WEB_ORIGIN))
  app.use('/api', rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'api' }))
  app.use(async (_req, _res, next) => { await persistenceReady; next() })

  app.get('/health', (_req, res) => res.json({ success: true, service: 'avendor-hub-api', status: 'ok', environment: config.NODE_ENV }))
  app.get('/ready', (_req, res) => res.json({ success: true, ready: true, integrations: { firebase: config.FIREBASE_PROJECT_ID ? 'admin-sdk-configured' : 'not_configured', paystack: config.PAYSTACK_SECRET_KEY ? 'signature-configured-processing-disabled' : 'not_configured', r2: isR2Configured() ? 'configured' : 'not_configured', ai: 'not_configured' } }))

  app.get('/api/v1/status', (_req, res) => res.json({ success: true, data: { mode: 'development', message: 'API foundation is running. Commerce integrations are not enabled.' }, requestId: res.locals.requestId }))
  app.get('/api/v1/vendor/settlements', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), requireVendorAccess('vendorId'), (req, res) => {
    const requestedVendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : undefined
    const vendorId = requestedVendorId ?? req.user!.vendorId
    if (!vendorId) {
      res.status(400).json({ success: false, error: { code: 'VENDOR_REQUIRED', message: 'A vendorId is required.' }, requestId: res.locals.requestId })
      return
    }
    res.json({ success: true, data: { settlement: calculateVendorSettlement(vendorId), payouts: getPayoutsForVendor(vendorId) }, requestId: res.locals.requestId })
  })

  const payoutRequestSchema = z.object({ amountNgn: z.number().int().positive().max(100_000_000), destinationId: z.string().trim().max(200).nullable().optional(), note: z.string().trim().max(500).optional() }).strict()
  app.post('/api/v1/vendor/settlements/payouts', authenticate, requireRole('vendor', 'vendor_staff'), requireVendorAccess('vendorId'), async (req, res) => {
    const parsed = payoutRequestSchema.safeParse(req.body)
    const idempotencyKey = req.header('Idempotency-Key')?.trim()
    if (!idempotencyKey || idempotencyKey.length > 200) {
      res.status(400).json({ success: false, error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid Idempotency-Key header is required.' }, requestId: res.locals.requestId })
      return
    }
    if (!parsed.success || !req.user!.vendorId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payout request.', fields: parsed.success ? undefined : parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const payout = await requestPayout(req.user!.vendorId, parsed.data.amountNgn, req.user!.uid, parsed.data.destinationId ?? null, parsed.data.note ?? '', idempotencyKey)
      res.status(202).json({ success: true, data: { payout }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'PAYOUT_REQUEST_FAILED', message: error instanceof Error ? error.message : 'Payout request failed.' }, requestId: res.locals.requestId })
    }
  })

  app.get('/api/v1/admin/payouts', authenticate, requireRole('admin', 'super_admin'), (_req, res) => {
    res.json({ success: true, data: { payouts: getAllPayouts() }, requestId: res.locals.requestId })
  })

  app.post('/api/v1/admin/payouts/:payoutId/process', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
    const action = z.object({ status: z.enum(['processing', 'paid', 'failed', 'cancelled']) }).safeParse(req.body)
    if (!action.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A valid payout status is required.', fields: action.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const payout = await updatePayoutStatus(req.params.payoutId, action.data.status)
      res.json({ success: true, data: { payout }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'PAYOUT_UPDATE_FAILED', message: error instanceof Error ? error.message : 'Payout could not be updated.' }, requestId: res.locals.requestId })
    }
  })

  app.get('/api/v1/admin/overview', authenticate, requireRole('admin', 'super_admin'), async (_req, res) => {
    try {
      res.json({ success: true, data: await getAdminOverview(), requestId: res.locals.requestId })
    } catch (error) {
      res.status(500).json({ success: false, error: { code: 'ADMIN_OVERVIEW_FAILED', message: error instanceof Error ? error.message : 'Admin overview unavailable.' }, requestId: res.locals.requestId })
    }
  })
  app.get('/api/v1/catalog/stores/:slug', getStore)
  app.get('/api/v1/catalog/products', getProducts)
  app.get('/api/v1/catalog/products/:slug', getProduct)

  const productStatusSchema = z.enum(['draft', 'active', 'archived', 'out_of_stock'])
  const productVariantSchema = z.object({
    id: z.string().trim().max(128).optional(),
    label: z.string().trim().min(1).max(120),
    priceNgn: z.number().int().positive().max(100_000_000),
    stock: z.number().int().min(0).max(100_000),
    lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
  }).strict()
  const productWriteSchema = z.object({
    storeId: z.string().trim().min(1).max(128),
    vendorId: z.string().trim().min(1).max(128),
    title: z.string().trim().min(2).max(180),
    slug: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(5000).default(''),
    priceNgn: z.number().int().positive().max(100_000_000),
    compareAtPriceNgn: z.number().int().positive().max(100_000_000).optional(),
    category: z.string().trim().min(1).max(120),
    material: z.string().trim().max(120).default(''),
    accent: z.string().trim().max(32).default('#10b981'),
    status: productStatusSchema.optional(),
    mediaIds: z.array(z.string().trim().min(1).max(128)).max(20).default([]),
    variants: z.array(productVariantSchema).min(1).max(100),
  }).strict()
  const productPatchSchema = productWriteSchema.partial().omit({ vendorId: true, storeId: true, variants: true })
  const inventoryAdjustmentSchema = z.object({
    type: z.enum(['restock', 'damage', 'loss', 'adjustment', 'sale', 'return']),
    quantity: z.number().int().positive().max(100_000),
    reason: z.string().trim().min(2).max(500),
    referenceId: z.string().trim().max(128).nullable().optional(),
  }).strict()
  const thresholdSchema = z.object({ threshold: z.number().int().min(0).max(100_000) }).strict()
  const mediaAttachSchema = z.object({ mediaId: z.string().trim().min(1).max(128) }).strict()

  const productAccess = requireRole('vendor', 'vendor_staff', 'admin', 'super_admin')
  const productLimit = rateLimit({ windowMs: 60_000, max: 90, keyPrefix: 'vendor-products' })

  app.get('/api/v1/vendor/products', authenticate, productAccess, productLimit, (req, res) => {
    const vendorId = (req.query.vendorId as string | undefined) || req.user!.vendorId
    if (!vendorId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Vendor ID required.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this vendor.' }, requestId: res.locals.requestId })
      return
    }
    res.json({ success: true, data: { items: listProducts(vendorId) }, requestId: res.locals.requestId })
  })

  app.post('/api/v1/vendor/products', authenticate, productAccess, productLimit, async (req, res) => {
    const parsed = productWriteSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid product.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== parsed.data.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this vendor.' }, requestId: res.locals.requestId })
      return
    }
    try {
      const product = createProduct(parsed.data)
      res.status(201).json({ success: true, data: { product }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'PRODUCT_CREATE_FAILED', message: error instanceof Error ? error.message : 'Product could not be created.' }, requestId: res.locals.requestId })
    }
  })

  app.get('/api/v1/vendor/products/:productId', authenticate, productAccess, productLimit, (req, res) => {
    const product = getManagedProduct(req.params.productId)
    if (!product) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== product.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this product.' }, requestId: res.locals.requestId })
      return
    }
    res.json({ success: true, data: { product }, requestId: res.locals.requestId })
  })

  app.patch('/api/v1/vendor/products/:productId', authenticate, productAccess, productLimit, (req, res) => {
    const existing = getManagedProduct(req.params.productId)
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== existing.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this product.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = productPatchSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid product update.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const product = updateProduct(existing.id, parsed.data)
      res.json({ success: true, data: { product }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'PRODUCT_UPDATE_FAILED', message: error instanceof Error ? error.message : 'Product could not be updated.' }, requestId: res.locals.requestId })
    }
  })

  app.post('/api/v1/vendor/products/:productId/variants/:variantId/inventory', authenticate, productAccess, productLimit, (req, res) => {
    const product = getManagedProduct(req.params.productId)
    if (!product) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== product.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this product.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = inventoryAdjustmentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid inventory adjustment.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const updated = adjustVariantStock(product.id, req.params.variantId, parsed.data.type, parsed.data.quantity, parsed.data.reason, parsed.data.referenceId ?? null)
      res.json({ success: true, data: { product: updated }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'INVENTORY_ADJUSTMENT_FAILED', message: error instanceof Error ? error.message : 'Inventory adjustment failed.' }, requestId: res.locals.requestId })
    }
  })

  app.get('/api/v1/vendor/products/:productId/variants/:variantId/inventory/adjustments', authenticate, productAccess, productLimit, (req, res) => {
    const product = getManagedProduct(req.params.productId)
    if (!product || !product.variants.some(variant => variant.id === req.params.variantId)) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variant not found.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== product.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this product.' }, requestId: res.locals.requestId })
      return
    }
    res.json({ success: true, data: { items: getVariantAdjustments(product.id, req.params.variantId) }, requestId: res.locals.requestId })
  })

  app.patch('/api/v1/vendor/products/:productId/variants/:variantId/threshold', authenticate, productAccess, productLimit, (req, res) => {
    const product = getManagedProduct(req.params.productId)
    if (!product) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== product.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this product.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = thresholdSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid stock threshold.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const updated = setVariantThreshold(product.id, req.params.variantId, parsed.data.threshold)
      res.json({ success: true, data: { product: updated }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'THRESHOLD_UPDATE_FAILED', message: error instanceof Error ? error.message : 'Threshold update failed.' }, requestId: res.locals.requestId })
    }
  })

  app.post('/api/v1/vendor/products/:productId/media', authenticate, productAccess, productLimit, async (req, res) => {
    const product = getManagedProduct(req.params.productId)
    if (!product) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== product.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this product.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = mediaAttachSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A valid mediaId is required.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    const { getMediaRecord, claimMediaForProduct } = await import('./media.js')
    const media = await getMediaRecord(parsed.data.mediaId)
    if (!media || media.vendorId !== product.vendorId || media.type !== 'product' || media.status !== 'ready') {
      res.status(409).json({ success: false, error: { code: 'MEDIA_NOT_READY', message: 'The media must belong to this vendor and be ready before attachment.' }, requestId: res.locals.requestId })
      return
    }
    try {
      await claimMediaForProduct(media.id, product.id)
      const updated = attachMedia(product.id, media.id)
      res.json({ success: true, data: { product: updated }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'MEDIA_ATTACH_FAILED', message: error instanceof Error ? error.message : 'Media could not be attached.' }, requestId: res.locals.requestId })
    }
  })

  app.delete('/api/v1/vendor/products/:productId/media/:mediaId', authenticate, productAccess, productLimit, (req, res) => {
    const product = getManagedProduct(req.params.productId)
    if (!product) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found.' }, requestId: res.locals.requestId })
      return
    }
    if (['vendor', 'vendor_staff'].includes(req.user!.role) && req.user!.vendorId !== product.vendorId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this product.' }, requestId: res.locals.requestId })
      return
    }
    const { releaseMediaFromProduct } = await import('./media.js')
    const updated = detachMedia(product.id, req.params.mediaId)
    await releaseMediaFromProduct(req.params.mediaId, product.id)
    res.json({ success: true, data: { product: updated }, requestId: res.locals.requestId })
  })
  app.post('/api/v1/checkout/quote', rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'checkout-quote' }), prepareCheckout)

  // Payment initialization from checkout quote
  const initializePaymentSchema = z.object({
    quoteId: z.string().trim().min(1).max(128),
    email: z.string().email(),
    callbackUrl: z.string().url(),
  }).strict()

  app.post('/api/v1/checkout/initialize', rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'checkout-init' }), authenticate, async (req, res) => {
    if (!config.PAYSTACK_SECRET_KEY) {
      res.status(503).json({ success: false, error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Payment provider is not configured.' }, requestId: res.locals.requestId })
      return
    }

    const parsed = initializePaymentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The payment initialization request is invalid.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }

    const { email, callbackUrl, quoteId } = parsed.data
    const quote = getCheckoutQuote(quoteId)
    if (!quote) {
      res.status(410).json({ success: false, error: { code: 'QUOTE_EXPIRED_OR_NOT_FOUND', message: 'The checkout quote is missing or expired. Please request a new quote.' }, requestId: res.locals.requestId })
      return
    }

    // Generate unique payment reference
    const paymentRef = `pay_${createHash('sha256').update(`${req.user!.uid}:${quote.quoteId}:${Date.now()}`).digest('hex').slice(0, 24)}`

    try {
      const paymentInput: InitializePaymentInput = {
        email,
        amountNgn: quote.totalNgn,
        reference: paymentRef,
        callbackUrl,
        metadata: {
          userId: req.user!.uid,
          userRole: req.user!.role,
          quoteId: quote.quoteId,
          items: quote.items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            storeId: item.storeId,
            vendorId: item.vendorId,
            title: item.title,
            variantLabel: item.variantLabel,
            unitPriceNgn: item.unitPriceNgn,
            lineTotalNgn: item.lineTotalNgn,
          })),
        },
      }

      const payment = await initializePaystackPayment(config.PAYSTACK_SECRET_KEY, paymentInput)
      res.json({ success: true, data: { authorizationUrl: payment.authorizationUrl, accessCode: payment.accessCode, reference: payment.reference, amountNgn: quote.totalNgn }, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment initialization failed.'
      res.status(502).json({ success: false, error: { code: 'PAYMENT_INIT_FAILED', message }, requestId: res.locals.requestId })
    }
  })

  // Auth routes
  app.post('/api/v1/auth/verify', optionalAuthenticate, (req, res) => {
    if (!req.user) {
      res.json({ success: true, data: { authenticated: false } })
      return
    }
    res.json({ success: true, data: { authenticated: true, user: req.user } })
  })

  app.post('/api/v1/auth/custom-token', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
    const { uid, claims } = req.body as { uid: string; claims: Record<string, unknown> }
    if (!uid || !claims) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'uid and claims are required.' }, requestId: res.locals.requestId })
      return
    }
    try {
      const { adminAuth } = getFirebaseAdmin()
      const token = await adminAuth.createCustomToken(uid, claims)
      res.json({ success: true, data: { token } })
    } catch (e) {
      res.status(500).json({ success: false, error: { code: 'TOKEN_CREATION_FAILED', message: 'Could not create custom token.' }, requestId: res.locals.requestId })
    }
  })

  app.post('/api/v1/auth/set-claims', authenticate, requireRole('super_admin'), async (req, res) => {
    const { uid, claims } = req.body as { uid: string; claims: Record<string, unknown> }
    if (!uid || !claims) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'uid and claims are required.' }, requestId: res.locals.requestId })
      return
    }
    try {
      const { adminAuth } = getFirebaseAdmin()
      await adminAuth.setCustomUserClaims(uid, claims)
      res.json({ success: true, data: { message: 'Custom claims updated.' } })
    } catch (e) {
      res.status(500).json({ success: false, error: { code: 'CLAIMS_UPDATE_FAILED', message: 'Could not update custom claims.' }, requestId: res.locals.requestId })
    }
  })

  // Protected route example
  app.get('/api/v1/me', authenticate, (req, res) => {
    res.json({ success: true, data: { user: req.user } })
  })

  // Customer order endpoints
  const customerOrderRateLimit = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'customer-orders' })

  app.get('/api/v1/orders', authenticate, customerOrderRateLimit, (req, res) => {
    const { getOrdersByUser } = require('./orders.js')
    const orders = getOrdersByUser(req.user!.uid)
      .sort((a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt))
    res.json({ success: true, data: { items: orders }, requestId: res.locals.requestId })
  })

  app.get('/api/v1/orders/:orderId', authenticate, customerOrderRateLimit, (req, res) => {
    const { getOrder, getLedgerForOrder } = require('./orders.js')
    const order = getOrder(req.params.orderId)
    if (!order) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found.' }, requestId: res.locals.requestId })
      return
    }
    const isPrivileged = ['admin', 'super_admin'].includes(req.user!.role)
    if (!isPrivileged && order.userId !== req.user!.uid) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this order.' }, requestId: res.locals.requestId })
      return
    }
    res.json({ success: true, data: { order, ledger: isPrivileged ? getLedgerForOrder(order.id) : [] }, requestId: res.locals.requestId })
  })

  const refundRequestSchema = z.object({ amountNgn: z.number().int().positive().max(100_000_000), reason: z.string().trim().min(3).max(500) }).strict()

  app.get('/api/v1/orders/:orderId/refunds', authenticate, customerOrderRateLimit, (req, res) => {
    const { getOrder } = require('./orders.js')
    const order = getOrder(req.params.orderId)
    if (!order) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found.' }, requestId: res.locals.requestId }); return }
    const privileged = ['admin', 'super_admin'].includes(req.user!.role)
    if (!privileged && order.userId !== req.user!.uid) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this order.' }, requestId: res.locals.requestId }); return }
    res.json({ success: true, data: { items: getRefundsForOrder(order.id) }, requestId: res.locals.requestId })
  })

  app.post('/api/v1/orders/:orderId/refunds', authenticate, customerOrderRateLimit, async (req, res) => {
    const { getOrder } = require('./orders.js')
    const order = getOrder(req.params.orderId)
    if (!order) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found.' }, requestId: res.locals.requestId }); return }
    if (order.userId !== req.user!.uid && !['admin', 'super_admin'].includes(req.user!.role)) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this order.' }, requestId: res.locals.requestId }); return }
    const parsed = refundRequestSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid refund request.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId }); return }
    try {
      const refund = await requestRefund(order.id, parsed.data.amountNgn, parsed.data.reason, req.user!.uid)
      res.status(202).json({ success: true, data: { refund }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(409).json({ success: false, error: { code: 'REFUND_REQUEST_FAILED', message: error instanceof Error ? error.message : 'Refund request failed.' }, requestId: res.locals.requestId })
    }
  })

  app.post('/api/v1/admin/refunds/:refundId/process', authenticate, requireRole('admin', 'super_admin'), customerOrderRateLimit, async (req, res) => {
    if (!config.PAYSTACK_SECRET_KEY) { res.status(503).json({ success: false, error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Payment provider is not configured.' }, requestId: res.locals.requestId }); return }
    const refund = getRefund(req.params.refundId)
    if (!refund) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Refund not found.' }, requestId: res.locals.requestId }); return }
    try {
      const queued = await initiatePaystackRefund(config.PAYSTACK_SECRET_KEY, refund)
      res.status(202).json({ success: true, data: { refund: queued }, requestId: res.locals.requestId })
    } catch (error) {
      res.status(502).json({ success: false, error: { code: 'REFUND_PROVIDER_FAILED', message: error instanceof Error ? error.message : 'Refund provider request failed.' }, requestId: res.locals.requestId })
    }
  })

  // Vendor order endpoints
  const vendorOrderRateLimit = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'vendor-orders' })

  app.get('/api/v1/vendor/orders', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), vendorOrderRateLimit, requireVendorAccess('vendorId'), (req, res) => {
    const vendorId = req.query.vendorId as string || req.user!.vendorId
    if (!vendorId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Vendor ID required.' }, requestId: res.locals.requestId })
      return
    }
    const { getOrdersByVendor } = require('./orders.js')
    const orders = getOrdersByVendor(vendorId)
    res.json({ success: true, data: { items: orders }, requestId: res.locals.requestId })
  })

  app.get('/api/v1/vendor/orders/:orderId', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), vendorOrderRateLimit, (req, res) => {
    const { getOrderByPaymentRef, getOrderByQuoteId, getLedgerForOrder } = require('./orders.js')
    const orderId = req.params.orderId
    let order = getOrderByPaymentRef(orderId) || getOrderByQuoteId(orderId)
    if (!order) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found.' }, requestId: res.locals.requestId })
      return
    }
    // Check vendor access
    if (req.user!.role === 'vendor' || req.user!.role === 'vendor_staff') {
      const hasAccess = order.items.some((item: { vendorId: string }) => item.vendorId === req.user!.vendorId)
      if (!hasAccess) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this order.' }, requestId: res.locals.requestId })
        return
      }
    }
    const ledger = getLedgerForOrder(order.id)
    res.json({ success: true, data: { order, ledger }, requestId: res.locals.requestId })
  })

  const transitionSchema = z.object({
    newStatus: z.enum(['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'SETTLEMENT_PENDING', 'SETTLED', 'CANCELLED', 'REFUND_PENDING', 'DISPUTED']),
  }).strict()

  app.post('/api/v1/vendor/orders/:orderId/transition', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), vendorOrderRateLimit, async (req, res) => {
    const { transitionOrder } = require('./orders.js')
    const orderId = req.params.orderId
    const parsed = transitionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid transition.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const order = transitionOrder(orderId, parsed.data.newStatus)
      res.json({ success: true, data: { order }, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transition failed.'
      res.status(409).json({ success: false, error: { code: 'INVALID_TRANSITION', message }, requestId: res.locals.requestId })
    }
  })

  // Cloudflare R2 signed URL endpoints
  const r2RateLimit = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'r2' })

  const uploadUrlSchema = z.object({
    vendorId: z.string().min(1).max(128),
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1),
    size: z.number().int().positive().max(50 * 1024 * 1024),
    type: z.enum(['product', 'vendor']),
    ttlSeconds: z.number().int().positive().max(86400).optional(),
  }).strict()

  app.post('/api/v1/media/upload-url', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), r2RateLimit, requireVendorAccess('vendorId'), async (req, res) => {
    const { createSignedUploadUrl, isR2Configured } = await import('./r2.js')
    const { createPendingMedia } = await import('./media.js')
    if (!isR2Configured()) {
      res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Media storage not configured.' }, requestId: res.locals.requestId })
      return
    }
    const vendorId = (req.body?.vendorId as string | undefined) || (req.query.vendorId as string | undefined) || req.user!.vendorId
    if (!vendorId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Vendor ID required.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = uploadUrlSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid upload request.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const result = await createSignedUploadUrl(vendorId, parsed.data.type, parsed.data.filename, parsed.data.mimeType, parsed.data.size, parsed.data.ttlSeconds)
      const media = await createPendingMedia({
        vendorId,
        objectKey: result.objectKey,
        type: parsed.data.type,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        size: parsed.data.size,
        createdBy: req.user!.uid,
      })
      res.json({ success: true, data: { ...result, mediaId: media.id }, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create upload URL.'
      res.status(400).json({ success: false, error: { code: 'UPLOAD_URL_FAILED', message }, requestId: res.locals.requestId })
    }
  })

  const completeUploadSchema = z.object({
    mediaId: z.string().min(1).max(128),
  }).strict()

  const cleanupMediaSchema = z.object({
    olderThanMinutes: z.number().int().min(1).max(10080).default(60),
    limit: z.number().int().min(1).max(500).default(100),
  }).strict()

  // Operational trigger for a scheduler (Cloud Scheduler, cron, queue worker, etc.).
  // Kept admin-only so it cannot be abused as a storage deletion primitive.
  app.post('/api/v1/media/cleanup', authenticate, requireRole('admin', 'super_admin'), r2RateLimit, async (req, res) => {
    const { cleanupExpiredPendingMedia } = await import('./media-cleanup.js')
    const parsed = cleanupMediaSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid cleanup request.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    try {
      const result = await cleanupExpiredPendingMedia(parsed.data.olderThanMinutes * 60_000, parsed.data.limit)
      res.json({ success: true, data: result, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Media cleanup failed.'
      res.status(503).json({ success: false, error: { code: 'MEDIA_CLEANUP_FAILED', message }, requestId: res.locals.requestId })
    }
  })

  app.post('/api/v1/media/complete', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), r2RateLimit, async (req, res) => {
    const { canAccessObjectKey, headObject, isR2Configured } = await import('./r2.js')
    const { getMediaRecord, markMediaFailed, markMediaReady } = await import('./media.js')
    if (!isR2Configured()) {
      res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Media storage not configured.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = completeUploadSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid media completion request.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    const media = await getMediaRecord(parsed.data.mediaId)
    if (!media || !canAccessObjectKey(media.objectKey, req.user!)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this media record.' }, requestId: res.locals.requestId })
      return
    }
    if (media.status !== 'pending') {
      res.status(409).json({ success: false, error: { code: 'INVALID_STATE', message: `Media is already ${media.status}.` }, requestId: res.locals.requestId })
      return
    }
    try {
      const object = await headObject(media.objectKey)
      if (object.contentLength !== media.size || object.contentType !== media.mimeType) {
        await markMediaFailed(media.id)
        res.status(422).json({ success: false, error: { code: 'MEDIA_MISMATCH', message: 'Uploaded object metadata does not match the requested upload.' }, requestId: res.locals.requestId })
        return
      }
      await markMediaReady(media.id, { size: object.contentLength, mimeType: object.contentType })
      res.json({ success: true, data: { mediaId: media.id, objectKey: media.objectKey, status: 'ready' }, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to verify uploaded media.'
      res.status(400).json({ success: false, error: { code: 'MEDIA_VERIFICATION_FAILED', message }, requestId: res.locals.requestId })
    }
  })

  const retryUploadSchema = z.object({
    mediaId: z.string().min(1).max(128),
    ttlSeconds: z.number().int().positive().max(86400).optional(),
  }).strict()

  app.post('/api/v1/media/retry', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), r2RateLimit, async (req, res) => {
    const { createSignedUploadUrl, deleteObject, canAccessObjectKey, isR2Configured } = await import('./r2.js')
    const { getMediaRecord, markMediaPending } = await import('./media.js')
    if (!isR2Configured()) {
      res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Media storage not configured.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = retryUploadSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid retry request.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    const media = await getMediaRecord(parsed.data.mediaId)
    if (!media || !canAccessObjectKey(media.objectKey, req.user!)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this media record.' }, requestId: res.locals.requestId })
      return
    }
    if (media.status !== 'failed') {
      res.status(409).json({ success: false, error: { code: 'INVALID_STATE', message: 'Only failed media uploads can be retried.' }, requestId: res.locals.requestId })
      return
    }
    try {
      // Best-effort removal of a partially uploaded object before issuing a new key.
      try { await deleteObject(media.objectKey) } catch { /* object may not exist */ }
      const result = await createSignedUploadUrl(media.vendorId, media.type, media.filename, media.mimeType, media.size, parsed.data.ttlSeconds)
      await markMediaPending(media.id, result.objectKey)
      res.json({ success: true, data: { ...result, mediaId: media.id }, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry media upload.'
      res.status(400).json({ success: false, error: { code: 'UPLOAD_RETRY_FAILED', message }, requestId: res.locals.requestId })
    }
  })

  const deleteMediaSchema = z.object({
    mediaId: z.string().min(1).max(128),
  }).strict()

  app.delete('/api/v1/media/:mediaId', authenticate, requireRole('vendor', 'vendor_staff', 'admin', 'super_admin'), r2RateLimit, async (req, res) => {
    const { canAccessObjectKey, deleteObject, isR2Configured } = await import('./r2.js')
    const { getMediaRecord, markMediaDeleted } = await import('./media.js')
    if (!isR2Configured()) {
      res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Media storage not configured.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = deleteMediaSchema.safeParse(req.params)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid media ID.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    const media = await getMediaRecord(parsed.data.mediaId)
    if (!media || !canAccessObjectKey(media.objectKey, req.user!)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this media record.' }, requestId: res.locals.requestId })
      return
    }
    if (media.status === 'deleted') {
      res.json({ success: true, data: { mediaId: media.id, status: 'deleted' }, requestId: res.locals.requestId })
      return
    }
    try {
      await deleteObject(media.objectKey)
      if (media.productId) {
        const product = getManagedProduct(media.productId)
        if (product) {
          detachMedia(product.id, media.id)
          const { releaseMediaFromProduct } = await import('./media.js')
          await releaseMediaFromProduct(media.id, product.id)
        }
      }
      await markMediaDeleted(media.id)
      res.json({ success: true, data: { mediaId: media.id, status: 'deleted' }, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete media.'
      res.status(400).json({ success: false, error: { code: 'MEDIA_DELETE_FAILED', message }, requestId: res.locals.requestId })
    }
  })

  const downloadUrlSchema = z.object({
    objectKey: z.string().min(1),
    ttlSeconds: z.number().int().positive().max(86400).optional(),
  }).strict()

  app.post('/api/v1/media/download-url', optionalAuthenticate, r2RateLimit, async (req, res) => {
    const { canAccessObjectKey, createPublicObjectUrl, createSignedDownloadUrl, isR2Configured, parseObjectKey } = await import('./r2.js')
    const { getMediaRecordByObjectKey } = await import('./media.js')
    if (!isR2Configured()) {
      res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Media storage not configured.' }, requestId: res.locals.requestId })
      return
    }
    const parsed = downloadUrlSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid download request.', fields: parsed.error.flatten().fieldErrors }, requestId: res.locals.requestId })
      return
    }
    const parsedKey = parseObjectKey(parsed.data.objectKey)
    if (!parsedKey) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this media object.' }, requestId: res.locals.requestId })
      return
    }
    const mediaSnap = await getMediaRecordByObjectKey(parsed.data.objectKey)
    if (!mediaSnap || mediaSnap.status !== 'ready') {
      res.status(404).json({ success: false, error: { code: 'MEDIA_NOT_READY', message: 'Media is not available.' }, requestId: res.locals.requestId })
      return
    }
    if (mediaSnap.visibility === 'private') {
      if (!req.user || !canAccessObjectKey(parsed.data.objectKey, req.user)) {
        res.status(req.user ? 403 : 401).json({ success: false, error: { code: req.user ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: 'Access denied to this private media.' }, requestId: res.locals.requestId })
        return
      }
    }
    try {
      const publicUrl = mediaSnap.visibility === 'public' ? createPublicObjectUrl(parsed.data.objectKey) : null
      if (publicUrl) {
        res.json({ success: true, data: { downloadUrl: publicUrl, objectKey: parsed.data.objectKey, expiresAt: null }, requestId: res.locals.requestId })
        return
      }
      const result = await createSignedDownloadUrl(parsed.data.objectKey, parsed.data.ttlSeconds)
      res.json({ success: true, data: result, requestId: res.locals.requestId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create download URL.'
      res.status(400).json({ success: false, error: { code: 'DOWNLOAD_URL_FAILED', message }, requestId: res.locals.requestId })
    }
  })

  app.use(notFound)
  app.use(errorHandler)

  return app
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(config.API_PORT, () => console.log(`AVENDOR HUB API listening on http://localhost:${config.API_PORT}`))
}
