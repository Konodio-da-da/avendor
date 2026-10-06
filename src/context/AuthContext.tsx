import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile, type UserCredential, getIdTokenResult } from 'firebase/auth'
import { getFirebaseAuth, initializeFirebase, getFirebaseApp } from '../firebase-client'

initializeFirebase()

const isDemoMode = !getFirebaseApp()

interface DemoUser {
  uid: string
  email: string
  displayName: string | null
}

interface AuthContextValue {
  user: User | DemoUser | null
  vendorId: string | null
  loading: boolean
  isDemoMode: boolean
  signIn: (email: string, password: string) => Promise<UserCredential>
  signUp: (email: string, password: string, displayName?: string) => Promise<UserCredential>
  resetPassword: (email: string) => Promise<void>
  logOut: () => Promise<void>
  updateDisplayName: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const demoUser: DemoUser = {
  uid: 'demo-user-123',
  email: 'vendor@amina-luxury.example',
  displayName: 'Amina Luxury Vendor',
}

const demoVendorId = 'vendor_dev_amina'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | DemoUser | null>(null)
  const [vendorId, setVendorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isDemoMode) {
      setUser(demoUser)
      setVendorId(demoVendorId)
      setLoading(false)
      return
    }

    const auth = getFirebaseAuth()
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        try {
          const tokenResult = await getIdTokenResult(currentUser, true)
          const claims = tokenResult.claims as Record<string, unknown>
          setVendorId((claims.vendorId as string) ?? null)
        } catch {
          setVendorId(null)
        }
      } else {
        setVendorId(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const signIn = async (email: string, password: string) => {
    if (isDemoMode) {
      throw new Error('Authentication not available in demo mode. Configure Firebase to enable.')
    }
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase not initialized')
    return signInWithEmailAndPassword(auth, email, password)
  }

  const signUp = async (email: string, password: string, displayName?: string) => {
    if (isDemoMode) {
      throw new Error('Authentication not available in demo mode. Configure Firebase to enable.')
    }
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase not initialized')
    const result = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) {
      await updateProfile(result.user, { displayName })
    }
    return result
  }

  const resetPassword = async (email: string) => {
    if (isDemoMode) {
      throw new Error('Authentication not available in demo mode. Configure Firebase to enable.')
    }
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase not initialized')
    await sendPasswordResetEmail(auth, email)
  }

  const logOut = async () => {
    if (isDemoMode) {
      setUser(null)
      setVendorId(null)
      return
    }
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase not initialized')
    await signOut(auth)
  }

  const updateDisplayName = async (name: string) => {
    if (isDemoMode) {
      throw new Error('Authentication not available in demo mode. Configure Firebase to enable.')
    }
    if (!user) throw new Error('No user signed in')
    await updateProfile(user as User, { displayName: name })
  }

  return (
    <AuthContext.Provider value={{ user, vendorId, loading, isDemoMode, signIn, signUp, resetPassword, logOut, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}