import type { NextFunction, Request, RequestHandler, Response } from 'express'

const buckets = new Map<string, { count: number; resetAt: number }>()

export function corsAllowlist(allowedOrigin: string): RequestHandler {
  return (req, res, next) => {
    const origin = req.header('origin')
    if (origin && origin !== allowedOrigin) {
      res.status(403).json({ success: false, error: { code: 'CORS_DENIED', message: 'Origin is not allowed.' }, requestId: res.locals.requestId })
      return
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Request-Id')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    next()
  }
}

export function rateLimit({ windowMs, max, keyPrefix }: { windowMs: number; max: number; keyPrefix: string }): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    const key = `${keyPrefix}:${req.ip}:${req.path}`
    if (buckets.size > 5000) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey)
      }
    }
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }
    current.count += 1
    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000))
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' }, requestId: res.locals.requestId })
      return
    }
    next()
  }
}
