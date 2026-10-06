import type { ApiErrorBody } from '../types'
import { getFirebaseAuth } from '../firebase-client'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  const auth = getFirebaseAuth()
  if (auth?.currentUser) {
    const token = await auth.currentUser.getIdToken()
    headers.set('Authorization', `Bearer ${token}`)
  } else if (import.meta.env.DEV) {
    headers.set('X-Demo-Role', 'vendor')
    headers.set('X-Demo-Vendor-Id', 'vendor_dev_amina')
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null
    throw new Error(body?.error.message ?? 'The request could not be completed.')
  }

  const payload = await response.json() as { success?: boolean; data?: T; error?: ApiErrorBody['error'] }
  if (payload && payload.success === true && 'data' in payload) return payload.data as T
  return payload as T
}


export interface CatalogVariant {
  id: string
  label: string
  priceNgn: number
  stock: number
  lowStockThreshold?: number
}

export interface CatalogProduct {
  id: string
  storeId: string
  vendorId: string
  title: string
  slug: string
  description: string
  priceNgn: number
  compareAtPriceNgn?: number
  category: string
  material: string
  accent: string
  status: 'draft' | 'active' | 'archived' | 'out_of_stock'
  mediaIds: string[]
  mediaUrls: string[]
  variants: CatalogVariant[]
  createdAt: string
  updatedAt: string
}

export interface CatalogStore {
  id: string
  vendorId: string
  slug: string
  name: string
  status: 'draft' | 'published' | 'suspended'
}

export async function getCatalogStore(slug: string): Promise<CatalogStore> {
  return apiRequest<CatalogStore>(`/catalog/stores/${encodeURIComponent(slug)}`)
}

export async function getCatalogProducts(params: { storeSlug?: string; q?: string; category?: string } = {}): Promise<{ items: CatalogProduct[]; nextCursor: string | null }> {
  const search = new URLSearchParams()
  if (params.storeSlug) search.set('storeSlug', params.storeSlug)
  if (params.q) search.set('q', params.q)
  if (params.category) search.set('category', params.category)
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return apiRequest<{ items: CatalogProduct[]; nextCursor: string | null }>(`/catalog/products${suffix}`)
}

export async function getCatalogProduct(slug: string): Promise<CatalogProduct> {
  return apiRequest<CatalogProduct>(`/catalog/products/${encodeURIComponent(slug)}`)
}

export interface CheckoutQuoteItem {
  productId: string
  variantId: string
  title: string
  variantLabel: string
  quantity: number
  unitPriceNgn: number
  lineTotalNgn: number
  storeId: string
  vendorId: string
}

export interface CheckoutQuote {
  quoteId: string
  currency: 'NGN'
  expiresAt: string
  items: CheckoutQuoteItem[]
  subtotalNgn: number
  platformFeeNgn: number
  shippingNgn: number
  totalNgn: number
  dataMode: 'development-fixture'
}

export async function requestCheckoutQuote(items: Array<{ productId: string; variantId: string; quantity: number }>, idempotencyKey: string): Promise<CheckoutQuote> {
  return apiRequest<CheckoutQuote>('/checkout/quote', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ items, currency: 'NGN' }),
  })
}

export interface InitializePaymentInput {
  email: string
  callbackUrl: string
  quoteId: string
}

export interface InitializePaymentResult {
  authorizationUrl: string
  accessCode: string
  reference: string
  amountNgn: number
}

