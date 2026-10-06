import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')

const firestoreRules = readFileSync(resolve(__dirname, '../firebase/firestore.rules'), 'utf8')

/**
 * Firestore security rules tests for cross-tenant isolation.
 *
 * REQUIRES: Firebase Firestore emulator running on localhost:8080
 * Start with: npx firebase emulators:start --only firestore --project demo-avendor-hub
 *
 * Or run tests via: npx firebase emulators:exec --only firestore --project demo-avendor-hub "npm test -- tests/firestore-rules.test.ts"
 *
 * Note: Firebase emulator requires Java 21+. Install JDK 21+ if not available.
 */

let testEnv: RulesTestEnvironment | null = null
let emulatorAvailable = false

const vendorA = 'vendor_a'
const vendorB = 'vendor_b'
const storeA = 'store_a'
const storeB = 'store_b'
const productA = 'product_a'
const productB = 'product_b'
const orderA = 'order_a'
const orderB = 'order_b'

async function checkEmulator(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    await fetch('http://127.0.0.1:8080', { signal: controller.signal })
    clearTimeout(timeout)
    return true
  } catch {
    return false
  }
}

beforeAll(async () => {
  emulatorAvailable = await checkEmulator()
  if (!emulatorAvailable) {
    console.log('Firestore emulator not available on localhost:8080 — skipping Firestore rules tests')
    console.log('Start emulator with: npx firebase emulators:start --only firestore --project demo-avendor-hub')
    console.log('Or run: npx firebase emulators:exec --only firestore --project demo-avendor-hub "npm test -- tests/firestore-rules.test.ts"')
    return
  }
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-avendor-hub',
    firestore: { host: '127.0.0.1', port: 8080, rules: firestoreRules },
  })
})

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup()
  }
})

beforeEach(async () => {
  if (!testEnv) return
  await testEnv.clearFirestore()
})

function getAdminContext(): RulesTestContext {
  if (!testEnv) throw new Error('Test environment not initialized')
  return testEnv.authenticatedContext('admin_uid', { role: 'super_admin' })
}

function getVendorAContext(): RulesTestContext {
  if (!testEnv) throw new Error('Test environment not initialized')
  return testEnv.authenticatedContext('vendor_a_uid', { role: 'vendor', vendorId: vendorA })
}

function getVendorBContext(): RulesTestContext {
  if (!testEnv) throw new Error('Test environment not initialized')
  return testEnv.authenticatedContext('vendor_b_uid', { role: 'vendor', vendorId: vendorB })
}

function getStaffAContext(): RulesTestContext {
  if (!testEnv) throw new Error('Test environment not initialized')
  return testEnv.authenticatedContext('staff_a_uid', { role: 'vendor_staff', vendorId: vendorA })
}

function getCustomerContext(): RulesTestContext {
  if (!testEnv) throw new Error('Test environment not initialized')
  return testEnv.authenticatedContext('customer_uid', { role: 'customer' })
}

function getUnauthenticatedContext(): RulesTestContext {
  if (!testEnv) throw new Error('Test environment not initialized')
  return testEnv.unauthenticatedContext()
}

function seedVendorStoreProductOrder(context: RulesTestContext) {
  const db = context.firestore()
  return db.runTransaction(async (tx) => {
    tx.set(db.doc(`vendors/${vendorA}`), { ownerUid: 'vendor_a_uid', name: 'Vendor A' })
    tx.set(db.doc(`stores/${storeA}`), { vendorId: vendorA, status: 'published', name: 'Store A' })
    tx.set(db.doc(`stores/${storeB}`), { vendorId: vendorB, status: 'published', name: 'Store B' })
    tx.set(db.doc(`products/${productA}`), { vendorId: vendorA, storeId: storeA, status: 'active', title: 'Product A', priceNgn: 10000 })
    tx.set(db.doc(`products/${productB}`), { vendorId: vendorB, storeId: storeB, status: 'active', title: 'Product B', priceNgn: 12000 })
    tx.set(db.doc(`orders/${orderA}`), { customerId: 'customer_uid', vendorId: vendorA, totalNgn: 10000 })
    tx.set(db.doc(`orders/${orderB}`), { customerId: 'customer_uid', vendorId: vendorB, totalNgn: 12000 })
    tx.set(db.doc(`vendorStaff/${vendorA}_staff_a_uid`), { vendorId: vendorA, permissions: ['products', 'orders'] })
  })
}

