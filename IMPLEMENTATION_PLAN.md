# AVENDOR HUB Implementation Plan

Target: production-oriented Nigerian-first multi-tenant commerce SaaS for 5,000-10,000 daily active users, with an architecture that can scale beyond the initial target.

## Delivery Principles

- Build a real application, not a static conversion of the prototypes.
- Preserve reference HTML and the luminous glass design language; do not copy fake data or unsupported claims.
- Treat the browser as untrusted. Recalculate all prices, permissions, inventory, fees, payouts, and payment states on the server.
- Ship vertical slices with tests rather than implementing disconnected screens.
- Keep unavailable integrations visibly unavailable instead of simulating success.
- Use feature flags for AI, WhatsApp, payouts, manual transfers, advanced analytics, reviews, and other high-risk features.

## Proposed Repository Shape

```text
apps/
  web/                 React + Vite + TypeScript
  api/                 Node + Express + TypeScript
packages/
  shared/              domain types, enums, validation schemas, API contracts
  design-system/       tokens, primitives, accessible components
  config/              typed environment/config helpers
firebase/
  firestore.rules
  firestore.indexes.json
  storage.rules
  tests/
docs/
  architecture and operational reports
tests/
  security, API, E2E, accessibility, and load test plans
reference/
  supplied HTML/design files kept unchanged or copied as explicitly marked references
```

If a single-package layout is preferred during the first slice, preserve the same boundaries under `src`, `server`, and `shared` so extraction remains possible.

## Phase 1: Foundation and Audit

1. Keep all supplied reference files unchanged.
2. Create `package.json`, lockfile, TypeScript configs, lint/format/test configs, and environment templates.
3. Add secret scanning and ignore rules before adding integrations.
4. Record the current state in `ARCHITECTURE_AUDIT.md`.
5. Create feature-flag and legal-claims configuration that defaults risky features off.
6. Establish CI checks: typecheck, lint, unit tests, build, dependency audit, secret scan.

Exit criteria: clean scaffold builds with no secrets, and references remain available for visual comparison.

## Phase 2: Design System and Application Shell

1. Convert `luminous_glass_enterprise.md` into centralized CSS variables/Tailwind tokens.
2. Add Plus Jakarta Sans and JetBrains Mono with a controlled loading strategy.
3. Implement dark, light, and system theme modes without initial flash.
4. Build accessible primitives: button, input, dialog, drawer, tabs, badge, card, table, toast, skeleton, empty state, error state, and confirmation dialog.
5. Implement skip link, focus styles, reduced motion, responsive breakpoints, and mobile bottom navigation.
6. Add public shell, authenticated shell, vendor shell, and admin shell with noindex controls for private routes.

Exit criteria: responsive shell matches the supplied visual direction without hardcoded business data.

## Phase 3: Domain Model and Firebase Security

1. Define shared strict TypeScript models for users, vendors, stores, products, variants, inventory, carts, checkout sessions, orders, payments, refunds, payouts, disputes, reviews, notifications, AI jobs, consents, and audit logs.
2. Define Firestore collection ownership and index requirements.
3. Create Firestore rules for anonymous public reads, customer ownership, vendor/store ownership, vendor-staff permissions, admin claims, and super-admin controls.
4. Add rules tests for anonymous, customer, vendor A, vendor B, vendor staff, admin, and super admin.
5. Add Firebase Auth integration with email verification, password reset, logout, session persistence, and generic authentication errors.
6. Add App Check evaluation and enablement plan.

Exit criteria: cross-tenant reads/writes fail in automated rule and API authorization tests.

## Phase 4: Backend Security Foundation

1. Implement `/health` and `/ready` without secrets.
2. Add request IDs, structured logs, Helmet, compression, strict CORS, body/query limits, and production-safe error handling.
3. Add Zod validation for body, query, params, headers, uploaded metadata, webhook payloads, AI input, and IDs.
4. Add layered rate limiting for auth, registration, reset, search, checkout, AI, uploads, reviews, payouts, admin, and webhook handling.
5. Implement authentication, server-side role lookup, vendor ownership, staff permissions, and resource authorization middleware.
6. Add audit-log service for security and high-risk mutations.

