import { getFirebaseAdmin } from './firebase-admin.js'
import type { Transaction } from 'firebase-admin/firestore'
import { config } from './config.js'

/** Firestore persistence is enabled only when explicit server credentials are configured. */
export function isPersistentDataEnabled(): boolean {
  return Boolean(config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY)
}

export async function saveDocument(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const { adminDb } = getFirebaseAdmin()
  await adminDb.collection(collection).doc(id).set(data, { merge: true })
}

export async function deleteDocument(collection: string, id: string): Promise<void> {
  if (!isPersistentDataEnabled()) return
  const { adminDb } = getFirebaseAdmin()
  await adminDb.collection(collection).doc(id).delete()
}

export async function getDocuments(collection: string, limit = 5000): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  if (!isPersistentDataEnabled()) return []
  const { adminDb } = getFirebaseAdmin()
  const snap = await adminDb.collection(collection).limit(limit).get()
  return snap.docs.map(doc => ({ id: doc.id, data: doc.data() }))
}

export async function runFirestoreTransaction<T>(
  work: (transaction: Transaction) => Promise<T>,
): Promise<T | null> {
  if (!isPersistentDataEnabled()) return null
  const { adminDb } = getFirebaseAdmin()
  return adminDb.runTransaction(work)
}
