# Database Architecture

## Ownership Model

Firestore is the commerce database. Public documents contain only public fields. Vendor-owned resources carry permanent `vendorId` and `storeId` identifiers. Slugs are normalized presentation identifiers and may change without changing document IDs.

## Planned Collections

`users`, `vendors`, `stores`, `vendorStaff`, `products`, `productVariants`, `categories`, `collections`, `inventory`, `carts`, `cartItems`, `checkoutSessions`, `orders`, `orderItems`, `payments`, `paymentEvents`, `payouts`, `payoutLedger`, `refunds`, `disputes`, `reviews`, `customers`, `addresses`, `discounts`, `coupons`, `shippingMethods`, `shippingZones`, `shippingRates`, `shipments`, `trackingEvents`, `notifications`, `analyticsDaily`, `analyticsMonthly`, `vendorAnalytics`, `aiUsage`, `aiJobs`, `aiConversations`, `aiMessages`, `broadcasts`, `webhookEvents`, `auditLogs`, `platformSettings`, `legalDocuments`, `cookiePreferences`, and `consents`.

## Rules

- Client writes to payments, orders, inventory, refunds, payouts, ledger, webhook events, and audit logs are denied.
- Server writes use Admin SDK, transactions, idempotency keys, and explicit authorization.
- Vendor access requires owner or staff membership plus permission.
- Customers access only their own account, orders, addresses, and eligible reviews/disputes.
- Admin actions require custom claims and are audited.
- Important financial records are append-only or corrected through adjustment entries.

## Aggregation and Pagination

Use daily/monthly and vendor-period summary documents for dashboard metrics. Use cursor pagination for every potentially large collection. Avoid per-view writes to a single hot document.

## Retention

Retention periods for accounts, financial records, audit events, AI conversations, documents, and consents remain `NEEDS_HUMAN_REVIEW` until legal/accounting policy is approved.

## Media metadata lifecycle (Cloudflare R2)

Media bytes live in Cloudflare R2; Firestore stores the application-level media record in `media/{mediaId}`.

Lifecycle:

1. `POST /media/upload-url` validates the vendor, file type, extension, and size, creates a `pending` media record, and returns a short-lived R2 signed upload URL plus `mediaId`.
2. The browser uploads directly to R2 using the signed URL.
3. `POST /media/complete` reads the R2 object metadata with `HEAD` and only changes the record to `ready` when size and MIME type exactly match the requested upload.
4. `DELETE /media/{mediaId}` deletes the R2 object first and then marks the Firestore record `deleted`.
5. Old `pending` records can be selected with `findExpiredPendingMedia()` for scheduled orphan cleanup once production scheduling is connected.

The Firestore Admin SDK is used by these server endpoints, so client-side Firestore rules cannot be bypassed to mutate media state. R2 object access remains governed by the authenticated vendor namespace checks in `server/r2.ts`.


## R2 media visibility
Product media defaults to `public`; vendor/customer documents default to `private`. Public media may receive a signed R2 URL without vendor authentication, but only after V-Hub confirms the media record exists and is `ready`. Private media requires authenticated ownership/admin access. The application remains the authorization layer; R2 credentials are never exposed to clients.

### R2 lifecycle operations
- `POST /media/retry` re-issues a fresh signed upload URL for failed media after best-effort removal of the old object key.
- `POST /media/cleanup` is an admin-only operational trigger intended for an external scheduler; it removes expired pending objects and marks their media records failed.
- The API does not run an in-process scheduler, avoiding duplicate jobs when multiple API instances are deployed.
