import type { FeatureKey, OrderSummary, Product, Store } from './types'

export const featureFlags: Record<FeatureKey, boolean> = {
  ai: false,
  whatsapp: false,
  payouts: false,
  reviews: false,
  manualTransfers: false,
  advancedAnalytics: false,
}

export const demoStore: Store = {
  id: 'store_dev_am2fabrics',
  vendorId: 'vendor_dev_amina',
  slug: 'amina-luxury-fabrics',
  name: 'Amina Luxury Fabrics',
  description: 'A considered edit of Nigerian occasionwear, silk wraps, and expressive textiles.',
  location: 'Balogun Market, Lagos Island',
  accent: 'emerald',
  status: 'published',
  categories: ['Silk wraps', 'Ankara prints', 'Luxury lace'],
}

const artwork = (from: string, to: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 980"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="980" fill="url(#g)"/><circle cx="620" cy="180" r="180" fill="white" fill-opacity=".12"/><path d="M110 860c100-140 150-270 180-490 40-30 180-30 220 0 30 220 80 350 180 490Z" fill="white" fill-opacity=".16"/><path d="M290 355c42-90 178-90 220 0l-20 170c-60 30-120 30-180 0Z" fill="white" fill-opacity=".22"/><text x="48" y="900" fill="white" font-family="Arial" font-size="30" letter-spacing="4">${label}</text></svg>`)}`

export const demoProducts: Product[] = [
  {
    id: 'product_dev_emerald_wrap',
    storeId: demoStore.id,
    vendorId: demoStore.vendorId,
    title: 'Emerald Silk Wrap Dress',
    slug: 'emerald-silk-wrap-dress',
    description: 'A fluid wrap silhouette with a considered gold-trim finish for evening plans and celebration dressing.',
    priceNgn: 24500,
    compareAtPriceNgn: 32000,
    category: 'Silk wraps',
    material: 'Mulberry satin',
    accent: '#10b981',
    status: 'active',
    images: [artwork('#064e3b', '#10b981', 'EMERALD SILK')],
    variants: [
      { id: 'variant_uk10', label: 'UK 10', priceNgn: 24500, stock: 12 },
      { id: 'variant_uk12', label: 'UK 12', priceNgn: 24500, stock: 8 },
      { id: 'variant_uk14', label: 'UK 14', priceNgn: 24500, stock: 5 },
    ],
  },
  {
    id: 'product_dev_crimson_wrap',
    storeId: demoStore.id,
    vendorId: demoStore.vendorId,
    title: 'Crimson Silk Wrap Dress',
    slug: 'crimson-silk-wrap-dress',
    description: 'A warm crimson wrap with embroidered cuffs and a soft V-neck finish.',
    priceNgn: 26000,
    category: 'Silk wraps',
    material: 'Embroidered silk',
    accent: '#e11d48',
    status: 'active',
    images: [artwork('#4c0519', '#e11d48', 'CRIMSON SILK')],
    variants: [{ id: 'variant_crimson_one', label: 'One size', priceNgn: 26000, stock: 15 }],
  },
  {
    id: 'product_dev_ankara_midi',
    storeId: demoStore.id,
    vendorId: demoStore.vendorId,
    title: 'Tiered Ankara Midi',
    slug: 'tiered-ankara-midi',
    description: 'A structured cotton wax midi with a generous tiered silhouette and expressive colour.',
    priceNgn: 18500,
    compareAtPriceNgn: 22000,
    category: 'Ankara prints',
    material: '100% cotton wax',
    accent: '#2563eb',
    status: 'active',
    images: [artwork('#172554', '#2563eb', 'TIERED ANKARA')],
    variants: [{ id: 'variant_ankara_one', label: 'One size', priceNgn: 18500, stock: 3 }],
  },
]

export const demoOrders: OrderSummary[] = []
