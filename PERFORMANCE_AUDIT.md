# Performance Audit

Status: baseline architecture review. No browser build or load test was executed because dependency installation timed out while contacting the npm registry.

## Current Baseline

- The public app uses route-level React structure but has not yet been code-split with `lazy` imports.
- Product artwork is generated as small inline SVG data fixtures for the new development UI; prototype external images are not imported by the runtime.
- Public catalog API responses set short cache headers and expose development mode explicitly.
- Catalog queries are bounded and validated, but Firestore-backed cursor pagination is not yet connected.
- Vendor metrics are empty instead of causing unbounded order scans.
- Glass effects are limited to structural surfaces; reduced-motion CSS is included.

## Blocked Measurements

- Bundle size and largest assets.
- LCP, INP, CLS, FCP, TTFB.
- API p50/p95/p99 latency.
- Firestore read/write counts.
- Cloudflare R2 transfer and future image variant performance.
- 5k/10k/20k DAU load profile.

## Required Next Measurements

1. Install dependencies and build production bundles.
2. Run Lighthouse and accessibility checks at 320, 390, 768, 1280, and 1440px.
3. Add route-level code splitting and verify public pages do not load vendor/admin code.
4. Add image processing variants and measure grid transfer size.
5. Load test search, product, checkout, dashboard, and order tracking with cursor pagination.