const describeIf = emulatorAvailable ? describe : describe.skip

describeIf('Firestore security rules: cross-tenant isolation (requires Firestore emulator)', () => {
  describe('Anonymous/public access', () => {
    it('allows reading published stores', async () => {
      await seedVendorStoreProductOrder(getAdminContext())
      await assertSucceeds(getUnauthenticatedContext().firestore().doc(`stores/${storeA}`).get())
    })

    it('denies reading draft/suspended stores', async () => {
      const admin = getAdminContext()
      await admin.firestore().runTransaction(async (tx) => {
        tx.set(admin.firestore().doc(`vendors/${vendorA}`), { ownerUid: 'vendor_a_uid' })
        tx.set(admin.firestore().doc(`stores/${storeA}`), { vendorId: vendorA, status: 'draft', name: 'Draft Store' })
      })
      await assertFails(getUnauthenticatedContext().firestore().doc(`stores/${storeA}`).get())
    })

    it('allows reading active products', async () => {
      await seedVendorStoreProductOrder(getAdminContext())
      await assertSucceeds(getUnauthenticatedContext().firestore().doc(`products/${productA}`).get())
    })

    it('denies reading archived/draft products', async () => {
      const admin = getAdminContext()
      await admin.firestore().runTransaction(async (tx) => {
        tx.set(admin.firestore().doc(`vendors/${vendorA}`), { ownerUid: 'vendor_a_uid' })
        tx.set(admin.firestore().doc(`stores/${storeA}`), { vendorId: vendorA, status: 'published', name: 'Store A' })
        tx.set(admin.firestore().doc(`products/${productA}`), { vendorId: vendorA, storeId: storeA, status: 'archived', title: 'Archived', priceNgn: 10000 })
      })
      await assertFails(getUnauthenticatedContext().firestore().doc(`products/${productA}`).get())
    })

    it('denies reading orders', async () => {
      await seedVendorStoreProductOrder(getAdminContext())
      await assertFails(getUnauthenticatedContext().firestore().doc(`orders/${orderA}`).get())
    })

    it('denies reading users', async () => {
      await assertFails(getUnauthenticatedContext().firestore().doc(`users/customer_uid`).get())
    })

    it('denies reading vendors', async () => {
      await assertFails(getUnauthenticatedContext().firestore().doc(`vendors/${vendorA}`).get())
    })
  })

  describe('Customer access', () => {
    it('can read their own user profile', async () => {
      const admin = getAdminContext()
      await admin.firestore().runTransaction(async (tx) => {
        tx.set(admin.firestore().doc(`users/customer_uid`), { role: 'customer', email: 'cust@example.com' })
      })
      await assertSucceeds(getCustomerContext().firestore().doc(`users/customer_uid`).get())
    })

    it('cannot read other users', async () => {
      const admin = getAdminContext()
      await admin.firestore().runTransaction(async (tx) => {
        tx.set(admin.firestore().doc(`users/other_uid`), { role: 'customer', email: 'other@example.com' })
      })
      await assertFails(getCustomerContext().firestore().doc(`users/other_uid`).get())
    })

    it('can read published stores and active products', async () => {
      await seedVendorStoreProductOrder(getAdminContext())
      await assertSucceeds(getCustomerContext().firestore().doc(`stores/${storeA}`).get())
      await assertSucceeds(getCustomerContext().firestore().doc(`products/${productA}`).get())
    })

    it('can read their own orders', async () => {
      await seedVendorStoreProductOrder(getAdminContext())
      await assertSucceeds(getCustomerContext().firestore().doc(`orders/${orderA}`).get())
    })

    it('cannot read other customers orders', async () => {
      const admin = getAdminContext()
      await admin.firestore().runTransaction(async (tx) => {
        tx.set(admin.firestore().doc(`vendors/${vendorA}`), { ownerUid: 'vendor_a_uid' })
        tx.set(admin.firestore().doc(`stores/${storeA}`), { vendorId: vendorA, status: 'published' })
        tx.set(admin.firestore().doc(`orders/other_order`), { customerId: 'other_customer', vendorId: vendorA, totalNgn: 5000 })
      })
      await assertFails(getCustomerContext().firestore().doc(`orders/other_order`).get())
    })

    it('cannot create/modify any resource', async () => {
      await assertFails(getCustomerContext().firestore().doc(`stores/new_store`).create({ vendorId: vendorA, status: 'published' }))
      await assertFails(getCustomerContext().firestore().doc(`products/${productA}`).update({ title: 'Hacked' }))
    })
  })

  describe('Vendor A access', () => {
    beforeEach(async () => {
      await seedVendorStoreProductOrder(getAdminContext())
    })

    it('can read their own vendor document', async () => {
      await assertSucceeds(getVendorAContext().firestore().doc(`vendors/${vendorA}`).get())
    })

    it('cannot read other vendor documents', async () => {
      await assertFails(getVendorAContext().firestore().doc(`vendors/${vendorB}`).get())
    })

    it('can read their own stores (any status)', async () => {
      await assertSucceeds(getVendorAContext().firestore().doc(`stores/${storeA}`).get())
    })

    it('cannot read other vendor stores', async () => {
      await assertFails(getVendorAContext().firestore().doc(`stores/${storeB}`).get())
    })

    it('can create stores for their vendor', async () => {
      await assertSucceeds(getVendorAContext().firestore().doc(`stores/new_store`).create({ vendorId: vendorA, status: 'draft', name: 'New Store' }))
    })

    it('cannot create stores for other vendors', async () => {
      await assertFails(getVendorAContext().firestore().doc(`stores/new_store`).create({ vendorId: vendorB, status: 'draft', name: 'Hacked' }))
    })

    it('can read their own products (any status)', async () => {
      await assertSucceeds(getVendorAContext().firestore().doc(`products/${productA}`).get())
    })

    it('cannot read other vendor products', async () => {
      await assertFails(getVendorAContext().firestore().doc(`products/${productB}`).get())
    })

    it('can create products for their vendor', async () => {
      await assertSucceeds(getVendorAContext().firestore().doc(`products/new_product`).create({ vendorId: vendorA, storeId: storeA, status: 'draft', title: 'New', priceNgn: 5000 }))
    })

    it('cannot create products for other vendors', async () => {
      await assertFails(getVendorAContext().firestore().doc(`products/new_product`).create({ vendorId: vendorB, storeId: storeB, status: 'draft', title: 'Hacked', priceNgn: 5000 }))
    })

    it('can read orders for their vendor', async () => {
      await assertSucceeds(getVendorAContext().firestore().doc(`orders/${orderA}`).get())
    })

    it('cannot read other vendor orders', async () => {
      await assertFails(getVendorAContext().firestore().doc(`orders/${orderB}`).get())
    })

    it('cannot create/update/delete orders (server-only)', async () => {
      await assertFails(getVendorAContext().firestore().doc(`orders/${orderA}`).update({ totalNgn: 1 }))
      await assertFails(getVendorAContext().firestore().doc(`orders/new_order`).create({ vendorId: vendorA, customerId: 'customer_uid', totalNgn: 1000 }))
    })

    it('cannot modify role field on users', async () => {
      const admin = getAdminContext()
      await admin.firestore().runTransaction(async (tx) => {
        tx.set(admin.firestore().doc(`users/vendor_a_uid`), { role: 'vendor', vendorId: vendorA })
      })
      await assertFails(getVendorAContext().firestore().doc(`users/vendor_a_uid`).update({ role: 'admin' }))
    })
  })

  describe('Vendor B access (symmetry)', () => {
    beforeEach(async () => {
      await seedVendorStoreProductOrder(getAdminContext())
    })

    it('can access their own resources', async () => {
      await assertSucceeds(getVendorBContext().firestore().doc(`stores/${storeB}`).get())
      await assertSucceeds(getVendorBContext().firestore().doc(`products/${productB}`).get())
      await assertSucceeds(getVendorBContext().firestore().doc(`orders/${orderB}`).get())
    })

    it('cannot access Vendor A resources', async () => {
      await assertFails(getVendorBContext().firestore().doc(`stores/${storeA}`).get())
      await assertFails(getVendorBContext().firestore().doc(`products/${productA}`).get())
      await assertFails(getVendorBContext().firestore().doc(`orders/${orderA}`).get())
    })
  })

  describe('Vendor Staff access', () => {
    beforeEach(async () => {
      await seedVendorStoreProductOrder(getAdminContext())
    })

    it('can read their vendor stores and products', async () => {
      await assertSucceeds(getStaffAContext().firestore().doc(`stores/${storeA}`).get())
      await assertSucceeds(getStaffAContext().firestore().doc(`products/${productA}`).get())
    })

    it('cannot access other vendor resources', async () => {
      await assertFails(getStaffAContext().firestore().doc(`stores/${storeB}`).get())
      await assertFails(getStaffAContext().firestore().doc(`products/${productB}`).get())
    })

    it('can read their vendor orders', async () => {
      await assertSucceeds(getStaffAContext().firestore().doc(`orders/${orderA}`).get())
    })

    it('cannot create vendor/staff documents (admin only)', async () => {
      await assertFails(getStaffAContext().firestore().doc(`vendorStaff/${vendorA}_new_staff`).create({ vendorId: vendorA, permissions: ['products'] }))
    })
  })

  describe('Admin access', () => {
    beforeEach(async () => {
      await seedVendorStoreProductOrder(getAdminContext())
    })

    it('can read all stores, products, orders, users, vendors', async () => {
      await assertSucceeds(getAdminContext().firestore().doc(`stores/${storeA}`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`stores/${storeB}`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`products/${productA}`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`products/${productB}`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`orders/${orderA}`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`orders/${orderB}`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`users/customer_uid`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`vendors/${vendorA}`).get())
      await assertSucceeds(getAdminContext().firestore().doc(`vendors/${vendorB}`).get())
    })

    it('can update any resource', async () => {
      await assertSucceeds(getAdminContext().firestore().doc(`stores/${storeA}`).update({ name: 'Renamed by admin' }))
      await assertSucceeds(getAdminContext().firestore().doc(`products/${productA}`).update({ title: 'Renamed by admin' }))
      await assertSucceeds(getAdminContext().firestore().doc(`orders/${orderA}`).update({ totalNgn: 9999 }))
    })

    it('can delete products', async () => {
      await assertSucceeds(getAdminContext().firestore().doc(`products/${productA}`).delete())
    })
  })

  describe('Super Admin access', () => {
    beforeEach(async () => {
      await seedVendorStoreProductOrder(getAdminContext())
    })

    it('can delete stores', async () => {
      await assertSucceeds(getAdminContext().firestore().doc(`stores/${storeA}`).delete())
    })

    it('cannot delete users', async () => {
      await assertFails(getAdminContext().firestore().doc(`users/customer_uid`).delete())
    })
  })
})

