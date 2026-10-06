import { randomUUID } from 'crypto'
import { getDocuments, saveDocument, isPersistentDataEnabled } from './persistence.js'

export interface InventoryItem {
  variantId: string
  productId: string
  vendorId: string
  stock: number
  reserved: number
  lowStockThreshold: number
  updatedAt: string
}

export interface Reservation {
  id: string
  variantId: string
  quantity: number
  expiresAt: string
  quoteId: string | null
  status: 'pending' | 'confirmed' | 'expired' | 'released'
  createdAt: string
}

export interface InventoryAdjustment {
  id: string
  variantId: string
  type: 'restock' | 'damage' | 'loss' | 'adjustment' | 'sale' | 'return'
  quantity: number
  reason: string
  referenceId: string | null
  createdAt: string
}

const inventory = new Map<string, InventoryItem>()
const reservations = new Map<string, Reservation>()
const adjustments = new Map<string, InventoryAdjustment>()

const DEFAULT_LOW_STOCK_THRESHOLD = 5
const RESERVATION_TTL_SECONDS = 600

export async function hydrateInventory(): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const [inventoryDocs, reservationDocs, adjustmentDocs] = await Promise.all([
    getDocuments('inventory'), getDocuments('reservations'), getDocuments('inventoryAdjustments')
  ])
  for (const doc of inventoryDocs) inventory.set(doc.id, doc.data as unknown as InventoryItem)
  for (const doc of reservationDocs) reservations.set(doc.id, doc.data as unknown as Reservation)
  for (const doc of adjustmentDocs) adjustments.set(doc.id, doc.data as unknown as InventoryAdjustment)
}

async function persistInventory(item: InventoryItem): Promise<void> {
  await saveDocument('inventory', item.variantId, { ...structuredClone(item) })
}

export function initializeInventory(variantId: string, productId: string, vendorId: string, initialStock: number, lowStockThreshold?: number): InventoryItem {
  const now = new Date().toISOString()
  const item: InventoryItem = {
    variantId,
    productId,
    vendorId,
    stock: initialStock,
    reserved: 0,
    lowStockThreshold: lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
    updatedAt: now,
  }
  inventory.set(variantId, item)
  void persistInventory(item)
  return item
}

export function getInventory(variantId: string): InventoryItem | undefined {
  return inventory.get(variantId)
}

export function getInventoryByVendor(vendorId: string): InventoryItem[] {
  return Array.from(inventory.values()).filter(item => item.vendorId === vendorId)
}

export function getAvailableStock(variantId: string): number {
  expireReservations()
  const item = inventory.get(variantId)
  if (!item) return 0
  return Math.max(0, item.stock - item.reserved)
}

export function isLowStock(variantId: string): boolean {
  const item = inventory.get(variantId)
  if (!item) return false
  return getAvailableStock(variantId) <= item.lowStockThreshold
}

export function createReservation(variantId: string, quantity: number, quoteId: string | null = null): Reservation | null {
  const item = inventory.get(variantId)
  if (!item) return null
  const available = getAvailableStock(variantId)
  if (available < quantity) return null

  const now = new Date()
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_SECONDS * 1000)

  const reservation: Reservation = {
    id: randomUUID(),
    variantId,
    quantity,
    expiresAt: expiresAt.toISOString(),
    quoteId,
    status: 'pending',
    createdAt: now.toISOString(),
  }

  item.reserved += quantity
  item.updatedAt = now.toISOString()
  void persistInventory(item)
  reservations.set(reservation.id, reservation)
  void saveDocument('reservations', reservation.id, { ...structuredClone(reservation) })
  return reservation
}

export function confirmReservation(reservationId: string): boolean {
  const reservation = reservations.get(reservationId)
  if (!reservation || reservation.status !== 'pending') return false

  const item = inventory.get(reservation.variantId)
  if (!item) return false

  if (item.stock < reservation.quantity) return false

  item.stock -= reservation.quantity
  item.reserved -= reservation.quantity
  item.updatedAt = new Date().toISOString()
  void persistInventory(item)
  reservation.status = 'confirmed'
  void saveDocument('reservations', reservation.id, { ...structuredClone(reservation) })
  return true
}

