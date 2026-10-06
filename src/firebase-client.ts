import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth, signInAnonymously } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasValidConfig = firebaseConfig.apiKey && firebaseConfig.projectId

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null

export function initializeFirebase() {
  if (!hasValidConfig) {
    console.warn('[Firebase] No valid config found. Running in demo mode without authentication.')
    return { firebaseApp: null, firebaseAuth: null }
  }

  if (getApps().length === 0) {
    firebaseApp = initializeApp(firebaseConfig)
  } else {
    firebaseApp = getApps()[0]
  }
  firebaseAuth = getAuth(firebaseApp)

  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST) {
    connectAuthEmulator(firebaseAuth, `http://${import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST}`)
  }

  return { firebaseApp, firebaseAuth }
}

export function getFirebaseAuth(): Auth | null {
  if (!hasValidConfig) return null
  if (!firebaseAuth) initializeFirebase()
  return firebaseAuth
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!hasValidConfig) return null
  if (!firebaseApp) initializeFirebase()
  return firebaseApp
}

export { firebaseApp, firebaseAuth }