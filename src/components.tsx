import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowRight, Check, CircleHelp, Moon, PackageSearch, ShoppingBag, Sun, Sparkles, Store, SunMedium } from 'lucide-react'
import { useTheme } from './theme'
import type { Product } from './types'
import { formatNgn } from './lib/format'

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className="brand" to="/" aria-label="AVENDOR HUB home"><span className="brand-mark"><Sparkles size={16} /></span><span><strong>AVENDOR HUB</strong>{!compact && <small>Commerce intelligence for here</small>}</span></Link>
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return <button className="icon-button" aria-label={`Switch to ${next} mode`} onClick={() => setTheme(next)}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
}

export function Button({ children, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger' }) {
  return <button className={`button button-${variant}`} {...props}>{children}</button>
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'positive' | 'warning' | 'violet' | 'info' }>) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>
}

export function GlassCard({ children, className = '', ...props }: PropsWithChildren<{ className?: string } & HTMLAttributes<HTMLElement>>) {
  return <section className={`glass-card ${className}`} {...props}>{children}</section>
}

export function StatusNotice({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'warning' }>) {
  return <div className={`status-notice ${tone}`}><CircleHelp size={16} /><span>{children}</span></div>
}

export function MarketingHeader() {
  return <header className="site-header"><Brand /><nav className="desktop-nav" aria-label="Main navigation"><a href="#capabilities">Capabilities</a><a href="#workflow">How it works</a><a href="#trust">Trust model</a></nav><div className="header-actions"><ThemeToggle /><Link className="button button-soft hide-mobile" to="/stores/amina-luxury-fabrics">View demo store</Link><Link className="button button-primary" to="/vendor">Open merchant OS <ArrowRight size={16} /></Link></div></header>
}

export function ProductCard({ product }: { product: Product }) {
  return <article className="product-card"><Link to={`/products/${product.slug}`} className="product-art" style={{ background: `linear-gradient(135deg, ${product.accent}, #09111c)` }}><img src={product.images[0]} alt={`${product.title} product artwork`} loading="lazy" /><span className="art-label">Published catalog</span></Link><div className="product-card-body"><div className="eyebrow">{product.category}</div><Link to={`/products/${product.slug}`}><h3>{product.title}</h3></Link><p>{product.material}</p><div className="product-price-row"><strong>{formatNgn(product.priceNgn)}</strong>{product.compareAtPriceNgn && <del>{formatNgn(product.compareAtPriceNgn)}</del>}<Link className="round-action" aria-label={`View ${product.title}`} to={`/products/${product.slug}`}><ArrowRight size={16} /></Link></div></div></article>
}

export function Footer() {
  return <footer className="site-footer"><div><Brand compact /><p>Tools for vendors who sell from a phone, a market stall, a studio, and everywhere in between.</p></div><div className="footer-links"><strong>Explore</strong><Link to="/stores">Stores</Link><Link to="/vendor">Merchant OS</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div><div className="footer-meta"><Badge tone="warning">Development environment</Badge><span>Production payment and AI integrations are not enabled.</span></div></footer>
}

export function StoreHeader() {
  return <header className="store-header"><Brand compact /><nav className="store-nav"><NavLink to="/stores">Discover</NavLink><NavLink to="/stores/amina-luxury-fabrics">Store home</NavLink><NavLink to="/cart"><ShoppingBag size={16} /> Bag</NavLink></nav><div className="header-actions"><ThemeToggle /><Link className="avatar-link" to="/account" aria-label="Open account"><SunMedium size={17} /></Link></div></header>
}

export function VendorSidebar() {
  const nav = [
    ['Home & Hub', '/vendor', Store], ['Products', '/vendor/products', PackageSearch], ['Orders & Dispatch', '/vendor/orders', ShoppingBag], ['AI Toolkit', '/vendor/ai', Sparkles],
  ] as const
  return <aside className="vendor-sidebar"><Brand /><div className="tenant-switcher"><span className="tenant-icon">AL</span><span><strong>Amina Luxury</strong><small>Development store</small></span><span className="status-dot" /></div><nav aria-label="Merchant navigation">{nav.map(([label, to, Icon]) => <NavLink key={to} end={to === '/vendor'} to={to} className="side-link"><Icon size={17} /><span>{label}</span>{label === 'AI Toolkit' && <Badge tone="violet">4</Badge>}</NavLink>)}</nav><div className="sidebar-spacer" /><StatusNotice>Payment, payouts, and AI are feature-gated until provider setup is complete.</StatusNotice><Link className="side-link" to="/vendor/settings"><CircleHelp size={17} />Settings & support</Link></aside>
}

export function MobileNav({ vendor = false }: { vendor?: boolean }) {
  const links = vendor ? [['Home', '/vendor'], ['Products', '/vendor/products'], ['Orders', '/vendor/orders'], ['AI', '/vendor/ai']] : [['Home', '/stores/amina-luxury-fabrics'], ['Stores', '/stores'], ['Bag', '/cart'], ['Account', '/account']]
  return <nav id="merchant-mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{links.map(([label, to]) => <NavLink key={to} to={to}><span>{label === 'AI' ? <Sparkles size={17} /> : label === 'Bag' ? <ShoppingBag size={17} /> : label === 'Stores' ? <Store size={17} /> : <SunMedium size={17} />}</span>{label}</NavLink>)}</nav>
}

export function EmptyState({ icon = <PackageSearch size={24} />, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{body}</p>{action}</div>
}

export function AuthNote() {
  return <StatusNotice>Preview mode: Firebase Authentication is not configured. No account or payment data is being collected.</StatusNotice>
}

export function CheckItem({ children }: PropsWithChildren) {
  return <li><span className="check-icon"><Check size={13} /></span>{children}</li>
}

export interface OrderCardProps {
  order: {
    id: string
    quoteId: string
    paymentRef: string
    status: string
    createdAt: string
    items: Array<{ title: string; variantLabel: string; quantity: number; vendorId: string; lineTotalNgn: number }>
    totalNgn: number
    customerEmail: string
  }
  onClick: () => void
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const statusColors: Record<string, 'neutral' | 'positive' | 'warning' | 'violet' | 'info'> = {
    PAID: 'positive',
    PROCESSING: 'info',
    READY_TO_SHIP: 'violet',
    SHIPPED: 'violet',
    DELIVERED: 'positive',
    SETTLEMENT_PENDING: 'warning',
    SETTLED: 'positive',
    CANCELLED: 'warning',
    REFUND_PENDING: 'warning',
    DISPUTED: 'warning',
  }
  const tone = statusColors[order.status] ?? 'neutral'

  return (
    <button className="order-card" onClick={onClick} type="button">
      <div className="order-card-header">
        <div>
          <span className="mono">#{order.id.slice(0, 8)}</span>
          <Badge tone={tone}>{order.status.replaceAll('_', ' ')}</Badge>
        </div>
        <span className="mono">{new Date(order.createdAt).toLocaleString()}</span>
      </div>
      <div className="order-card-body">
        <div className="order-items-preview">
          {order.items.slice(0, 3).map((item, i) => (
            <div key={i} className="order-item-preview">
              <span>{item.title}</span>
              <span className="mono">×{item.quantity}</span>
            </div>
          ))}
          {order.items.length > 3 && <span className="more-items">+{order.items.length - 3} more</span>}
        </div>
        <div className="order-card-footer">
          <span className="mono">{order.customerEmail}</span>
          <strong>{formatNgn(order.totalNgn)}</strong>
        </div>
      </div>
    </button>
  )
}
