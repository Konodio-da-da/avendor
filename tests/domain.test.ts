import { describe, expect, it } from 'vitest'
import { demoProducts } from '../src/data'

describe('development catalog fixtures', () => {
  it('contains only active products with non-negative prices', () => {
    expect(demoProducts.every(product => product.priceNgn >= 0)).toBe(true)
    expect(demoProducts.every(product => product.status === 'active')).toBe(true)
  })

  it('does not present fixture inventory as available stock', () => {
    expect(demoProducts.flatMap(product => product.variants).every(variant => variant.stock === 0)).toBe(true)
  })
})
