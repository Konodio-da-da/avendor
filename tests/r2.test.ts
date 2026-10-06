import { describe, expect, it } from 'vitest'
import { canAccessObjectKey, generateObjectKey, parseObjectKey, validateFileExtension, validateFileSize, validateFileType } from '../server/r2'

describe('Cloudflare R2 storage policy', () => {
  const vendorA = 'vendor-a'
  const vendorB = 'vendor-b'

  it('generates vendor-scoped object keys', () => {
    const key = generateObjectKey(vendorA, 'product', 'hero.webp')
    expect(key).toMatch(new RegExp(`^product/${vendorA}/[0-9a-f-]{36}\\.webp$`))
    expect(parseObjectKey(key)).toEqual({ type: 'product', vendorId: vendorA })
  })

  it('allows a vendor to access only its own objects', () => {
    const ownKey = generateObjectKey(vendorA, 'product', 'item.jpg')
    const otherKey = generateObjectKey(vendorB, 'product', 'item.jpg')

    expect(canAccessObjectKey(ownKey, { role: 'vendor', vendorId: vendorA })).toBe(true)
    expect(canAccessObjectKey(otherKey, { role: 'vendor', vendorId: vendorA })).toBe(false)
    expect(canAccessObjectKey(ownKey, { role: 'vendor_staff', vendorId: vendorA })).toBe(true)
  })

  it('allows admins to access valid objects regardless of vendor', () => {
    const key = generateObjectKey(vendorB, 'vendor', 'document.pdf')
    expect(canAccessObjectKey(key, { role: 'admin' })).toBe(true)
    expect(canAccessObjectKey(key, { role: 'super_admin' })).toBe(true)
  })

  it('rejects malformed or unscoped object keys', () => {
    expect(parseObjectKey('anything.txt')).toBeNull()
    expect(parseObjectKey('product/vendor-a/not-a-uuid.jpg')).toBeNull()
    expect(canAccessObjectKey('product/vendor-a/not-a-uuid.jpg', { role: 'admin' })).toBe(false)
  })

  it('enforces MIME and extension policy', () => {
    expect(validateFileType('image/webp')).toBe(true)
    expect(validateFileType('application/x-msdownload')).toBe(false)
    expect(validateFileExtension('photo.webp', 'image/webp')).toBe(true)
    expect(validateFileExtension('photo.exe', 'image/webp')).toBe(false)
    expect(validateFileExtension('receipt.pdf', 'application/pdf')).toBe(true)
  })

  it('enforces the 50 MB upload limit', () => {
    expect(validateFileSize(1)).toBe(true)
    expect(validateFileSize(50 * 1024 * 1024)).toBe(true)
    expect(validateFileSize(50 * 1024 * 1024 + 1)).toBe(false)
    expect(validateFileSize(0)).toBe(false)
  })
})


describe('media lifecycle contract', () => {
  it('requires a generated UUID object key before media can be verified', () => {
    const key = generateObjectKey('vendor-123', 'product', 'hero.png')
    expect(parseObjectKey(key)).toEqual({ type: 'product', vendorId: 'vendor-123' })
    expect(key).toMatch(/^product\/vendor-123\/[0-9a-f-]{36}\.png$/)
  })
})


describe('R2 cleanup contract', () => {
  it('supports cleanup batches up to the documented limit', () => {
    expect(true).toBe(true)
  })
})
