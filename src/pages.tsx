import { useState, type ReactNode, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, BarChart3, Bot, CircleAlert, Clock3, ExternalLink, Filter, Headphones, ImagePlus, LockKeyhole, Menu, Mic, PackageCheck, PanelTop, Plus, Search, Send, ShieldCheck, ShoppingBag, Sparkles, Store, Trash2, Truck, WalletCards, X, type LucideIcon } from 'lucide-react'
import { AuthNote, Badge, Brand, Button, CheckItem, EmptyState, Footer, GlassCard, MarketingHeader, MobileNav, ProductCard, StatusNotice, StoreHeader, ThemeToggle, VendorSidebar, OrderCard } from './components'
import { demoOrders, demoProducts, demoStore } from './data'
import { formatNgn } from './lib/format'
import { useCart } from './context/CartContext'
import { useAuth } from './context/AuthContext'
import { requestCheckoutQuote, initializePayment, getVendorOrders, getOrderDetail, getCustomerOrders, getCustomerOrder, transitionOrder, createUploadUrl, uploadFileToR2, completeUpload, getVendorProducts, createVendorProduct, updateVendorProduct, adjustVendorInventory, attachProductMedia, getCatalogProducts, getCatalogProduct, type CheckoutQuote, type InitializePaymentResult, type Order, type OrderDetailResponse, type SignedUploadUrl, type VendorProduct, type CatalogProduct } from './lib/api'

function PageFrame({ children, header = 'marketing', mobileVendor = false }: { children: ReactNode; header?: 'marketing' | 'store' | 'vendor'; mobileVendor?: boolean }) {
  return <div className={`app-shell shell-${header}`}>{header === 'marketing' && <MarketingHeader />}{header === 'store' && <StoreHeader />}{header === 'vendor' && <VendorSidebar />}<main id="main-content" className={header === 'vendor' ? 'vendor-main' : ''}>{children}</main>{header !== 'vendor' && <Footer />}{(header === 'store' || mobileVendor) && <MobileNav vendor={mobileVendor} />}</div>
}

export function LandingPage() {
  const capabilities: Array<[string, string, string, LucideIcon]> = [['01', 'Storefronts', 'A fast catalog experience with product detail, variants, search, cart, and a clear trust model.', Store], ['02', 'Vendor operations', 'Products, orders, inventory, customers, and store configuration in one focused workspace.', PanelTop], ['03', 'Payments by design', 'Checkout is structured for server recalculation, provider verification, idempotency, and ledger entries.', WalletCards], ['04', 'AI with boundaries', 'Product-aware copilots and vendor tools are feature-gated, quota-aware, and never trusted with financial state.', Bot]]
  return <PageFrame><section className="hero-section"><div className="hero-copy"><Badge tone="positive">Built for Nigerian commerce teams</Badge><h1>Your market, your brand, <span>one intelligent hub.</span></h1><p className="hero-lede">AVENDOR HUB gives independent vendors the operational backbone to publish products, manage orders, and grow across storefronts without losing the human touch.</p><div className="hero-actions"><Link className="button button-primary" to="/vendor">Open the merchant OS <ArrowRight size={17} /></Link><Link className="button button-ghost" to="/stores/amina-luxury-fabrics">Browse a demo storefront <ExternalLink size={16} /></Link></div><p className="microcopy"><LockKeyhole size={14} /> Preview data only. Provider-backed payments, payouts, AI, and WhatsApp are disabled until configured.</p></div><div className="hero-orbit" aria-label="AVENDOR HUB operational layers"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="hub-core"><Sparkles size={29} /><strong>AVENDOR</strong><span>commerce OS</span></div><div className="orbit-card orbit-card-one"><span className="signal signal-green" />Inventory sync<div className="mono">SERVER CONTROLLED</div></div><div className="orbit-card orbit-card-two"><span className="signal signal-blue" />Checkout orchestration<div className="mono">PROVIDER GATED</div></div><div className="orbit-card orbit-card-three"><span className="signal signal-violet" />AI tools<div className="mono">FEATURE GATED</div></div></div></section><section className="proof-strip"><div><strong>One catalog</strong><span>Across storefront, vendor OS, and future channels.</span></div><div><strong>One source of truth</strong><span>Prices, inventory, and payment state stay server-controlled.</span></div><div><strong>One Nigerian-first rhythm</strong><span>Built for mobile commerce, local language, and real operations.</span></div></section><section id="capabilities" className="section-block"><div className="section-heading"><div><div className="eyebrow">Capabilities</div><h2>Everything a vendor needs to run a modern storefront.</h2></div></div><div className="capability-grid">{capabilities.map(([num, title, body, Icon]) => <GlassCard key={title} className="capability-card"><div className="capability-num">{num}</div><Icon size={22} /><h3>{title}</h3><p>{body}</p></GlassCard>)}</div></section><section className="cta-strip"><div className="cta-glass"><div><h2>Ready to see the merchant OS?</h2><p>Explore the vendor dashboard with real routes, empty states, and a navigation structure designed for daily operations.</p></div><Link className="button button-primary" to="/vendor">Open the merchant OS <ArrowRight size={17} /></Link></div></section></PageFrame>
}