export async function initializePayment(input: InitializePaymentInput, idempotencyKey: string): Promise<InitializePaymentResult> {
  return apiRequest<InitializePaymentResult>('/checkout/initialize', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}

export interface OrderItem {
  productId: string
  variantId: string
  title: string
  variantLabel: string
  quantity: number
  unitPriceNgn: number
  lineTotalNgn: number
  vendorId: string
}

export interface Order {
  id: string
  quoteId: string
  paymentRef: string
  status: string
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  subtotalNgn: number
  platformFeeNgn: number
  shippingNgn: number
  totalNgn: number
  userId: string
  userRole: string
  paidAt: string | null
  currency: 'NGN'
}

export interface LedgerEntry {
  id: string
  orderId: string
  type: 'payment' | 'platform_fee' | 'vendor_amount'
  amountNgn: number
  currency: string
  vendorId: string | null
  createdAt: string
  description: string
}

export interface CustomerOrdersResponse {
  items: Order[]
}

export async function getCustomerOrders(): Promise<CustomerOrdersResponse> {
  return apiRequest<CustomerOrdersResponse>('/orders')
}

export async function getCustomerOrder(orderId: string): Promise<OrderDetailResponse> {
  return apiRequest<OrderDetailResponse>(`/orders/${encodeURIComponent(orderId)}`)
}

export interface VendorOrdersResponse {
  items: Order[]
}

export interface OrderDetailResponse {
  order: Order
  ledger: LedgerEntry[]
}

export async function getVendorOrders(vendorId: string): Promise<VendorOrdersResponse> {
  return apiRequest<VendorOrdersResponse>(`/vendor/orders?vendorId=${encodeURIComponent(vendorId)}`)
}

export async function getOrderDetail(orderId: string): Promise<OrderDetailResponse> {
  return apiRequest<OrderDetailResponse>(`/vendor/orders/${encodeURIComponent(orderId)}`)
}

export interface TransitionOrderInput {
  newStatus: 'PROCESSING' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'SETTLEMENT_PENDING' | 'SETTLED' | 'CANCELLED' | 'REFUND_PENDING' | 'DISPUTED'
}

export async function transitionOrder(orderId: string, newStatus: TransitionOrderInput['newStatus']): Promise<{ order: Order }> {
  return apiRequest<{ order: Order }>(`/vendor/orders/${encodeURIComponent(orderId)}/transition`, {
    method: 'POST',
    body: JSON.stringify({ newStatus }),
  })
}

export interface SignedUploadUrl {
  uploadUrl: string
  objectKey: string
  expiresAt: string
  headers: Record<string, string>
  mediaId: string
}

export interface SignedDownloadUrl {
  downloadUrl: string
  objectKey: string
  expiresAt: string
}

export async function createUploadUrl(input: {
  filename: string
  mimeType: string
  size: number
  type: 'product' | 'vendor'
  vendorId: string
  ttlSeconds?: number
}): Promise<SignedUploadUrl> {
  return apiRequest<SignedUploadUrl>('/media/upload-url', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function completeUpload(mediaId: string): Promise<{ mediaId: string; objectKey: string; status: 'ready' }> {
  return apiRequest<{ mediaId: string; objectKey: string; status: 'ready' }>('/media/complete', {
    method: 'POST',
    body: JSON.stringify({ mediaId }),
  })
}

export async function deleteMedia(mediaId: string): Promise<{ mediaId: string; status: 'deleted' }> {
  return apiRequest<{ mediaId: string; status: 'deleted' }>(`/media/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE',
  })
}

export async function createDownloadUrl(objectKey: string, ttlSeconds?: number): Promise<SignedDownloadUrl> {
  return apiRequest<SignedDownloadUrl>('/media/download-url', {
    method: 'POST',
    body: JSON.stringify({ objectKey, ttlSeconds }),
  })
}

export async function uploadFileToR2(uploadUrl: string, file: File, headers: Record<string, string>): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: headers,
    body: file,
  })
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`)
  }
}


export interface VendorProductVariant {
  id: string
  label: string
  priceNgn: number
  stock: number
  lowStockThreshold: number
}

export interface VendorProduct {
  id: string
  storeId: string
  vendorId: string
  title: string
  slug: string
  description: string
  priceNgn: number
  compareAtPriceNgn?: number
  category: string
  material: string
  accent: string
  status: 'draft' | 'active' | 'archived' | 'out_of_stock'
  mediaIds: string[]
  variants: VendorProductVariant[]
  createdAt: string
  updatedAt: string
}

export async function getVendorProducts(vendorId: string): Promise<{ items: VendorProduct[] }> {
  return apiRequest<{ items: VendorProduct[] }>(`/vendor/products?vendorId=${encodeURIComponent(vendorId)}`)
}

export async function createVendorProduct(input: Omit<VendorProduct, 'id' | 'createdAt' | 'updatedAt' | 'slug'> & { slug?: string }): Promise<{ product: VendorProduct }> {
  return apiRequest<{ product: VendorProduct }>('/vendor/products', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateVendorProduct(productId: string, patch: Partial<Pick<VendorProduct, 'title' | 'slug' | 'description' | 'priceNgn' | 'compareAtPriceNgn' | 'category' | 'material' | 'accent' | 'status' | 'mediaIds'>>): Promise<{ product: VendorProduct }> {
  return apiRequest<{ product: VendorProduct }>(`/vendor/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function adjustVendorInventory(productId: string, variantId: string, input: { type: 'restock' | 'damage' | 'loss' | 'adjustment' | 'sale' | 'return'; quantity: number; reason: string; referenceId?: string | null }): Promise<{ product: VendorProduct }> {
  return apiRequest<{ product: VendorProduct }>(`/vendor/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/inventory`, { method: 'POST', body: JSON.stringify(input) })
}

export async function setVendorStockThreshold(productId: string, variantId: string, threshold: number): Promise<{ product: VendorProduct }> {
  return apiRequest<{ product: VendorProduct }>(`/vendor/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/threshold`, { method: 'PATCH', body: JSON.stringify({ threshold }) })
}

export async function attachProductMedia(productId: string, mediaId: string): Promise<{ product: VendorProduct }> {
  return apiRequest<{ product: VendorProduct }>(`/vendor/products/${encodeURIComponent(productId)}/media`, { method: 'POST', body: JSON.stringify({ mediaId }) })
}

export async function detachProductMedia(productId: string, mediaId: string): Promise<{ product: VendorProduct }> {
  return apiRequest<{ product: VendorProduct }>(`/vendor/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`, { method: 'DELETE' })
}

export interface VendorSettlement {
  vendorId: string
  currency: 'NGN'
  grossSalesNgn: number
  platformFeesNgn: number
  refundsNgn: number
  adjustmentsNgn: number
  pendingNgn: number
  availableNgn: number
  paidOutNgn: number
  generatedAt: string
}

export interface VendorPayout {
  id: string
  vendorId: string
  amountNgn: number
  status: 'requested' | 'processing' | 'paid' | 'failed' | 'cancelled'
  requestedBy: string
  destinationId: string | null
  note: string
  createdAt: string
  updatedAt: string
  paidAt: string | null
}

export async function getVendorSettlement(vendorId: string): Promise<{ settlement: VendorSettlement; payouts: VendorPayout[] }> {
  return apiRequest(`/vendor/settlements?vendorId=${encodeURIComponent(vendorId)}`)
}

export async function requestVendorPayout(input: { amountNgn: number; destinationId?: string | null; note?: string }, idempotencyKey: string): Promise<{ payout: VendorPayout }> {
  return apiRequest('/vendor/settlements/payouts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })
}
