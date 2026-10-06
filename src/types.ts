export type UserRole = 'customer' | 'vendor' | 'vendor_staff' | 'admin' | 'super_admin'

export type ProductStatus = 'draft' | 'active' | 'archived' | 'out_of_stock'

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
  | 'DISPUTED'

export type FeatureKey = 'ai' | 'whatsapp' | 'payouts' | 'reviews' | 'manualTransfers' | 'advancedAnalytics'

export interface ProductVariant {
  id: string
  label: string
  priceNgn: number
  stock: number
}

export interface Product {
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
  status: ProductStatus
  images: string[]
  variants: ProductVariant[]
  rating?: number
  reviewCount?: number
}

export interface Store {
  id: string
  vendorId: string
  slug: string
  name: string
  description: string
  location: string
  accent: string
  status: 'draft' | 'published' | 'suspended'
  categories: string[]
}

export interface OrderSummary {
  id: string
  vendorId: string
  customerLabel: string
  itemLabel: string
  totalNgn: number
  status: OrderStatus
  createdAt: string
}

export interface ApiErrorBody {
  success: false
  error: { code: string; message: string; fields?: Record<string, string> }
  requestId: string
}