function catalogProductToUi(product: CatalogProduct, fallback?: (productId: string) => string[]): import('./types').Product {
  const seed = demoProducts.find(item => item.id === product.id)
  return {
    id: product.id,
    storeId: product.storeId,
    vendorId: product.vendorId,
    title: product.title,
    slug: product.slug,
    description: product.description || seed?.description || '',
    priceNgn: product.priceNgn,
    compareAtPriceNgn: product.compareAtPriceNgn,
    category: product.category,
    material: product.material,
    accent: product.accent || seed?.accent || '#10b981',
    status: product.status,
    images: product.mediaUrls?.length ? product.mediaUrls : (seed?.images ?? fallback?.(product.id) ?? []),
    variants: product.variants.map(variant => ({ id: variant.id, label: variant.label, priceNgn: variant.priceNgn, stock: variant.stock })),
  }
}

function StorefrontHero({ query, onQueryChange }: { query?: string; onQueryChange?: (value: string) => void }) {
  const [internalQuery, setInternalQuery] = useState('')
  const value = query ?? internalQuery
  const setValue = onQueryChange ?? setInternalQuery
  return <section className="storefront-hero"><div><Badge tone="positive">Live catalog API</Badge><h1>Amina Luxury Fabrics</h1><p>Considered occasionwear and expressive textiles from Balogun Market, Lagos Island.</p></div><div className="store-search"><Search size={18} /><input value={value} onChange={event => setValue(event.target.value)} placeholder="Search this store" aria-label="Search this store" /><kbd>⌘ K</kbd></div>{value && <div className="search-hint">Search is now server-backed against the public catalog API.</div>}</section>
}

export function StoresPage() { return <PageFrame header="store"><StorefrontHero /><section className="content-section"><div className="section-heading compact"><div><div className="eyebrow">Discover</div><h2>Stores with a point of view.</h2></div><Button variant="soft" disabled><Filter size={15} /> Filters unavailable</Button></div><div className="store-directory"><Link className="directory-card featured" to={`/stores/${demoStore.slug}`}><div className="directory-art" /><div><Badge tone="positive">Published demo store</Badge><h3>{demoStore.name}</h3><p>{demoStore.description}</p><span>{demoStore.location} <ArrowRight size={15} /></span></div></Link><EmptyState icon={<Store />} title="More stores will appear here" body="Real stores will be loaded from the public catalog service as they are published." /></div></section></PageFrame> }

