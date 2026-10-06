# Legal Risk Register

Status: initial engineering register. This is not legal advice and requires review by a Nigerian-qualified lawyer and privacy professional before launch.

| Risk | Severity | Affected feature | Recommended mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Platform language could imply regulated escrow, banking, insurance, or payment-institution services | Critical | Checkout, storefront trust copy, payouts, marketing | Identify actual provider relationship and rewrite claims to match contracts and licensing | Legal / Payments | NEEDS_HUMAN_REVIEW |
| Consumer refund and cancellation rights may be misstated | High | Refund policy, order cancellation, disputes | Review against applicable Nigerian consumer law and provider terms | Legal / Support | NEEDS_HUMAN_REVIEW |
| Controller/processor responsibilities between platform and vendors are not finalized | High | Privacy, DPA, vendor onboarding | Document data flows and execute appropriate contractual terms | Legal / Privacy | NEEDS_HUMAN_REVIEW |
| International processing and sub-processors may not be fully identified | High | Firebase, Cloudflare R2, AI, email, WhatsApp | Maintain processor inventory, regions, retention, transfer safeguards, and contract evidence for Cloudflare R2 and other processors | Privacy | BLOCKED |
| Prototype testimonials, metrics, reviews, office details, registration data, and partner claims may be unverified | High | Landing page, catalog, dashboard | Remove or replace with verified evidence; never seed as live data | Product / Legal | OPEN |
| Product image and profile-image rights are unknown | High | Storefront, marketing, dashboard | Obtain ownership/license evidence or replace assets | Content / Legal | OPEN |
| AI recommendations and automated communications may create consumer or discrimination risk | Medium | AI, WhatsApp, debt reminders, fraud | Human confirmation, quotas, respectful messaging, auditability, and documented review | AI / Legal | NEEDS_HUMAN_REVIEW |
| Marketing cookies and analytics consent requirements are unspecified | Medium | Analytics, marketing, embeds | Essential-only default and consent-aware loading | Privacy / Engineering | BLOCKED |
| Data retention and deletion exceptions for financial records are not finalized | Medium | Account deletion, ledgers, audit logs | Define retention schedule and anonymization process | Privacy / Finance | NEEDS_HUMAN_REVIEW |
| Vendor product claims, counterfeit policy, and takedown process are not finalized | Medium | Marketplace, moderation | Publish vendor/prohibited-products policy and evidence workflow | Legal / Trust & Safety | OPEN |
