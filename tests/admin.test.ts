import { describe, expect, it } from 'vitest'
import { calculateCommission } from '../shared/domain'

describe('admin overview support', () => {
  it('keeps commission arithmetic safe for whole NGN amounts', () => {
    expect(calculateCommission(24500, 0.1)).toBe(2450)
    expect(() => calculateCommission(-1, 0.1)).toThrow()
  })
})
