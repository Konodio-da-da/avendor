# AVENDOR HUB Architecture

## Runtime

- React + Vite + TypeScript frontend.
- Node.js + Express + TypeScript API.
- Firestore for commerce data and aggregate summaries.
- Firebase Authentication for identity and credential lifecycle.
- Cloudflare R2 for public product media and private files with signed URLs.
- Paystack for configured payment infrastructure; all secret operations remain server-side.
- Background jobs for AI/image processing, notifications, analytics, reconciliation, reservation expiry, and cleanup.

## Trust Boundaries

The browser is untrusted. The API authenticates identity, checks role and resource ownership, validates input, recalculates money/inventory, executes allowed state transitions, and writes audit/ledger records. Provider webhooks are signature-checked, idempotent, and verified against expected transaction data.

## Frontend Surfaces

Public routes cover landing, store discovery, store pages, products, search, cart, checkout, orders, and account. Vendor routes preserve the supplied merchant navigation: Home & Hub, Products, Orders & Dispatch, Customers, AI Toolkit, Broadcasts, Escrow & Payout, Store Settings, and Pidgin Support. Admin routes will be isolated by server claims and noindex metadata.

## Multi-Tenancy

Every vendor resource has permanent ownership identifiers. Vendor staff receives explicit permissions. Vendor A cannot query, mutate, or receive cached responses for Vendor B. Public DTOs omit private analytics, payout data, customer lists, and internal metadata.

## Scaling Approach

Cursor pagination, bounded reads, aggregate analytics documents, selective realtime listeners, cacheable public data, background jobs, idempotency, and provider adapters support the initial 5,000-10,000 DAU target without tying the UI to one search or logistics provider.

## Current Limitations

This repository currently contains a foundation and development fixtures. Auth, Firestore runtime, Cloudflare R2 credentials, Paystack, AI providers, WhatsApp, notifications, and production observability still require production configuration/integration. See `PRODUCTION_READINESS.md`.
