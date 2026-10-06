# Firebase Cost Audit

Status: architecture estimate only. No Firebase project or usage data is configured, so exact cost claims are intentionally omitted.

## Likely Cost Drivers

1. Firestore product/search reads if public catalog queries are unbounded or uncached.
2. Order/payment/event writes during checkout and webhook processing.
3. Realtime listeners attached to too many storefront or dashboard components.
4. Analytics event writes per page view rather than aggregated jobs.
5. Storage/bandwidth if original product images are served to grids.
6. Cloud Functions or background jobs for notifications, AI, image processing, cleanup, and reconciliation.
7. App Check, logging, and observability services depending on provider configuration.

## Controls in the Initial Scaffold

- Public catalog responses are bounded and receive short cache headers.
- Vendor dashboard metrics are empty until pre-aggregated documents exist.
- Firestore indexes start empty and should be added only for reviewed cursor-paginated queries.
- Static catalog and store content should not use realtime listeners.
- Product media targets Cloudflare R2, with signed URLs implemented and variants/processing planned.
- Feature flags prevent AI, messaging, payouts, and manual transfer writes until provider/cost controls exist.

## Required Before Launch

- Establish budget alerts and per-service usage dashboards.
- Measure reads/writes/listeners at 5k, 10k, and 20k DAU assumptions.
- Document retention and cleanup jobs for temporary files, AI conversations, webhook events, and notifications.
- Verify private cache keys always include resource identity and authorization context.