Exit criteria: API errors use the documented shape and no stack traces/secrets are returned.

## Phase 5: Public Storefront and Store Builder

1. Implement `/`, `/stores`, `/stores/:storeSlug`, `/products`, `/products/:productSlug`, `/categories`, and `/search`.
2. Build product cards, store header/hero/sections, product gallery, variant selector, reviews placeholder with honest empty states, and product-aware AI entry point.
3. Implement store builder draft/preview/publish with a whitelisted section schema and no arbitrary HTML/JS.
4. Implement normalized unique slugs and reserved-word protection.
5. Add SEO metadata, canonical URLs, Open Graph, Product/Store structured data only from real data.
6. Replace external prototype imagery with owned, licensed, vendor-uploaded, or clearly development-only assets.

Exit criteria: public routes are server-backed, paginated, responsive, keyboard accessible, and contain no fabricated metrics.

## Phase 6: Products, Media, and Inventory

1. Implement vendor product CRUD, variants, bulk actions, archive/restore, publish flow, SKU, categories, and collection associations.
2. Implement Cloudflare R2 upload service with size/type/extension/dimension validation, safe filenames, private/public separation, signed URLs, responsive image variants, and cleanup jobs.
3. Add product moderation states and audit events.
4. Implement server-controlled inventory and transactions for stock changes.
5. Add reservation model with expiry and abuse limits if reservations are enabled.

Exit criteria: no frontend-provided price, stock, vendor ID, image metadata, or status can directly mutate trusted state.

## Phase 7: Cart, Checkout, and Paystack

1. Implement authenticated/guest cart with product, variant, quantity, store, and vendor IDs.
2. At checkout, refetch active products and variants, validate inventory, calculate discounts, shipping, platform fee, payment fee, tax, currency, and final amount.
3. Split a parent checkout into vendor-specific order portions.
4. Require idempotency keys for checkout and payment initialization.
5. Initialize Paystack only from the server using an expected amount/reference and validated server metadata.
6. Implement raw-body webhook signature verification, event idempotency, provider verification, amount/currency/reference comparison, payment state transition, order creation, inventory commit, ledger entries, and notifications.
7. Make the frontend callback informational only; it must query the backend for verified state.

Exit criteria: price tampering, vendor tampering, quantity tampering, fake success, fake references, forged webhooks, and replayed webhooks fail safely.

## Phase 8: Orders, Delivery, Disputes, Refunds, and Ledger

1. Implement controlled order state transitions.
2. Add shipment/tracking abstractions without claiming live provider integration until connected.
3. Implement delivery OTP as a hashed, expiring, attempt-limited verification value.
4. Implement disputes with customer/vendor visibility boundaries and admin review.
5. Implement refund requests, eligibility checks, approval, Paystack refund execution, verification, idempotency, ledger, and notifications.
6. Implement immutable financial ledger entries for payment, fee, vendor amount, refund, payout, hold, release, adjustment, and chargeback.
7. Add waybill and receipt generation only from authorized order data, with print/PDF/thermal layouts.

Exit criteria: impossible state transitions, unauthorized disputes/refunds, duplicate refunds, and unbalanced ledger mutations are rejected.

## Phase 9: Vendor Dashboard and Staff

1. Implement dashboard home with real aggregate documents and honest empty states.
2. Implement products, orders, customers, inventory, analytics, marketing, discounts, payments, payouts, store, settings, AI, broadcasts, and support routes.
3. Preserve the existing navigation and mobile concepts.
4. Implement staff invitations with expiry, permissions, notifications, and revocation.
5. Add complete button/action inventory and remove dead controls.

Exit criteria: vendor A cannot access vendor B resources through any route, query, or UI action.

## Phase 10: Admin and Operations

