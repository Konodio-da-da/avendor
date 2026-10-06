import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getFirebaseAdmin } from './firebase-admin.js'

export type MediaStatus = 'pending' | 'ready' | 'failed' | 'deleted'
export type MediaVisibility = 'public' | 'private'

export interface MediaRecord {
  id: string
  vendorId: string
  objectKey: string
  type: 'product' | 'vendor'
  filename: string
  mimeType: string
  size: number
  status: MediaStatus
  visibility: MediaVisibility
  createdBy: string
  createdAt: unknown
  updatedAt: unknown
  productId?: string
}

export async function createPendingMedia(input: Omit<MediaRecord, 'id' | 'status' | 'visibility' | 'createdAt' | 'updatedAt'> & { visibility?: MediaVisibility }): Promise<MediaRecord> {
  const { adminDb } = getFirebaseAdmin()
  const ref = adminDb.collection('media').doc()
  const now = FieldValue.serverTimestamp()
  const visibility = input.visibility ?? (input.type === 'product' ? 'public' : 'private')
  await ref.set({ ...input, visibility, status: 'pending', createdAt: now, updatedAt: now })
  return { ...input, visibility, id: ref.id, status: 'pending', createdAt: now, updatedAt: now }
}

export async function getMediaRecord(id: string): Promise<MediaRecord | null> {
  const { adminDb } = getFirebaseAdmin()
  const snap = await adminDb.collection('media').doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<MediaRecord, 'id'>) }
}

export async function getMediaRecordByObjectKey(objectKey: string): Promise<MediaRecord | null> {
  const { adminDb } = getFirebaseAdmin()
  const snap = await adminDb.collection('media').where('objectKey', '==', objectKey).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) }
}

export async function markMediaReady(id: string, verified: { size: number; mimeType: string }): Promise<void> {
  const { adminDb } = getFirebaseAdmin()
  await adminDb.collection('media').doc(id).update({
    status: 'ready',
    size: verified.size,
    mimeType: verified.mimeType,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function markMediaPending(id: string, objectKey: string): Promise<void> {
  const { adminDb } = getFirebaseAdmin()
  await adminDb.collection('media').doc(id).update({
    objectKey,
    status: 'pending',
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function markMediaFailed(id: string): Promise<void> {
  const { adminDb } = getFirebaseAdmin()
  await adminDb.collection('media').doc(id).update({
    status: 'failed',
    updatedAt: FieldValue.serverTimestamp(),
  })
}



export async function claimMediaForProduct(id: string, productId: string): Promise<MediaRecord | null> {
  const { adminDb } = getFirebaseAdmin()
  const ref = adminDb.collection('media').doc(id)
  return adminDb.runTransaction(async transaction => {
    const snap = await transaction.get(ref)
    if (!snap.exists) return null
    const data = snap.data() as Omit<MediaRecord, 'id'>
    if (data.productId && data.productId !== productId) throw new Error('Media is already attached to another product.')
    if (data.status !== 'ready' || data.type !== 'product') throw new Error('Media must be ready product media before attachment.')
    transaction.update(ref, { productId, updatedAt: FieldValue.serverTimestamp() })
    return { id, ...data, productId }
  })
}

export async function releaseMediaFromProduct(id: string, productId: string): Promise<void> {
  const { adminDb } = getFirebaseAdmin()
  const ref = adminDb.collection('media').doc(id)
  await adminDb.runTransaction(async transaction => {
    const snap = await transaction.get(ref)
    if (!snap.exists) return
    const data = snap.data() as Omit<MediaRecord, 'id'>
    if (data.productId !== productId) return
    transaction.update(ref, { productId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
  })
}

export async function markMediaDeleted(id: string): Promise<void> {
  const { adminDb } = getFirebaseAdmin()
  await adminDb.collection('media').doc(id).update({
    status: 'deleted',
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function findExpiredPendingMedia(olderThanMs: number, limit = 100): Promise<MediaRecord[]> {
  const { adminDb } = getFirebaseAdmin()
  const cutoff = Timestamp.fromMillis(Date.now() - olderThanMs)
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Cleanup limit must be between 1 and 500')
  const snap = await adminDb.collection('media')
    .where('status', '==', 'pending')
    .where('createdAt', '<', cutoff)
    .limit(limit)
    .get()
  return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<MediaRecord, 'id'>) }))
}
