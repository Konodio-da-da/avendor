# V-Hub Reliability Hardening Build

## Changes in this build
- Added payout request idempotency keyed by `Idempotency-Key`.
- Repeated payout requests with the same vendor + idempotency key return the original payout instead of creating another payout.
- API payout endpoint now requires a bounded `Idempotency-Key` header.
- Non-idempotent internal payout calls receive unique IDs rather than collapsing same-amount requests in the same hour.
- Added bounded cleanup for expired in-memory rate-limit buckets.
- Added frontend API contracts/helpers for vendor settlement balances and payout requests.
- Added a regression test for repeated payout idempotency.

## Validation note
The source was inspected and the new idempotency paths were verified by source-level checks. The extracted archive's dependency tree does not contain the Vitest executable, so the full test runner could not be executed in this runtime.

## Final reliability correction
- Persisted payout idempotency keys with payout records.
- Rehydrates the vendor+idempotency-key index from Firestore on server startup.
- Prevents duplicate payouts after a process restart when the client retries the same request.
