import { z } from 'zod'

export const idSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier.')
export const slugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug.')
export const catalogQuerySchema = z.object({
  storeSlug: z.string().trim().max(120).optional(),
  cursor: z.string().trim().max(256).optional(),
  category: z.string().trim().max(80).optional(),
  q: z.string().trim().max(200).optional(),
}).strict()

export const checkoutItemSchema = z.object({
  productId: idSchema,
  variantId: idSchema,
  quantity: z.number().int().min(1).max(100),
}).strict()

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(100),
  currency: z.literal('NGN'),
}).strict()