export function confirmReservations(reservationIds: string[]): boolean {
  const uniqueIds = [...new Set(reservationIds)]
  const pending = uniqueIds.map(id => reservations.get(id))
  if (pending.some(reservation => !reservation || reservation.status !== 'pending')) return false

  for (const reservation of pending) {
    const item = inventory.get(reservation!.variantId)
    if (!item || item.stock < reservation!.quantity) return false
  }

  const now = new Date().toISOString()
  for (const reservation of pending) {
    const item = inventory.get(reservation!.variantId)!
    item.stock -= reservation!.quantity
    item.reserved -= reservation!.quantity
    item.updatedAt = now
    void persistInventory(item)
    reservation!.status = 'confirmed'
  }
  return true
}

export function releaseReservation(reservationId: string): boolean {
  const reservation = reservations.get(reservationId)
  if (!reservation || reservation.status !== 'pending') return false

  const item = inventory.get(reservation.variantId)
  if (item) {
    item.reserved = Math.max(0, item.reserved - reservation.quantity)
    item.updatedAt = new Date().toISOString()
    void persistInventory(item)
  }
  reservation.status = 'released'
  void saveDocument('reservations', reservation.id, { ...structuredClone(reservation) })
  return true
}

export function expireReservations(): number {
  const now = new Date()
  let count = 0
  for (const reservation of reservations.values()) {
    if (reservation.status === 'pending' && new Date(reservation.expiresAt) <= now) {
      releaseReservation(reservation.id)
      count++
    }
  }
  return count
}

export function getReservation(reservationId: string): Reservation | undefined {
  return reservations.get(reservationId)
}

export function getReservationsByQuote(quoteId: string): Reservation[] {
  return Array.from(reservations.values()).filter(r => r.quoteId === quoteId)
}

export function getReservationsByVariant(variantId: string): Reservation[] {
  return Array.from(reservations.values()).filter(r => r.variantId === variantId && r.status === 'pending')
}

export function adjustInventory(
  variantId: string,
  type: InventoryAdjustment['type'],
  quantity: number,
  reason: string,
  referenceId: string | null = null
): InventoryAdjustment | null {
  const item = inventory.get(variantId)
  if (!item) return null

  const now = new Date()
  let newStock = item.stock

  switch (type) {
    case 'restock':
    case 'return':
      newStock += quantity
      break
    case 'damage':
    case 'loss':
    case 'adjustment':
      newStock = Math.max(0, newStock - quantity)
      break
    case 'sale':
      if (item.stock < quantity) return null
      newStock -= quantity
      break
  }

  item.stock = newStock
  item.updatedAt = now.toISOString()
  void persistInventory(item)

  const adjustment: InventoryAdjustment = {
    id: randomUUID(),
    variantId,
    type,
    quantity,
    reason,
    referenceId,
    createdAt: now.toISOString(),
  }
  adjustments.set(adjustment.id, adjustment)
  void saveDocument('inventoryAdjustments', adjustment.id, { ...structuredClone(adjustment) })
  return adjustment
}

export function getAdjustments(variantId: string): InventoryAdjustment[] {
  return Array.from(adjustments.values())
    .filter(a => a.variantId === variantId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getLowStockItems(vendorId?: string): InventoryItem[] {
  return Array.from(inventory.values())
    .filter(item => !vendorId || item.vendorId === vendorId)
    .filter(item => isLowStock(item.variantId))
}

export function setLowStockThreshold(variantId: string, threshold: number): boolean {
  const item = inventory.get(variantId)
  if (!item) return false
  item.lowStockThreshold = Math.max(0, threshold)
  item.updatedAt = new Date().toISOString()
  void persistInventory(item)
  return true
}

export function getAllInventory(): InventoryItem[] {
  return Array.from(inventory.values())
}

export function clearInventory(): void {
  inventory.clear()
  reservations.clear()
  adjustments.clear()
}

export const RESERVATION_TTL = RESERVATION_TTL_SECONDS