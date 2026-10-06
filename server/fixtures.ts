export const demoStore = { id: 'store_dev_am2fabrics', vendorId: 'vendor_dev_amina', slug: 'amina-luxury-fabrics', name: 'Amina Luxury Fabrics', status: 'published' as const }

export const demoCatalog = [
  { id: 'product_dev_emerald_wrap', storeId: demoStore.id, vendorId: demoStore.vendorId, title: 'Emerald Silk Wrap Dress', slug: 'emerald-silk-wrap-dress', category: 'Silk wraps', material: 'Mulberry satin', status: 'active' as const, priceNgn: 24500, compareAtPriceNgn: 32000, description: 'A fluid wrap silhouette with a considered gold-trim finish for evening plans and celebration dressing.', accent: '#10b981', variants: [{ id: 'variant_uk10', label: 'UK 10', priceNgn: 24500, stock: 12 }, { id: 'variant_uk12', label: 'UK 12', priceNgn: 24500, stock: 8 }, { id: 'variant_uk14', label: 'UK 14', priceNgn: 24500, stock: 5 }] },
  { id: 'product_dev_crimson_wrap', storeId: demoStore.id, vendorId: demoStore.vendorId, title: 'Crimson Silk Wrap Dress', slug: 'crimson-silk-wrap-dress', category: 'Silk wraps', material: 'Embroidered silk', status: 'active' as const, priceNgn: 26000, description: 'A warm crimson wrap with embroidered cuffs and a soft V-neck finish.', accent: '#e11d48', variants: [{ id: 'variant_crimson_one', label: 'One size', priceNgn: 26000, stock: 15 }] },
  { id: 'product_dev_ankara_midi', storeId: demoStore.id, vendorId: demoStore.vendorId, title: 'Tiered Ankara Midi', slug: 'tiered-ankara-midi', category: 'Ankara prints', material: 'Cotton wax', status: 'active' as const, priceNgn: 18500, compareAtPriceNgn: 22000, description: 'A structured cotton wax midi with a generous tiered silhouette and expressive colour.', accent: '#2563eb', variants: [{ id: 'variant_ankara_one', label: 'One size', priceNgn: 18500, stock: 3 }] },
]

import { initializeInventory, clearInventory } from './inventory.js'

export function initializeDemoInventory(): void {
  clearInventory()
  for (const product of demoCatalog) {
    for (const variant of product.variants) {
      initializeInventory(variant.id, product.id, product.vendorId, variant.stock, 3)
    }
  }
}