describeIf('Firestore security rules: data validation', () => {
  it('rejects store creation without vendorId', async () => {
    await assertFails(getVendorAContext().firestore().doc(`stores/bad_store`).create({ status: 'draft', name: 'Bad' }))
  })

  it('rejects product creation without required fields', async () => {
    await assertFails(getVendorAContext().firestore().doc(`products/bad_product`).create({ vendorId: vendorA, title: 'Missing fields' }))
  })

  it('rejects order creation entirely (server-only)', async () => {
    await assertFails(getAdminContext().firestore().doc(`orders/bad_order`).create({ vendorId: vendorA, customerId: 'customer_uid', totalNgn: 1000 }))
  })
})
  it('vendor cannot reassign a store to another vendor', async () => {
    if (!testEnv) return
    seedVendorStoreProductOrder(getVendorAContext())
    const db = getVendorAContext().firestore()
    await assertFails(db.doc(`stores/${storeA}`).update({ vendorId: vendorB }))
  })

  it('vendor cannot reassign a product to another vendor or store', async () => {
    if (!testEnv) return
    seedVendorStoreProductOrder(getVendorAContext())
    const db = getVendorAContext().firestore()
    await assertFails(db.doc(`products/${productA}`).update({ vendorId: vendorB }))
    await assertFails(db.doc(`products/${productA}`).update({ storeId: storeB }))
  })

