import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Product, ProductVariant } from '../types'

export interface CartItem {
  productId: string
  variantId: string
  quantity: number
  productTitle: string
  variantLabel: string
  unitPriceNgn: number
  image: string
}

interface CartContextValue {
  items: CartItem[]
  addItem: (product: Product, variant: ProductVariant) => void
  removeItem: (productId: string, variantId: string) => void
  updateQuantity: (productId: string, variantId: string, quantity: number) => void
  clearCart: () => void
  itemCount: number
  subtotalNgn: number
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = useCallback((product: Product, variant: ProductVariant) => {
    setItems(prev => {
      const existing = prev.find(item => item.productId === product.id && item.variantId === variant.id)
      if (existing) {
        return prev.map(item => item.productId === product.id && item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...prev, {
        productId: product.id,
        variantId: variant.id,
        quantity: 1,
        productTitle: product.title,
        variantLabel: variant.label,
        unitPriceNgn: variant.priceNgn,
        image: product.images[0],
      }]
    })
  }, [])

  const removeItem = useCallback((productId: string, variantId: string) => {
    setItems(prev => prev.filter(item => item.productId !== productId || item.variantId !== variantId))
  }, [])

  const updateQuantity = useCallback((productId: string, variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(item => item.productId !== productId || item.variantId !== variantId))
      return
    }
    setItems(prev => prev.map(item => item.productId === productId && item.variantId === variantId ? { ...item, quantity } : item))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotalNgn = items.reduce((sum, item) => sum + item.unitPriceNgn * item.quantity, 0)

  return <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, itemCount, subtotalNgn }}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within a CartProvider')
  return context
}