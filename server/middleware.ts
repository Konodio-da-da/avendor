import type { ErrorRequestHandler, RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { verifyIdToken, type FirebaseUser } from './firebase-admin.js'
import { config } from './config.js'

declare global {
  namespace Express {
    interface Request {
      user?: FirebaseUser
    }
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const id = req.header('x-request-id')?.slice(0, 100) || randomUUID()
  res.setHeader('x-request-id', id)
  res.locals.requestId = id
  next()
}

export const authenticate: RequestHandler = async (req, res, next) => {
  const authHeader = req.header('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    if (config.NODE_ENV !== 'production' && req.header('x-demo-role') && req.header('x-demo-vendor-id')) {
      req.user = {
        uid: 'demo-user-123',
        email: 'vendor@amina-luxury.example',
        emailVerified: true,
        role: req.header('x-demo-role')!,
        vendorId: req.header('x-demo-vendor-id')!,
        name: 'Amina Luxury Vendor',
      }
      next()
      return
    }
    res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' }, requestId: res.locals.requestId })
    return
  }
  const idToken = authHeader.slice(7)
  try {
    req.user = await verifyIdToken(idToken)
    next()
  } catch {
    res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired authentication token.' }, requestId: res.locals.requestId })
  }
}

export const optionalAuthenticate: RequestHandler = async (req, res, next) => {
  const authHeader = req.header('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    next()
    return
  }
  const idToken = authHeader.slice(7)
  try {
    req.user = await verifyIdToken(idToken)
  } catch {
    // ignore invalid tokens for optional auth
  }
  next()
}

export const requireRole = (...allowedRoles: string[]): RequestHandler => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' }, requestId: res.locals.requestId })
      return
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' }, requestId: res.locals.requestId })
      return
    }
    next()
  }
}

export const requireVendorAccess = (vendorIdParam = 'vendorId'): RequestHandler => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' }, requestId: res.locals.requestId })
      return
    }
    const resourceVendorId = req.params[vendorIdParam] || req.body?.[vendorIdParam] || req.query?.[vendorIdParam]
    if (req.user.role === 'vendor' || req.user.role === 'vendor_staff') {
      if (req.user.vendorId !== resourceVendorId) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this vendor resource.' }, requestId: res.locals.requestId })
        return
      }
    } else if (!['admin', 'super_admin'].includes(req.user.role)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' }, requestId: res.locals.requestId })
      return
    }
    next()
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' }, requestId: res.locals.requestId })
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(JSON.stringify({ requestId: res.locals.requestId, error: error instanceof Error ? error.message : 'unknown_error' }))
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, requestId: res.locals.requestId })
}