1. Implement admin routes with Auth plus server role verification.
2. Add vendor/store/product/order/customer/payment/payout/refund/dispute moderation.
3. Add commission configuration with historical rate snapshots.
4. Add security, audit-log, reports, and system-health views.
5. Require confirmations and audit logs for refunds, payouts, role changes, suspensions, and deletion/anonymization.

Exit criteria: sensitive admin actions are permissioned, confirmed, audited, and rate-limited.

## Phase 11: AI, WhatsApp, Notifications, and Jobs

1. Implement server-only AI provider adapter with quotas, usage tracking, timeouts, retry policy, and feature flags.
2. Build structured product-copy, tags, price-advice, restock, shopping, image, and voice job contracts.
3. Treat all product/vendor/customer content as untrusted prompt data; use explicit tool allowlists and validate outputs.
4. Customer AI can query only public catalog data and the customer's own authorized data.
5. Vendor AI can query only that vendor's data.
6. Add WhatsApp provider abstraction and consent-aware outbound message logging. Do not use placeholder numbers.
7. Add notification center, preferences, retries, backoff, and dead-letter/error state.

Exit criteria: no AI output can directly publish, change price/stock, confirm payment, issue refund, or alter financial data without deterministic authorization and user confirmation.

## Phase 12: Privacy, Legal, SEO, Accessibility, and Performance

1. Implement `/privacy`, `/terms`, `/refund-policy`, `/cookie-policy`, and `/data-processing-agreement` with explicit placeholders that block production until completed.
2. Implement cookie consent with essential-only default, preference center, versioned consent records, and withdrawal behaviour.
3. Add account deletion request, anonymization/retention rules, privacy request workflow, and consent records.
4. Audit third-party resources, assets, analytics, cookies, embeds, and data transfers.
5. Complete WCAG 2.2 AA keyboard, focus, contrast, screen reader, dialog, form, table, image, and reduced-motion checks.
6. Add route-level code splitting, image variants, caching, compression, pagination, and aggregate analytics.

Exit criteria: no unresolved production legal placeholders, critical accessibility issues, private-route indexing, or unbounded list reads.

## Phase 13: Verification and Hardening

1. Unit tests for state machines, money, discount, commission, inventory, authorization, slug, and validation logic.
2. API and integration tests for auth, products, checkout, Paystack, orders, refunds, payouts, AI, uploads, and notifications.
3. Firestore and Storage rule tests.
4. Security tests for IDOR, role escalation, XSS, CSRF, SSRF, upload abuse, replay, CORS, rate-limit bypass, open redirects, cache poisoning, and sensitive-data exposure.
5. E2E happy-path checkout from vendor creation through delivery and settlement eligibility.
6. Load tests at 5k, 10k, and 20k DAU assumptions with p50/p95/p99 reporting.
7. Dependency, secret, license, copyright, privacy, button, API, database, cost, performance, and legal audits.
8. Produce `SECURITY_AUDIT.md`, `PERFORMANCE_AUDIT.md`, `FIREBASE_COST_AUDIT.md`, `DATABASE_ARCHITECTURE.md`, `API_DOCUMENTATION.md`, `ARCHITECTURE.md`, and `PRODUCTION_READINESS.md`.

Exit criteria: every readiness item is marked only `PASS`, `FAIL`, `BLOCKED`, or `NEEDS_HUMAN_REVIEW` based on evidence.

## Initial Vertical Slice Priority

The first implementation slice should be deliberately narrow but real:

1. React/Vite/TypeScript shell with the supplied design system.
2. Public catalog and product routes backed by typed development seed data clearly marked as non-production.
3. Vendor dashboard shell with real route structure and empty states, not fake metrics.
4. Express API foundation with health endpoint, validation, auth boundary, error format, and feature flags.
5. Firestore model/rules scaffolding and tests before financial writes.
6. Cart and server-recalculated checkout model before adding Paystack credentials.

This sequence creates a usable product foundation while avoiding the unsafe mistake of presenting prototype payment, escrow, AI, logistics, or analytics claims as live functionality.
