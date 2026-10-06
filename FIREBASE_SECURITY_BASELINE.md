# Firebase Security Baseline

This is an initial rules baseline, not a production approval. The backend must remain the authority for payments, inventory, payouts, refunds, order state transitions, and financial ledger writes.

## Current Boundary

- Public reads are limited to documents that explicitly carry `status == "published"` or `status == "active"`.
- User profile reads/writes are owner-scoped; clients cannot change a stored role.
- Vendor/store/product access is scoped through vendor membership and admin claims.
- Order creation and mutation are denied to clients until the trusted API and transaction services are implemented.
- All unspecified documents are denied by default.
- Product media and private files have separate paths and size/type checks. Cloudflare R2 is the target object store; these rules remain a defense-in-depth baseline for any temporary Firebase media use.
- Upload delete operations are explicitly separated from create/update checks so missing `request.resource` on deletes cannot bypass or break validation.

## Required Before Production

- Replace the starter `vendorStaff` membership check with a permission-aware document model.
- Add automated Emulator Suite tests for anonymous, customer, vendor A, vendor B, vendor staff, admin, and super admin.
- Verify custom claims are only set by trusted server code.
- Add Firestore indexes only for reviewed, paginated queries.
- Keep privileged writes behind the API/Admin SDK and record audit events.
- Review Firebase Storage rules only for temporary media; review the actual signed-URL and Cloudflare R2 flows as the production storage path.
