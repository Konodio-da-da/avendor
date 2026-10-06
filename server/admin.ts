import { getAllOrders } from './orders.js'
import { getAllManagedProducts } from './products.js'
import { getAllInventory } from './inventory.js'
import { isPersistentDataEnabled } from './persistence.js'
import { getAllRefunds } from './refunds.js'

export async function getAdminOverview() {
  const orders = getAllOrders()
  const managedProducts = getAllManagedProducts()
  const catalogProducts = managedProducts
  const inventory = getAllInventory()
  const refunds = getAllRefunds()

  const grossNgn = orders.filter(order => !['CANCELLED'].includes(order.status)).reduce((sum, order) => sum + order.totalNgn, 0)
  const refundedNgn = refunds.filter(refund => refund.status === 'completed').reduce((sum, refund) => sum + refund.amountNgn, 0)
  const netNgn = Math.max(0, grossNgn - refundedNgn)
  const statusCounts = orders.reduce<Record<string, number>>((counts, order) => {
    counts[order.status] = (counts[order.status] ?? 0) + 1
    return counts
  }, {})
  const vendorIds = new Set<string>()
  for (const product of catalogProducts) if (typeof product.vendorId === 'string') vendorIds.add(product.vendorId)
  for (const order of orders) for (const item of order.items) vendorIds.add(item.vendorId)

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      orders: orders.length,
      products: catalogProducts.length,
      vendors: vendorIds.size,
      lowStock: inventory.filter(item => item.stock - item.reserved <= item.lowStockThreshold).length,
      refunds: refunds.length,
    },
    money: { grossNgn, refundedNgn, netNgn },
    orderStatuses: statusCounts,
    persistence: isPersistentDataEnabled(),
  }
}
