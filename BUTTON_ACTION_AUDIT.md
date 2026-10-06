# Button and Action Audit

Scope: initial React/Vite foundation. The original HTML references remain unchanged historical design material and are classified in `ARCHITECTURE_AUDIT.md`.

| Surface | Action | Auth | API / result | Loading / error | Status |
| --- | --- | --- | --- | --- | --- |
| Marketing header | Open merchant OS | None in preview | React route `/vendor` | Route transition | PASS |
| Marketing header | Browse demo store | None | React route `/stores/:slug` | Route transition | PASS |
| Theme toggle | Switch light/dark | None | Local preference only | Immediate UI update | PASS |
| Store search | Enter query | None | UI-only disclosure | No fake search result | PASS |
| Store filters | Filter catalog | None | Disabled until catalog query API is connected | Disabled state | PASS |
| Store category pills | Select category | None | Disabled until filter API is connected | Disabled state | PASS |
| Product variant | Select variant | None | Local selection only; stock remains unavailable | Immediate UI update | PASS |
| Product add-to-bag | Add product | None | Disabled until cart API/recalculation exists | Disabled state | PASS |
| Product WhatsApp | Start chat | Consent/config required | Disabled until verified business configuration exists | Disabled state | PASS |
| Cart browse | Return to store | None | React route | Route transition | PASS |
| Account auth | Sign in | Firebase required | Disabled until Auth is configured | Disabled state | PASS |
| Vendor quick commands | Products/orders/AI/settings | Vendor auth required | React route; protected operations remain unavailable | Route transition | PASS |
| Vendor metrics | View metrics | Vendor auth required | Empty until Firestore aggregates exist | Honest empty state | PASS |
| Vendor product create | Add product | Vendor permission required | Disabled until API, validation, media, and ownership checks exist | Disabled state | PASS |
| Vendor product filters | Filter products | Vendor permission required | Disabled until paginated API exists | Disabled state | PASS |
| Vendor order filter | Filter orders | Vendor permission required | Disabled until order API exists | Disabled state | PASS |
| AI tool card | Inspect gated tool | Vendor permission required | Local detail panel; no provider call | Immediate UI update | PASS |
| AI tool start | Run AI job | Vendor permission/quota required | Disabled until server AI job exists | Disabled state | PASS |
| Vendor settings | Read-only profile | Vendor auth required | Development fixture only | Read-only disclosure | PASS |

No new production action silently claims payment success, creates an order, sends a message, requests a payout, publishes inventory, or runs AI. Those operations remain gated until their trusted backends exist.
