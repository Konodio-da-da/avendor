import { Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './theme'
import { CartProvider } from './context/CartContext'
import { AuthProvider } from './context/AuthContext'
import { AccountPage, CartPage, LandingPage, LegalPage, ProductPage, StorePage, StoresPage, VendorAiPage, VendorDashboard, VendorOrdersPage, VendorProductsPage, VendorSettingsPage } from './pages'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/stores" element={<StoresPage />} />
            <Route path="/stores/:storeSlug" element={<StorePage />} />
            <Route path="/products/:productSlug" element={<ProductPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/vendor" element={<VendorDashboard />} />
            <Route path="/vendor/products" element={<VendorProductsPage />} />
            <Route path="/vendor/orders" element={<VendorOrdersPage />} />
            <Route path="/vendor/ai" element={<VendorAiPage />} />
            <Route path="/vendor/settings" element={<VendorSettingsPage />} />
            <Route path="/login" element={<AccountPage />} />
            <Route path="/privacy" element={<LegalPage document="Privacy notice" />} />
            <Route path="/terms" element={<LegalPage document="Terms of service" />} />
            <Route path="/refund-policy" element={<LegalPage document="Refund policy" />} />
            <Route path="/cookie-policy" element={<LegalPage document="Cookie policy" />} />
            <Route path="/data-processing-agreement" element={<LegalPage document="Data processing agreement" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
