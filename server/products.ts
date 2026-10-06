import { randomUUID } from 'node:crypto'
import { demoCatalog } from './fixtures.js'
import { getInventory, initializeInventory, adjustInventory, getAdjustments, setLowStockThreshold } from './inventory.js'
import { getDocuments, saveDocument, isPersistentDataEnabled } from './persistence.js'

export type ManagedProductStatus = 'draft' | 'active' | 'archived' | 'out_of_stock'

export interface ManagedVariant {
  id: string
  label: string
  priceNgn: number
  stock: number
  lowStockThreshold: number
}

export interface ManagedProduct {
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
  status: ManagedProductStatus
  mediaIds: string[]
  variants: ManagedVariant[]
  createdAt: string
  updatedAt: string
}

const products = new Map<string, ManagedProduct>()

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function syncStatus(product: ManagedProduct): void {
  const totalStock = product.variants.reduce((sum, variant) => sum + (getInventory(variant.id)?.stock ?? variant.stock), 0)
  if (product.status === 'active' && totalStock <= 0) product.status = 'out_of_stock'
  if (product.status === 'out_of_stock' && totalStock > 0) product.status = 'active'
  product.variants = product.variants.map(variant => {
    const inventory = getInventory(variant.id)
    return inventory ? { ...variant, stock: inventory.stock, lowStockThreshold: inventory.lowStockThreshold } : variant
  })
}

export function initializeProducts(): void {
  products.clear()
  const now = new Date().toISOString()
  for (const product of demoCatalog) {
    const managed: ManagedProduct = {
      ...product,
      description: product.description,
      accent: product.accent,
      mediaIds: [],
      variants: product.variants.map(variant => ({ ...variant, lowStockThreshold: 3 })),
      createdAt: now,
      updatedAt: now,
    }
    products.set(managed.id, managed)
  }
}

export async function hydrateProducts(): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const docs = await getDocuments('products')
  for (const doc of docs) {
    const product = doc.data as unknown as ManagedProduct
    if (!product.id) product.id = doc.id
    products.set(doc.id, product)
  }
}

async function persistProduct(product: ManagedProduct): Promise<void> {
  await saveDocument('products', product.id, { ...structuredClone(product), persistedAt: new Date().toISOString() })
}

export function listProducts(vendorId: string): ManagedProduct[] {
  return [...products.values()].filter(product => product.vendorId === vendorId).map(product => {
    syncStatus(product)
    return structuredClone(product)
  })
}

export function getAllManagedProducts(): ManagedProduct[] {
  return [...products.values()].map(product => { syncStatus(product); return structuredClone(product) })
}

export function getManagedProduct(productId: string): ManagedProduct | null {
  const product = products.get(productId)
  if (!product) return null
  syncStatus(product)
  return structuredClone(product)
}

export function createProduct(input: Omit<ManagedProduct, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: ManagedProductStatus }): ManagedProduct {
  const now = new Date().toISOString()
  const id = `product_${randomUUID()}`
  const slugBase = slugify(input.slug || input.title)
  const slug = [...products.values()].some(product => product.vendorId === input.vendorId && product.slug === slugBase)
    ? `${slugBase}-${randomUUID().slice(0, 6)}`
    : slugBase
  const product: ManagedProduct = {
    ...input,
    id,
    slug,
    status: input.status ?? 'draft',
    mediaIds: [...input.mediaIds],
    variants: input.variants.map(variant => ({ ...variant, id: variant.id || `variant_${randomUUID()}`, lowStockThreshold: variant.lowStockThreshold ?? 3 })),
    createdAt: now,
    updatedAt: now,
  }
  products.set(id, product)
  void persistProduct(product)
  for (const variant of product.variants) initializeInventory(variant.id, id, product.vendorId, variant.stock, variant.lowStockThreshold)
  syncStatus(product)
  return structuredClone(product)
}

export function updateProduct(productId: string, patch: Partial<Omit<ManagedProduct, 'id' | 'vendorId' | 'storeId' | 'createdAt' | 'updatedAt'>>): ManagedProduct | null {
  const product = products.get(productId)
  if (!product) return null
  if (patch.slug !== undefined) {
    const slug = slugify(patch.slug)
    const duplicate = [...products.values()].some(candidate => candidate.id !== productId && candidate.vendorId === product.vendorId && candidate.slug === slug)
    if (duplicate) throw new Error('That product slug is already in use.')
    patch.slug = slug
  }
  Object.assign(product, patch)
  product.updatedAt = new Date().toISOString()
  syncStatus(product)
  void persistProduct(product)
  return structuredClone(product)
}

export function adjustVariantStock(productId: string, variantId: string, type: Parameters<typeof adjustInventory>[1], quantity: number, reason: string, referenceId: string | null = null): ManagedProduct {
  const product = products.get(productId)
  if (!product) throw new Error('Product not found.')
  const variant = product.variants.find(candidate => candidate.id === variantId)
  if (!variant) throw new Error('Variant not found.')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new Error('Quantity must be a positive whole number.')
  const adjustment = adjustInventory(variantId, type, quantity, reason, referenceId)
  if (!adjustment) throw new Error('Inventory adjustment could not be applied.')
  product.updatedAt = new Date().toISOString()
  syncStatus(product)
  void persistProduct(product)
  return structuredClone(product)
}

export function setVariantThreshold(productId: string, variantId: string, threshold: number): ManagedProduct {
  const product = products.get(productId)
  if (!product) throw new Error('Product not found.')
  const variant = product.variants.find(candidate => candidate.id === variantId)
  if (!variant) throw new Error('Variant not found.')
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100000) throw new Error('Threshold must be a non-negative whole number.')
  if (!setLowStockThreshold(variantId, threshold)) throw new Error('Inventory record not found.')
  product.updatedAt = new Date().toISOString()
  syncStatus(product)
  void persistProduct(product)
  return structuredClone(product)
}

export function getVariantAdjustments(productId: string, variantId: string) {
  const product = products.get(productId)
  if (!product || !product.variants.some(variant => variant.id === variantId)) throw new Error('Variant not found.')
  return getAdjustments(variantId)
}

export function attachMedia(productId: string, mediaId: string): ManagedProduct {
  const product = products.get(productId)
  if (!product) throw new Error('Product not found.')
  if (!product.mediaIds.includes(mediaId)) product.mediaIds.push(mediaId)
  product.updatedAt = new Date().toISOString()
  void persistProduct(product)
  return structuredClone(product)
}

export function detachMedia(productId: string, mediaId: string): ManagedProduct {
  const product = products.get(productId)
  if (!product) throw new Error('Product not found.')
  product.mediaIds = product.mediaIds.filter(id => id !== mediaId)
  product.updatedAt = new Date().toISOString()
  void persistProduct(product)
  return structuredClone(product)
}
