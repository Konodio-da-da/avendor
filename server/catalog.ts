import type { RequestHandler } from 'express'
import { demoStore } from './fixtures.js'
import { config } from './config.js'
import { isR2Configured, createPublicObjectUrl, createSignedDownloadUrl } from './r2.js'
import { getMediaRecord } from './media.js'
import { listProducts, type ManagedProduct } from './products.js'
import { catalogQuerySchema, slugSchema } from './validation.js'


async function resolvePublicMediaUrls(product: ManagedProduct): Promise<string[]> {
  if (!product.mediaIds.length || !config.FIREBASE_PROJECT_ID || !isR2Configured()) return []
  const urls: string[] = []
  for (const mediaId of product.mediaIds.slice(0, 20)) {
    const media = await getMediaRecord(mediaId)
    if (!media || media.status !== 'ready' || media.type !== 'product' || media.visibility !== 'public') continue
    const publicUrl = createPublicObjectUrl(media.objectKey)
    if (publicUrl) urls.push(publicUrl)
    else {
      try {
        const signed = await createSignedDownloadUrl(media.objectKey, 900)
        urls.push(signed.downloadUrl)
      } catch {
        // Skip unavailable media rather than failing the entire catalog response.
      }
    }
  }
  return urls
}

async function withResolvedMedia(product: ManagedProduct) {
  return { ...product, mediaUrls: await resolvePublicMediaUrls(product) }
}

export const getStore: RequestHandler = (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  if (!slug.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The store slug is invalid.' }, requestId: res.locals.requestId })
    return
  }
  if (slug.data !== demoStore.slug) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'The store was not found.' }, requestId: res.locals.requestId })
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  res.setHeader('X-Data-Mode', 'development-fixture')
  res.json({ success: true, data: demoStore, requestId: res.locals.requestId })
}

export const getProducts: RequestHandler = async (req, res) => {
  const query = catalogQuerySchema.safeParse(req.query)
  if (!query.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The catalog query is invalid.', fields: query.error.flatten().fieldErrors }, requestId: res.locals.requestId })
    return
  }
  const requestedStore = typeof req.query.storeSlug === 'string' ? req.query.storeSlug : undefined
  if (requestedStore && requestedStore !== demoStore.slug) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'The store was not found.' }, requestId: res.locals.requestId })
    return
  }
  const filtered = listProducts(demoStore.vendorId)
    .filter(product => product.status === 'active' && product.storeId === demoStore.id)
    .filter(product => (!query.data.category || product.category === query.data.category) && (!query.data.q || `${product.title} ${product.material} ${product.description}`.toLowerCase().includes(query.data.q.toLowerCase())))
  const items = await Promise.all(filtered.map(withResolvedMedia))
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  res.setHeader('X-Data-Mode', config.FIREBASE_PROJECT_ID ? 'firebase-r2' : 'development-fixture')
  res.json({ success: true, data: { items, nextCursor: null }, requestId: res.locals.requestId })
}

export const getProduct: RequestHandler = async (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  if (!slug.success) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The product slug is invalid.' }, requestId: res.locals.requestId })
    return
  }
  const product = listProducts(demoStore.vendorId).find(candidate => candidate.slug === slug.data && candidate.status === 'active')
  if (!product) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'The product was not found.' }, requestId: res.locals.requestId })
    return
  }
  const resolved = await withResolvedMedia(product)
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  res.setHeader('X-Data-Mode', config.FIREBASE_PROJECT_ID ? 'firebase-r2' : 'development-fixture')
  res.json({ success: true, data: resolved, requestId: res.locals.requestId })
}
