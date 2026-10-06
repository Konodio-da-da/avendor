import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { config } from './config.js'

let adminApp: App
let adminAuth: Auth
let adminDb: Firestore

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    adminApp = getApps()[0]
  } else {
    const projectId = config.FIREBASE_PROJECT_ID
    const clientEmail = config.FIREBASE_CLIENT_EMAIL
    const privateKey = config.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    if (projectId && clientEmail && privateKey) {
      adminApp = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      })
    } else {
      adminApp = initializeApp({ projectId: 'demo-avendor-hub' })
    }
  }
  adminAuth = getAuth(adminApp)
  adminDb = getFirestore(adminApp)
  return { adminApp, adminAuth, adminDb }
}

export function getFirebaseAdmin() {
  if (!adminAuth) initializeFirebaseAdmin()
  return { adminAuth, adminDb }
}

export type FirebaseUser = {
  uid: string
  email: string | null
  emailVerified: boolean
  role: string
  vendorId: string | null
  name: string | null
}

export async function verifyIdToken(idToken: string): Promise<FirebaseUser> {
  const { adminAuth } = getFirebaseAdmin()
  const decoded = await adminAuth.verifyIdToken(idToken, true)
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    emailVerified: decoded.email_verified ?? false,
    role: (decoded.role as string) ?? 'customer',
    vendorId: (decoded.vendorId as string) ?? null,
    name: (decoded.name as string) ?? null,
  }
}

export async function getUserRecord(uid: string) {
  const { adminAuth } = getFirebaseAdmin()
  return adminAuth.getUser(uid)
}

export async function createCustomToken(uid: string, claims: Record<string, unknown>) {
  const { adminAuth } = getFirebaseAdmin()
  return adminAuth.createCustomToken(uid, claims)
}

export async function setCustomClaims(uid: string, claims: Record<string, unknown>) {
  const { adminAuth } = getFirebaseAdmin()
  return adminAuth.setCustomUserClaims(uid, claims)
}

export async function revokeRefreshTokens(uid: string) {
  const { adminAuth } = getFirebaseAdmin()
  return adminAuth.revokeRefreshTokens(uid)
}