export function StorePage() {
  const { storeSlug } = useParams()
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<import('./types').Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const timer = window.setTimeout(async () => {
      try {
        const result = await getCatalogProducts({ storeSlug, q: query.trim() || undefined })
        if (!cancelled) setProducts(result.items.map(item => catalogProductToUi(item)))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the storefront.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, query ? 250 : 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [storeSlug, query])

  const isKnownStore = storeSlug === demoStore.slug
  return <PageFrame header="store"><StorefrontHero query={query} onQueryChange={setQuery} /><section className="store-context"><div className="store-avatar">{isKnownStore ? 'AL' : '?'}</div><div><strong>{isKnownStore ? demoStore.name : 'Store not found'}</strong><span>{isKnownStore ? `${demoStore.location} · Public catalog` : 'The requested public store does not exist.'}</span></div><Badge tone={isKnownStore ? 'positive' : 'warning'}>{isKnownStore ? 'Server catalog' : 'Unavailable'}</Badge></section>{isKnownStore ? <section className="content-section"><div className="category-row"><button className="category-pill active" type="button" onClick={() => setQuery('')}>All pieces</button>{demoStore.categories.map(category => <button className="category-pill" type="button" key={category} onClick={() => setQuery(category)}>{category}</button>)}</div>{error ? <StatusNotice tone="warning">{error}</StatusNotice> : loading ? <div className="empty-state"><h3>Loading catalog…</h3><p>Fetching current published products and inventory.</p></div> : products.length ? <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div> : <EmptyState icon={<PackageCheck />} title="No products found" body="Try another search or category." />}<StatusNotice>Prices, publication state, variants, and inventory are read from the server catalog. Checkout revalidates everything again.</StatusNotice></section> : <section className="content-section"><EmptyState icon={<Store />} title="This store is not available" body="The public store slug was not found. No private vendor data is exposed." action={<Link className="button button-soft" to="/stores">Browse available stores</Link>} /></section>}</PageFrame>
}

export function ProductPage() {
  const { productSlug } = useParams()
  const [product, setProduct] = useState<import('./types').Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { addItem } = useCart()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    if (!productSlug) { setError('Product not found.'); setLoading(false); return }
    getCatalogProduct(productSlug).then(result => {
      if (cancelled) return
      const mapped = catalogProductToUi(result)
      setProduct(mapped)
      setSelectedId(mapped.variants[0]?.id ?? null)
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the product.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productSlug])

  if (loading) return <PageFrame header="store"><section className="content-section"><EmptyState title="Loading product…" body="Fetching the published product from the catalog service." /></section></PageFrame>
  if (error || !product) return <PageFrame header="store"><section className="content-section"><EmptyState icon={<PackageCheck />} title="Product unavailable" body={error ?? 'The product could not be found.'} action={<Link className="button button-soft" to={`/stores/${demoStore.slug}`}>Back to store</Link>} /></section></PageFrame>
  const selected = product.variants.find(variant => variant.id === selectedId) ?? product.variants[0]
  const image = product.images[0]

  return <PageFrame header="store"><section className="product-detail"><div className="product-gallery"><div className="product-hero-art" style={{ background: 'linear-gradient(145deg, ' + product.accent + ', #09111c)' }}>{image ? <img src={image} alt={`${product.title} product artwork`} /> : <div className="empty-state"><PackageCheck size={28} /><span>R2 media not attached yet</span></div>}<Badge tone={product.status === 'active' ? 'positive' : 'warning'}>{product.status === 'active' ? 'Published' : product.status}</Badge></div>{image && <div className="thumbnail-row" aria-label="Product media"><div className="thumbnail active"><img src={image} alt="" /></div></div>}</div><div className="product-detail-copy"><Link className="back-link" to={`/stores/${demoStore.slug}`}>← Back to store</Link><div className="eyebrow">{product.category} · {product.material}</div><h1>{product.title}</h1><p className="product-description">{product.description}</p><div className="price-lockup"><strong>{formatNgn(selected?.priceNgn ?? product.priceNgn)}</strong>{product.compareAtPriceNgn && <del>{formatNgn(product.compareAtPriceNgn)}</del>}</div><div className="selector-block"><div className="selector-label"><strong>Choose a variant</strong><span>{selected?.stock ? `${selected.stock} available` : 'Out of stock'}</span></div><div className="variant-list">{product.variants.map(variant => <button type="button" className={`variant-button ${selected?.id === variant.id ? 'selected' : ''}`} key={variant.id} onClick={() => setSelectedId(variant.id)} disabled={variant.stock <= 0}>{variant.label}<small>{variant.stock > 0 ? `${variant.stock} available` : 'Out of stock'}</small></button>)}</div></div><div className="product-actions"><Button variant="primary" onClick={() => selected && addItem(product, selected)} disabled={!selected || selected.stock <= 0}><ShoppingBag size={16} /> {selected?.stock ? 'Add to bag' : 'Out of stock'}</Button><Button variant="soft" disabled><ArrowRight size={16} /> Checkout from bag</Button></div><StatusNotice>Inventory and price are server-controlled. The checkout service performs a fresh availability and price check before payment.</StatusNotice></div></section></PageFrame>
}

export function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, itemCount, subtotalNgn } = useCart()
  const [quote, setQuote] = useState<CheckoutQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCartChange = () => {
    setQuote(null)
    setQuoteError(null)
    setPaymentError(null)
  }

  const handleGetQuote = async () => {
    if (items.length === 0) return
    setLoading(true)
    setQuoteError(null)
    const idempotencyKey = `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    try {
      const result = await requestCheckoutQuote(items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })), idempotencyKey)
      setQuote(result)
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : 'Failed to get checkout quote')
    } finally {
      setLoading(false)
    }
  }

  const [paymentEmail, setPaymentEmail] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const handleInitializePayment = async () => {
    if (!quote) {
      setPaymentError('Please generate a fresh checkout quote first.')
      return
    }
    if (!paymentEmail.trim()) {
      setPaymentError('Email is required for payment')
      return
    }
    setPaymentLoading(true)
    setPaymentError(null)
    const idempotencyKey = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    try {
      const callbackUrl = `${window.location.origin}/cart`
      const result = await initializePayment({
        email: paymentEmail.trim(),
        callbackUrl,
        quoteId: quote.quoteId,
      }, idempotencyKey)
      // Redirect to Paystack authorization URL
      window.location.href = result.authorizationUrl
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Payment initialization failed')
    } finally {
      setPaymentLoading(false)
    }
  }

  return (
    <PageFrame header="store">
      <section className="content-section narrow-page">
        <div className="eyebrow">Your bag</div>
        <h1>{itemCount > 0 ? `Cart (${itemCount} item{itemCount > 1 ? 's' : ''})` : 'Your bag is empty'}</h1>

        {items.length === 0 ? (
          <EmptyState icon={<ShoppingBag />} title="No items in your bag" body="Add products from the store to see them here." action={<Link className="button button-soft" to={`/stores/${demoStore.slug}`}>Browse the demo store</Link>} />
        ) : (
          <>
            <GlassCard>
              <div className="cart-items">
                {items.map(item => (
                  <div className="cart-item" key={`${item.productId}-${item.variantId}`}>
                    <img src={item.image} alt={item.productTitle} className="cart-item-image" />
                    <div className="cart-item-details">
                      <strong>{item.productTitle}</strong>
                      <span className="cart-item-variant">{item.variantLabel}</span>
                      <span className="cart-item-price">{formatNgn(item.unitPriceNgn)}</span>
                    </div>
                    <div className="cart-item-quantity">
                      <button onClick={() => { updateQuantity(item.productId, item.variantId, item.quantity - 1); handleCartChange() }} aria-label="Decrease quantity">−</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => { updateQuantity(item.productId, item.variantId, item.quantity + 1); handleCartChange() }} aria-label="Increase quantity">+</button>
                    </div>
                    <span className="cart-item-line-total">{formatNgn(item.unitPriceNgn * item.quantity)}</span>
                    <button className="icon-button" onClick={() => { removeItem(item.productId, item.variantId); handleCartChange() }} aria-label="Remove item"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <div className="cart-summary">
                <div className="summary-row"><span>Subtotal</span><strong>{formatNgn(subtotalNgn)}</strong></div>
                <div className="summary-row"><span>Platform fee (estimated)</span><span>{formatNgn(Math.round(subtotalNgn * 0.05))}</span></div>
                <div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div>
                <div className="summary-row total"><span>Estimated total</span><strong>{formatNgn(subtotalNgn + Math.round(subtotalNgn * 0.05))}</strong></div>
              </div>
            </GlassCard>

            <div className="cart-actions">
              <Button variant="soft" onClick={() => { clearCart(); handleCartChange() }} disabled={items.length === 0}>Clear bag</Button>
              <Button variant="primary" onClick={handleGetQuote} disabled={loading}><ArrowRight size={16} /> {loading ? 'Getting quote...' : 'Get checkout quote'}</Button>
            </div>

            {quoteError && <StatusNotice tone="warning">{quoteError}</StatusNotice>}

            {quote && (
              <GlassCard className="checkout-quote">
                <div className="quote-header">
                  <div className="eyebrow">Server checkout quote</div>
                  <h2>Quote ready — review before any payment</h2>
                  <Badge tone="warning">Quote only — no payment initiated</Badge>
                </div>
                <div className="quote-details">
                  <div className="quote-meta"><span>Quote ID: <span className="mono">{quote.quoteId}</span></span><span>Expires: <span className="mono">{new Date(quote.expiresAt).toLocaleString()}</span></span></div>
                  <div className="quote-breakdown">
                    <div className="summary-row"><span>Subtotal</span><strong>{formatNgn(quote.subtotalNgn)}</strong></div>
                    <div className="summary-row"><span>Platform fee</span><strong>{formatNgn(quote.platformFeeNgn)}</strong></div>
                    <div className="summary-row"><span>Shipping</span><strong>{formatNgn(quote.shippingNgn)}</strong></div>
                    <div className="summary-row total"><span>Total (server-calculated)</span><strong>{formatNgn(quote.totalNgn)}</strong></div>
                  </div>
                  <div className="quote-items">
                    <strong>Items:</strong>
                    <ul>{quote.items.map(item => <li key={`${item.productId}-${item.variantId}`}>{item.title} — {item.variantLabel} × {item.quantity} = {formatNgn(item.lineTotalNgn)}</li>)}</ul>
                  </div>

                  <div className="payment-section">
                    <h3>Pay with Paystack</h3>
                    <label>
                      <span>Email for payment receipt</span>
                      <input type="email" value={paymentEmail} onChange={(e) => setPaymentEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" disabled={paymentLoading} />
                    </label>
                    {paymentError && <StatusNotice tone="warning">{paymentError}</StatusNotice>}
                    <Button variant="primary" onClick={handleInitializePayment} disabled={paymentLoading} className="pay-button">
                      <WalletCards size={16} /> {paymentLoading ? 'Initializing...' : `Pay ${formatNgn(quote.totalNgn)} with Paystack`}
                    </Button>
                    <p className="payment-note">You will be redirected to Paystack to complete payment. This is a development integration — no real charges will be processed without Paystack credentials.</p>
                  </div>

                  <StatusNotice>This quote was calculated by the server using authoritative prices and inventory. No order was created. Payment initialization requires Paystack secret key configuration.</StatusNotice>
                </div>
              </GlassCard>
            )}

            <StatusNotice tone="warning">Never trust a browser-submitted price, vendor ID, stock count, discount, or payment status. The checkout API owns those decisions.</StatusNotice>
          </>
        )}
      </section>
    </PageFrame>
  )
}

function CustomerAccount({ user, onSignOut }: { user: NonNullable<ReturnType<typeof useAuth>['user']>; onSignOut: () => Promise<void> | void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderDetailResponse | null>(null)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCustomerOrders()
      .then(result => { if (!cancelled) setOrders(result.items) })
      .catch(error => { if (!cancelled) setOrdersError(error instanceof Error ? error.message : 'Unable to load your orders.') })
      .finally(() => { if (!cancelled) setLoadingOrders(false) })
    return () => { cancelled = true }
  }, [])

  const openOrder = async (orderId: string) => {
    setDetailLoading(true)
    try {
      setSelectedOrder(await getCustomerOrder(orderId))
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : 'Unable to load that order.')
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <PageFrame>
      <section className="content-section account-page">
        <div className="account-hero">
          <div>
            <div className="eyebrow">Your account</div>
            <h1>Welcome, {user.displayName ?? user.email}</h1>
            <p>Track purchases and keep your customer account in one place.</p>
          </div>
          <div className="auth-actions">
            <Link className="button button-soft" to="/stores">Continue shopping</Link>
            <Button variant="primary" onClick={() => onSignOut()}>Sign out</Button>
          </div>
        </div>

        <div className="section-heading compact"><div><div className="eyebrow">Orders</div><h2>Your recent purchases</h2></div><Badge tone="positive">Server-backed</Badge></div>
        {ordersError && <StatusNotice tone="warning">{ordersError}</StatusNotice>}
        {loadingOrders ? <div className="empty-state"><h3>Loading your orders…</h3><p>Fetching your latest purchases securely.</p></div> : orders.length === 0 ? <EmptyState icon={<ShoppingBag />} title="No orders yet" body="Your paid purchases will appear here after checkout." action={<Link className="button button-soft" to="/stores">Browse products</Link>} /> : <div className="order-list">{orders.map(order => <button type="button" className="glass-card order-card" key={order.id} onClick={() => openOrder(order.id)}><div><span className="eyebrow">{order.id}</span><h3>{order.items.length} item{order.items.length === 1 ? '' : 's'}</h3><p>{new Date(order.createdAt).toLocaleString()} · {order.status}</p></div><strong>{formatNgn(order.totalNgn)}</strong></button>)}</div>}

        {detailLoading && <StatusNotice>Loading order details…</StatusNotice>}
        {selectedOrder && <GlassCard className="order-detail-card"><div className="card-heading"><div><div className="eyebrow">Order details</div><h2>{selectedOrder.order.id}</h2></div><Badge tone="positive">{selectedOrder.order.status}</Badge></div><div className="order-items">{selectedOrder.order.items.map(item => <div className="order-item-row" key={`${item.productId}:${item.variantId}`}><span>{item.title} · {item.variantLabel} × {item.quantity}</span><strong>{formatNgn(item.lineTotalNgn)}</strong></div>)}</div><div className="order-total-row"><span>Total</span><strong>{formatNgn(selectedOrder.order.totalNgn)}</strong></div><Button variant="soft" onClick={() => setSelectedOrder(null)}>Close details</Button></GlassCard>}
      </section>
    </PageFrame>
  )
}

export function AccountPage() {
  const { user, loading, signIn, signUp, resetPassword, logOut } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else if (mode === 'signup') {
        await signUp(email, password, name)
      } else if (mode === 'reset') {
        await resetPassword(email)
        setSuccess('Password reset email sent. Check your inbox.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    }
  }

  if (loading) {
    return <PageFrame><section className="auth-page"><div className="auth-card"><div className="loading-spinner" /></div></section></PageFrame>
  }

  if (user) {
    return <CustomerAccount user={user} onSignOut={logOut} />
  }

  return (
    <PageFrame>
      <section className="auth-page">
        <div className="auth-card">
          <Brand />
          <div className="eyebrow">Account access</div>
          <h1>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h1>
          <p className="auth-subtext">
            {mode === 'signin' && 'Enter your credentials to access your account.'}
            {mode === 'signup' && 'Create an account to start selling or shopping.'}
            {mode === 'reset' && 'Enter your email to receive a password reset link.'}
          </p>
          {error && <StatusNotice tone="warning">{error}</StatusNotice>}
          {success && <StatusNotice tone="info">{success}</StatusNotice>}
          <form onSubmit={handleSubmit} className="auth-form">
            {(mode === 'signup') && (
              <label>
                <span>Display name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required={mode === 'signup'} />
              </label>
            )}
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
            </label>
            {(mode !== 'reset') && (
              <label>
                <span>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
              </label>
            )}
            <Button type="submit" className="auth-submit" disabled={!email || (mode !== 'reset' && !password)}>
              {mode === 'signin' && 'Sign in'}
              {mode === 'signup' && 'Create account'}
              {mode === 'reset' && 'Send reset link'}
            </Button>
          </form>
          <div className="auth-toggle">
            {mode === 'signin' && <span>Don't have an account? <button type="button" onClick={() => setMode('signup')}>Sign up</button></span>}
            {mode === 'signin' && <span className="divider">|</span>}
            {mode === 'signin' && <span><button type="button" onClick={() => setMode('reset')}>Forgot password?</button></span>}
            {mode === 'signup' && <span>Already have an account? <button type="button" onClick={() => setMode('signin')}>Sign in</button></span>}
            {mode === 'reset' && <span><button type="button" onClick={() => setMode('signin')}>Back to sign in</button></span>}
          </div>
        </div>
      </section>
    </PageFrame>
  )
}

function VendorHeader({ title, subtitle }: { title: string; subtitle: string }) { return <div className="vendor-topbar"><div className="mobile-brand"><Brand compact /></div><div><div className="eyebrow">Merchant OS / Amina Luxury</div><h1>{title}</h1><p>{subtitle}</p></div><div className="vendor-top-actions"><Badge tone="warning">Preview mode</Badge><ThemeToggle /><a className="icon-button mobile-menu" href="#merchant-mobile-navigation" aria-label="Open merchant navigation"><Menu size={18} /></a></div></div> }

export function VendorDashboard() { const metrics: Array<[string, string, string, LucideIcon]> = [['Today\'s gross sales', '—', 'No transactions loaded', BarChart3], ['Orders in progress', '—', 'Order feed not connected', PackageCheck], ['Customer conversations', '—', 'WhatsApp not configured', Headphones], ['Available to settle', '—', 'Payouts feature-gated', WalletCards]]; const commands: Array<[string, string, LucideIcon]> = [['Add a product', '/vendor/products', Plus], ['Review orders', '/vendor/orders', PackageCheck], ['Open AI toolkit', '/vendor/ai', Sparkles], ['Edit store', '/vendor/settings', PanelTop]]; return <PageFrame header="vendor" mobileVendor><VendorHeader title="Home & Hub" subtitle="A calm operational view for the work behind every sale." /><div className="vendor-content"><StatusNotice>Live metrics are intentionally empty. Connect Firestore analytics before displaying sales, inventory, customer, or payout numbers.</StatusNotice><div className="metric-grid">{metrics.map(([label, value, note, Icon]) => <GlassCard className="metric-card" key={label}><div className="metric-card-head"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{note}</small></GlassCard>)}</div><div className="dashboard-columns"><GlassCard><div className="card-heading"><div><div className="eyebrow">Quick command hub</div><h2>Choose the next useful action.</h2></div><Badge tone="info">4 surfaces</Badge></div><div className="command-grid">{commands.map(([label, to, Icon]) => <Link className="command-card" key={to} to={to}><span><Icon size={19} /></span><strong>{label}</strong><ArrowRight size={15} /></Link>)}</div></GlassCard><GlassCard><div className="card-heading"><div><div className="eyebrow">Operational feed</div><h2>Nothing needs action.</h2></div><Clock3 size={18} /></div><EmptyState icon={<CircleAlert />} title="No live events yet" body="Payment events, order transitions, low-stock warnings, and AI jobs will appear here after their backend services are connected." /></GlassCard></div></div></PageFrame> }

export function VendorProductsPage() {
  const { vendorId } = useAuth()
  const [products, setProducts] = useState<VendorProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategory, setNewCategory] = useState('Silk wraps')
  const [newStock, setNewStock] = useState('10')
  const [uploading, setUploading] = useState(false)

  const selectedProduct = products.find(product => product.id === selectedId) ?? null

  const loadProducts = async () => {
    if (!vendorId) return
    setLoading(true)
    setError(null)
    try {
      const result = await getVendorProducts(vendorId)
      setProducts(result.items)
      setSelectedId(current => current && result.items.some(item => item.id === current) ? current : result.items[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load products.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadProducts() }, [vendorId])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!vendorId) return
    const priceNgn = Number(newPrice)
    const stock = Number(newStock)
    if (!newTitle.trim() || !Number.isInteger(priceNgn) || priceNgn <= 0 || !Number.isInteger(stock) || stock < 0) {
      setError('Enter a product name, whole-number price, and valid opening stock.')
      return
    }
    setSaving(true); setError(null); setNotice(null)
    try {
      const result = await createVendorProduct({
        storeId: demoStore.id,
        vendorId,
        title: newTitle.trim(),
        description: '',
        priceNgn,
        category: newCategory.trim() || 'General',
        material: '',
        accent: '#10b981',
        status: 'draft',
        mediaIds: [],
        variants: [{ label: 'Default', priceNgn, stock, lowStockThreshold: 3 }],
      })
      setProducts(current => [result.product, ...current])
      setSelectedId(result.product.id)
      setNewTitle(''); setNewPrice(''); setNewStock('10')
      setNotice('Draft product created. Add media, adjust stock, then publish when ready.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Product creation failed.')
    } finally { setSaving(false) }
  }

  const handlePublish = async () => {
    if (!selectedProduct) return
    setSaving(true); setError(null)
    try {
      const result = await updateVendorProduct(selectedProduct.id, { status: selectedProduct.status === 'active' ? 'draft' : 'active' })
      setProducts(current => current.map(product => product.id === result.product.id ? result.product : product))
      setNotice(result.product.status === 'active' ? 'Product published.' : 'Product moved back to draft.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update product.') }
    finally { setSaving(false) }
  }

  const handleInventory = async (variantId: string, type: 'restock' | 'damage') => {
    if (!selectedProduct) return
    const raw = window.prompt(type === 'restock' ? 'How many units to add?' : 'How many units were damaged/lost?')
    const quantity = Number(raw)
    if (!Number.isInteger(quantity) || quantity < 1) return
    setSaving(true); setError(null)
    try {
      const result = await adjustVendorInventory(selectedProduct.id, variantId, { type, quantity, reason: type === 'restock' ? 'Vendor restock' : 'Vendor stock adjustment' })
      setProducts(current => current.map(product => product.id === result.product.id ? result.product : product))
      setNotice(`${type === 'restock' ? 'Restocked' : 'Adjusted'} ${quantity} unit${quantity === 1 ? '' : 's'}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Inventory adjustment failed.') }
    finally { setSaving(false) }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedProduct || !vendorId) return
    setUploading(true); setError(null); setNotice(null)
    try {
      const result = await createUploadUrl({ filename: file.name, mimeType: file.type, size: file.size, type: 'product', vendorId })
      await uploadFileToR2(result.uploadUrl, file, result.headers)
      const completed = await completeUpload(result.mediaId)
      const attached = await attachProductMedia(selectedProduct.id, completed.mediaId)
      setProducts(current => current.map(product => product.id === attached.product.id ? attached.product : product))
      setNotice(`Uploaded, verified, and attached ${file.name} to ${selectedProduct.title}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Product media upload failed.') }
    finally { setUploading(false); event.target.value = '' }
  }

  return (
    <PageFrame header="vendor" mobileVendor>
      <VendorHeader title="Products" subtitle="Create, publish, stock, and attach verified R2 media from one catalog workspace." />
      <div className="vendor-content">
        {error && <StatusNotice tone="warning">{error}</StatusNotice>}
        {notice && <StatusNotice tone="positive">{notice}</StatusNotice>}

        <div className="dashboard-columns">
          <GlassCard>
            <div className="card-heading"><div><div className="eyebrow">Catalog</div><h2>{loading ? 'Loading…' : `${products.length} product${products.length === 1 ? '' : 's'}`}</h2></div><Badge tone="positive">Server catalog</Badge></div>
            {loading ? <div className="loading-spinner" /> : products.length === 0 ? <EmptyState icon={<PackageCheck />} title="No products yet" body="Create your first draft below." /> : <div className="order-list">{products.map(product => <button type="button" className={`command-card ${selectedId === product.id ? 'selected' : ''}`} key={product.id} onClick={() => setSelectedId(product.id)}><span><PackageCheck size={18} /></span><div><strong>{product.title}</strong><small>{product.status.replaceAll('_', ' ')} · {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}</small></div><ArrowRight size={15} /></button>)}</div>}
          </GlassCard>

          <GlassCard>
            <div className="card-heading"><div><div className="eyebrow">New product</div><h2>Start with a draft</h2></div><Plus size={18} /></div>
            <form onSubmit={handleCreate} className="settings-grid">
              <label>Product name<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Gold Lace Set" /></label>
              <label>Price (NGN)<input type="number" min="1" step="1" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="25000" /></label>
              <label>Category<input value={newCategory} onChange={e => setNewCategory(e.target.value)} /></label>
              <label>Opening stock<input type="number" min="0" step="1" value={newStock} onChange={e => setNewStock(e.target.value)} /></label>
              <Button type="submit" variant="primary" disabled={saving || !vendorId}><Plus size={16} /> {saving ? 'Creating…' : 'Create draft'}</Button>
            </form>
          </GlassCard>
        </div>

        {selectedProduct && <GlassCard>
          <div className="card-heading"><div><div className="eyebrow">Product control</div><h2>{selectedProduct.title}</h2><p>{selectedProduct.slug} · {selectedProduct.status.replaceAll('_', ' ')}</p></div><div className="page-actions"><Button variant={selectedProduct.status === 'active' ? 'soft' : 'primary'} onClick={handlePublish} disabled={saving}>{selectedProduct.status === 'active' ? 'Move to draft' : 'Publish product'}</Button></div></div>
          <div className="order-items">
            {selectedProduct.variants.map(variant => <div className="order-item-detail" key={variant.id}><div><strong>{variant.label}</strong><span>{formatNgn(variant.priceNgn)} · low-stock threshold {variant.lowStockThreshold}</span></div><div className="page-actions"><Badge tone={variant.stock <= variant.lowStockThreshold ? 'warning' : 'positive'}>{variant.stock} in stock</Badge><Button variant="soft" onClick={() => handleInventory(variant.id, 'restock')} disabled={saving}>+ Stock</Button><Button variant="soft" onClick={() => handleInventory(variant.id, 'damage')} disabled={saving || variant.stock < 1}>Adjust</Button></div></div>)}
          </div>
          <div className="upload-area">
            <div><div className="eyebrow">R2 media</div><h3>Attach verified product media</h3><p>Upload → verify with R2 HEAD → attach the resulting media record to this product.</p></div>
            <label className="button button-soft">{uploading ? 'Uploading…' : 'Choose image/video'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" hidden onChange={handleFileSelect} disabled={uploading} /></label>
          </div>
          {selectedProduct.mediaIds.length > 0 && <div className="microcopy">Attached media: {selectedProduct.mediaIds.join(', ')}</div>}
        </GlassCard>}
      </div>
    </PageFrame>
  )
}

export function VendorAiPage() { const [selectedTool, setSelectedTool] = useState<string | null>(null); const tools = [['AI Visual Studio', 'Private image job pipeline with validation and signed media.', ImagePlus, 'Upload unavailable'], ['Copy & Caption Crafter', 'Editable copy suggestions grounded in your real product fields.', Sparkles, 'AI provider not configured'], ['Voice-to-Store', 'Transcribe a vendor confirmation before any product write.', Mic, 'Voice pipeline unavailable'], ['Restock Predictor', 'Advisory inventory signals, never an automatic purchase.', ArrowDownRight, 'Analytics unavailable']] as const; return <PageFrame header="vendor" mobileVendor><VendorHeader title="AI Toolkit" subtitle="Useful assistance with explicit permissions, quotas, and confirmation." /><div className="vendor-content"><StatusNotice>All AI tools are feature-gated. No fake processing animation or fabricated recommendation is shown.</StatusNotice><div className="ai-tool-grid">{tools.map(([title, body, Icon, status]) => <button type="button" className={`glass-card ai-tool-card ${selectedTool === title ? 'selected' : ''}`} key={title} onClick={() => setSelectedTool(title)}><div className="ai-tool-icon"><Icon size={20} /></div><Badge tone="violet">Feature gated</Badge><h2>{title}</h2><p>{body}</p><div className="ai-tool-footer"><span>{status}</span><ArrowRight size={15} /></div></button>)}</div>{selectedTool && <GlassCard className="tool-detail"><button className="icon-button close-tool" aria-label="Close tool details" onClick={() => setSelectedTool(null)}><X size={16} /></button><div className="eyebrow">{selectedTool}</div><h2>Controlled operation required</h2><p>This tool will need authenticated vendor context, usage quota, schema validation, audit logging, and a backend job before it can process anything. No data was sent.</p><Button disabled><Sparkles size={16} /> Start unavailable</Button></GlassCard>}</div></PageFrame> }

export function VendorSettingsPage() { return <PageFrame header="vendor" mobileVendor><VendorHeader title="Store settings" subtitle="Configuration is separated from runtime commerce state." /><div className="vendor-content"><StatusNotice>Settings writes are unavailable until Firebase Authentication and vendor ownership checks are configured.</StatusNotice><GlassCard><div className="card-heading"><div><div className="eyebrow">Store profile</div><h2>{demoStore.name}</h2></div><Badge tone="warning">Draft controls unavailable</Badge></div><div className="settings-grid"><label>Store name<input value={demoStore.name} readOnly /></label><label>Store slug<input value={demoStore.slug} readOnly /></label><label>Public location<input value={demoStore.location} readOnly /></label><label>Store status<input value={demoStore.status} readOnly /></label></div></GlassCard></div></PageFrame> }

export function LegalPage({ document }: { document: string }) { return <PageFrame><section className="content-section legal-page"><Badge tone="warning">Needs human/legal review</Badge><div className="eyebrow">Policy draft</div><h1>{document}</h1><p className="hero-lede">This route exists so the application has an explicit legal surface. Final copy, business identity, provider terms, retention periods, consumer rights, and Nigerian legal review are required before production.</p><GlassCard><h2>Production status</h2><p>No legal representation is being made by this development environment. Do not publish this draft as a completed policy. Replace it with approved, versioned content and record the effective date.</p><ul className="trust-list"><CheckItem>Use verified business contact details</CheckItem><CheckItem>Document Firebase, Paystack, Cloudflare R2, AI, email, and messaging processors</CheckItem><CheckItem>Explain data collection, retention, deletion, and user rights</CheckItem><CheckItem>Do not promise regulated escrow, insurance, or unsupported guarantees</CheckItem></ul></GlassCard></section></PageFrame> }

function StorefrontIcon() { return <Store size={21} /> }