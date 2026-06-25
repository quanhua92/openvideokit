# RFC 0003 — Credits & Billing

| | |
|---|---|
| **Status** | Draft — awaiting decisions on open questions in §16 |
| **Author** | OpenVideoKit team |
| **Date** | 2026-06-25 |
| **Depends on** | [RFC 0001 — Cross-Platform Desktop Studio](./0001-cross-platform-desktop-studio.md) (Go control-plane, project model, cloud sync)<br>[RFC 0002 — Asset Intelligence](./0002-asset-intelligence.md) (template + asset catalog surface) |
| **Discussion** | `docs/rfc/` |

---

## 1. Summary

OpenVideoKit is **not all-access**. A subscription buys a **monthly credit grant** plus
tier-specific perks; every commercial surface (template unlocks, asset pulls, OVK Cloud
AI generations, optional cloud render minutes) is **metered against a single credit
balance**. Top-up packs exist for one-off users; the tiered subscription is the primary
relationship.

This is the converged pattern used by Vercel / Render / the Anthropic API — tiered
subscription + included monthly credits + overage at member rate — applied to a
creative catalog where the marginal cost of serving files is near-zero but the marginal
cost of GPU-backed AI and cloud render is real.

**Hard constraint (from product)**: *no* tier means "unlimited access to everything."
Even the top tier has a credit cap. Credits gate every high-value surface uniformly.

---

## 2. Motivation

Two decisions from the broader product strategy force this design:

1. **Templates and assets are not DRM-protected** (AI can replicate HTML; fighting
   redistribution is futile — see prior discussion). Revenue must come from ongoing
   curation + service, not file protection.
2. **Multiple consume surfaces have very different cost profiles.** Template unlock is
   ~$0 to serve; OVK Cloud AI generation is real marginal GPU cost; cloud render is real
   compute. A flat subscription either under-monetizes the expensive surfaces or
   over-charges the cheap ones.

A pure flat subscription fails the second test; pure pay-per-action fails the discovery
test (users need to browse before committing). **Tiered subscription + monthly credits**
resolves the trilemma: predictable recurring revenue, exploration affordance (catalog
browse is always free + a monthly budget to spend), and per-surface pricing inside the
single balance.

---

## 3. Goals & Non-Goals

### Goals

1. **Tiered subscription** with monthly credit grant — no all-access tier anywhere.
2. **Single credit balance** spendable across templates, assets, OVK Cloud AI, and
   cloud render.
3. **Per-project template unlock** — spend credits to license a template into one
   project; unlimited local renders within that project; a new project requires a new
   spend.
4. **Idempotent spend** — failed renders, retries, and network blips never double-charge.
5. **Append-only ledger** as source of truth; balance is a derived projection.
6. **Stripe-native** — subscription, invoice, proration, dunning, customer portal all
   delegated.
7. **Overage at member rate** — running out of credits mid-month does not hard-stop
   power users.

### Non-Goals

- Two-sided marketplace payouts to template authors. Separate RFC when community
  templates ship at scale.
- DRM or anti-piracy enforcement for template/asset bytes. Explicitly accepted away.
- Per-render billing. Once a template is unlocked for a project, renders are free and
  unlimited (local or cloud-prorated).
- Annual contracts / enterprise invoicing (v1). Self-serve only.
- Usage metering of OSS tool features. The local AI agent and BYO-API-key paths are
  free forever.

---

## 4. The model

Three layers, cleanly separated:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Subscription tier (recurring relationship)        │
│   • Free / Hobby / Pro / Studio                             │
│   • Determines perks: cloud sync, team seats, license class │
│   • Billed monthly via Stripe                               │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Monthly credit grant (the metering budget)        │
│   • Allocated on subscription renewal                       │
│   • Capped rollover (≤ 1 month's grant)                     │
│   • Expires at period end on cancellation                   │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Spend (every commercial surface consumes credits) │
│   • Template unlock (per-project)                           │
│   • Asset pull (per-asset into a project)                   │
│   • OVK Cloud AI generation (per-call)                      │
│   • Cloud render minute (per-minute, optional surface)      │
│   • Premium TTS voice (per-sentence, optional)              │
└─────────────────────────────────────────────────────────────┘
```

The user sees one number: **credit balance**. Every action either costs credits or is
free (catalog browse, MP4 preview, local render of unlocked templates, local AI agent).
**Paid template HTML is never available in preview** — only the MP4 is.

---

## 5. Tier structure

Default proposal; final pricing pending validation (see §16 Q1).

| Tier | Price (USD/mo) | Monthly credits | Rollover cap | Catalog access | Cloud sync | AI / Render | License class |
|---|---|---|---|---|---|---|---|
| **Free** | $0 | 0 | n/a | Community templates + free assets only | No | Local AI only (BYO API key) | Personal, non-commercial |
| **Hobby** | $15 | 50 | 50 | Full catalog browse + MP4 preview free; **unlock requires credits** | Yes | OVK Cloud AI (rate-limited) | Personal |
| **Pro** | $49 | 250 | 250 | Same as Hobby + 10% member discount on overage | Yes | Priority Cloud AI + 100 render min/mo included | Commercial (single seat) |
| **Studio** | $199 | 1,200 | 600 | Same as Pro + 20% member discount on overage | Yes (team) | Priority Cloud AI + 1,000 render min/mo | Commercial + team (≤ 5 seats) |
| **Top-up pack** | $10 = 30 credits | n/a | Does not expire | Same as your tier | (as tier) | (as tier) | (as tier) |

Design rules baked into the table:

- **No all-access.** Even Studio at 1,200 credits/mo runs out if a team unlocks ~60
  templates plus heavy AI use. That is intentional — power users pay overage.
- **Top-up is worse $/credit than any subscription** (30/$10 ≈ 3/$1 vs Pro at ≈ 5/$1).
  Subscription always wins on economics; top-ups are for emergencies and one-off users.
- **Basic catalog browse is always free** — discovery has zero friction. The gate is
  *using* a template in a project, not *seeing* it.
- **MP4 preview is always free** — per the "files aren't the moat" decision, previews
  are marketing.
- **Local AI agent is always free** (BYO API key) — OSS promise kept.

---

## 6. Credit economics — cost per surface

Concrete consume rates. Subject to tuning from query logs.

| Surface | Action | Credit cost | Rationale |
|---|---|---|---|
| Template unlock | Per-project license | **5–20** (per template) | Hand-crafted "hero" templates = 15–20; standard = 8–12; community = 0–5 |
| Premium asset | Pull into project | **1–3** | Stock video / Lottie = 3; image / transparent PNG = 1 |
| OVK Cloud AI | Per-generation (edit, customize, generate) | **1** | Matches roughly $0.02–0.05 inference cost at scale |
| Cloud render | Per-minute of rendered video | **1** | Optional surface; local render is always free |
| Premium TTS | Per-sentence (premium neural voice) | **1** | edge-tts free voices remain $0 |

**Per-template credit price** is set by the template's `credit_cost` field in its
manifest. The catalog exposes the price upfront so users never spend blind.

### 6.1 Why per-project unlock (not per-render or permanent)

| Model | LTV | User feel | Verdict |
|---|---|---|---|
| Per-render | Very high | Tax on output — universally resented | **Rejected** |
| **Per-project** | Balanced recurring | Matches "I'm making this one video" mental model | **Chosen** |
| Permanent unlock | One-time | Good for user; kills recurring revenue | **Rejected** |

Per-project means: a credit spend licenses the template into one project; that project
can render unlimited MP4s forever. A new project requires a new spend.

### 6.2 Preview gating — what's free, what's behind the HTML paywall

A hard rule, stated once so the rest of the RFC can rely on it:

> **Paid template HTML is never delivered before unlock. The catalog exposes only the
> rendered MP4 for preview. The composition source (HTML / CSS / GSAP / `template.json`)
> is streamed to the client workspace *only after* the credit spend in §7 step 6
> commits.**

| Asset state | What the user gets for free | What unlocks on credit spend |
|---|---|---|
| Free / community template | Full HTML + editor + local render | (nothing to unlock) |
| **Paid template, pre-unlock** | **MP4 preview only** (watermark-free, catalog-hosted) | — |
| Paid template, post-unlock (per-project) | — | Full HTML delivered to workspace; unlimited local renders within that project |

Implications:

- The Tauri editor's live-preview webview can only mount a template whose HTML is
  already in the local workspace. There is **no "try in editor" mode** for paid,
  un-unlocked templates — only MP4 playback in the catalog.
- This makes the credit spend the single delivery gate. No partial access, no
  time-limited trial HTML, no obfuscated preview build. The MP4 is the entire
  evaluation surface; the HTML is the product.
- Consistent with the "files aren't the moat, but convenience + freshness + curation
  are" stance from §2: the MP4 is enough to evaluate; the source is what you pay for.

---

## 7. End-to-End spend flow

```
1. User subscribes via Stripe Checkout (Hobby / Pro / Studio)
        ▼
2. Stripe webhook → Go grants monthly credits → ledger entry
        ▼
3. User browses catalog (free) → watches MP4 preview (free, no HTML delivered)
        ▼
4. User clicks "Use in project" on a template
        ▼
5. Go checks balance ≥ template.credit_cost
        ▼
6. Go atomically (Postgres SERIALIZABLE tx):
     a. append ledger txn (−N, surface=template_unlock, ref=project_id+template_id)
     b. upsert project_template_license row
     c. decrement cached balance
        ▼
7. Stream template HTML to client workspace; client renders locally (free)
   or via cloud render (1 credit/min)
        ▼
8. Monthly renewal: Stripe webhook → Go grants next month's credits + capped rollover
        ▼
9. Cancellation: subscription credits expire at period end;
   project_template_licenses remain usable forever (already paid)
```

Step 6's atomicity is critical — see §10.

---

## 8. Data model

### 8.1 Ledger (append-only)

```sql
credit_accounts (
  user_id        uuid PRIMARY KEY REFERENCES users,
  tier           text NOT NULL,                       -- free|hobby|pro|studio
  balance        integer NOT NULL DEFAULT 0,          -- cached sum of txns (rebuildable)
  last_grant_at  timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

credit_transactions (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users,
  delta           integer NOT NULL,                   -- +grant / −spend / +refund
  surface         text,                               -- template_unlock|asset_pull|cloud_ai|
                                                      --   cloud_render|premium_tts|grant|refund|adjustment
  reference_type  text,                               -- project|template|asset|render_job|ai_call|invoice
  reference_id    text,
  idempotency_key text NOT NULL,                      -- prevents double-spend on retry
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON credit_transactions (user_id, idempotency_key);
CREATE INDEX ON credit_transactions (user_id, created_at DESC);

credit_grants (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users,
  amount          integer NOT NULL,
  source          text NOT NULL,                      -- subscription_renewal|topup_pack|promo|refund
  stripe_invoice_id text,
  period_start    timestamptz,
  period_end      timestamptz,                        -- when these credits expire (null = never)
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

`credit_accounts.balance` is a denormalized cache; `credit_transactions` is the source
of truth. A nightly job rebuilds balances from the ledger and alerts on any drift > 0.

### 8.2 Per-project licenses

```sql
project_template_licenses (
  project_id    uuid NOT NULL REFERENCES projects,
  template_id   text NOT NULL,
  unlocked_at   timestamptz NOT NULL DEFAULT now(),
  credits_spent integer NOT NULL,
  txn_id        bigint REFERENCES credit_transactions,
  PRIMARY KEY (project_id, template_id)
);
CREATE INDEX ON project_template_licenses (template_id);

project_asset_licenses (
  project_id    uuid NOT NULL REFERENCES projects,
  asset_sha256  text NOT NULL REFERENCES assets,
  licensed_at   timestamptz NOT NULL DEFAULT now(),
  credits_spent integer NOT NULL,
  txn_id        bigint REFERENCES credit_transactions,
  PRIMARY KEY (project_id, asset_sha256)
);
```

Same shape for assets. A license is permanent within the project — the user already
paid for it; subsequent renders that include it cost nothing more.

### 8.3 Rollover / expiry tracking

```sql
credit_expirations (
  txn_id      bigint PRIMARY KEY REFERENCES credit_transactions,  -- the grant's +delta txn
  user_id     uuid NOT NULL REFERENCES users,
  expires_at  timestamptz NOT NULL,
  consumed    boolean NOT NULL DEFAULT false,         -- set when spent or expired
  consumed_at timestamptz,
  consumed_by text                                    -- 'spend'|'expiry'|'cancellation'
);
CREATE INDEX ON credit_expirations (expires_at) WHERE NOT consumed;
```

**FIFO spend**: a debit draws from the oldest-unexpired grant first (matches user
expectation: spend your oldest credits before they vanish). A nightly job marks rows
past `expires_at` as `consumed='expiry'` and appends a `−delta` adjustment txn.

---

## 9. API surface (Go endpoints)

Extends [RFC 0001 §6.1](./0001-cross-platform-desktop-studio.md).

```
# balance
GET  /me/credits
     → { balance, tier,
         breakdown: { subscription, promo, topup },
         next_grant_at, next_grant_amount, rollover_eligible }
GET  /me/credits/history?cursor=
     → paginated ledger (delta, surface, reference, created_at)

# spend (idempotent)
POST /credits/spend
     { surface, amount, reference_type, reference_id, idempotency_key }
     → { txn_id, new_balance, license?: { project_id, template_id } }
     → 402 if balance < amount

# refund (internal / admin / webhook-triggered)
POST /credits/refund
     { original_txn_id, reason }
     → { refund_txn_id, new_balance }

# subscription lifecycle
POST /billing/checkout                → Stripe Checkout session URL (tier)
POST /billing/portal                  → Stripe Customer Portal URL (manage/cancel)
POST /webhooks/stripe                 → invoice.paid, subscription.updated, etc.

# top-up
POST /billing/topup                   → Stripe Checkout for credit pack
```

### 9.1 Idempotency contract

`idempotency_key` is unique per *logical* action and supplied by the client. The Tauri
shell generates a UUID per user intent (e.g., "use template X in project Y") and
persists it locally until it receives a non-retryable response. Retries (network blip,
timeout, render crash) reuse the same key. The server returns the original txn if the
key already exists, regardless of how many times the call is repeated.

This eliminates double-spend across every failure mode.

---

## 10. Spend atomicity

The dangerous operation is "debit N credits AND write a license AND deliver the
template HTML." A crash between any two steps corrupts the system. The pattern is a
single Postgres transaction with `SERIALIZABLE` isolation:

```go
err := db.Tx(ctx, func(tx *sql.Tx) error {
    // 1. Lock the account row
    acc, _ := getAccountForUpdate(tx, userID)
    if acc.Balance < cost {
        return ErrInsufficientCredits
    }

    // 2. Insert ledger txn — idempotency_key uniqueness guards replay
    if err := insertTxn(tx, …); err != nil {
        if isUniqueViolation(err) {
            return nil // already done by a retry — handler returns original result
        }
        return err
    }

    // 3. Update cached balance
    if err := debitBalance(tx, userID, cost); err != nil { return err }

    // 4. Write license (idempotent on composite PK)
    if err := upsertLicense(tx, projectID, templateID, …); err != nil { return err }

    return nil
})
// 5. Only after commit: stream template HTML to client
```

The `idempotency_key` UNIQUE constraint is the last line of defense — even if the
client retries a fully-completed operation, the DB rejects the duplicate insert and the
handler returns the original result.

---

## 11. Stripe integration

| Concern | Choice |
|---|---|
| Products | One per tier (Hobby / Pro / Studio) + one per top-up pack |
| Pricing | Recurring monthly, USD, billed in advance |
| Checkout | Stripe Checkout for new subscriptions and top-ups (no hosted UI to maintain) |
| Customer Portal | Stripe-hosted for upgrade / downgrade / cancel / card update |
| Proration | Stripe default (pro-rated upgrades; downgrades credit the account) |
| Webhooks | `invoice.paid` → grant monthly credits; `customer.subscription.deleted` → schedule credit expiry at period end; `checkout.session.completed` (top-up) → grant pack credits |
| Tax | Stripe Tax (handles VAT / GST / regional) |
| Dunning | Stripe Smart Retries; on final failure, tier downgrades to Free at period end |

### 11.1 Why Stripe Customer Portal

Building upgrade / downgrade / cancel / payment-method UIs is 4–6 weeks of
high-stakes, low-differentiation work. Stripe's hosted portal handles all of it,
including localized payment methods and tax. The only custom UI is the checkout button
and the in-app balance display. Strongly recommended for v1; replace only if a
self-hosted billing experience ever becomes a competitive differentiator.

---

## 12. Rollover, expiry, refunds

### 12.1 Rollover (subscription credits only)

- On each renewal, prior-month unspent subscription credits roll over **up to one
  month's grant** (Hobby: 50, Pro: 250, Studio: 600 — note Studio's cap is below the
  grant to prevent indefinite hoarding at the top tier).
- Top-up pack credits **never expire**.
- Promo credits expire per the campaign's stated term.

### 12.2 Expiry on cancellation

- Subscription cancellation = no further monthly grants.
- Existing balance (including rollover) remains spendable until the **current Stripe
  billing period end**.
- At period end, all subscription-derived credits expire; top-up credits remain.
- `project_template_licenses` and `project_asset_licenses` remain usable forever — the
  user already paid for them.

### 12.3 Refunds

- **Failed cloud render**: full credit refund, automatic (the dispatcher detects
  non-zero exit and refunds the original txn).
- **Failed OVK Cloud AI generation**: full credit refund, automatic.
- **Template unlock**: non-refundable (the HTML has been delivered). UI must show the
  credit cost and require explicit confirmation before spend.
- **Discretionary refunds**: admin tool can refund any txn with a reason; logged for
  audit.

---

## 13. Fraud & abuse

| Vector | Mitigation |
|---|---|
| Multiple free accounts | Free tier has 0 credits and no cloud sync — little to gain |
| Chargeback after spending credits | Stripe handles via standard disputes; license revocation is a manual admin decision |
| Refund-looping (trigger failed renders to farm refunds) | Rate-limit refund endpoint; flag accounts with refund ratio > threshold; cap refunds at total spent per period |
| Idempotency-key farming | Keys are server-generated UUIDs returned with the action intent; clients cannot mint arbitrary spends |
| API abuse of OVK Cloud AI | Per-account daily cap on AI generations (e.g., 200/day) regardless of balance |
| Shared subscription across many users | Studio tier explicitly allows ≤ 5 seats; > 5 requires Enterprise (out of scope v1) |

---

## 14. Staging

| Phase | Scope | Exit criterion |
|---|---|---|
| **P0 — Subscription only** | Hobby / Pro via Stripe; **no credits yet**; catalog access gated by tier (Hobby+ get full catalog). Validates willingness-to-pay. | First 100 paying users. |
| **P1 — Credits + template unlock** | Add credit ledger, monthly grant, per-project template unlock. Catalog browse stays free; unlock costs credits. | Power users hit overage (proves the meter has tension). |
| **P2 — Cloud AI surface** | OVK Cloud AI generation consumes 1 credit per call. | AI use is the #2 credit sink after template unlock. |
| **P3 — Cloud render + premium TTS** | Optional paid surfaces come online. | Studio-tier adoption validates team use. |

**P0 exists explicitly to avoid building the credit ledger before having paying users.**
This matches the "don't ship credits at MVP" decision from the prior strategy turn —
the credit system's complexity is justified only once willingness-to-pay is proven.

---

## 15. Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| Credit complexity hurts conversion vs flat subscription | P0 ships flat; credits only appear once willingness-to-pay is proven |
| Per-template pricing kills discovery | Catalog browse + MP4 preview are always free; editor / HTML access only after unlock (§6.2) |
| Users feel nickeled-and-dimed | Always show credit cost before spend; one-click confirm; member-discount overage |
| Idempotency-key collision across users | Unique index is composite on `(user_id, idempotency_key)` |
| Ledger drift from cached balance | Nightly reconciliation; alert on any drift > 0 |
| Stripe webhook lost | Webhook endpoint idempotent on Stripe event ID; Stripe retries; dead-letter queue for persistent failures |
| Pricing turns out wrong | All numbers tunable without schema change (`credit_cost` is per-template); tier prices are Stripe-side |
| Top-up packs cannibalize subscriptions | Top-up $/credit deliberately worse than any subscription tier |
| Overage surprises users | Soft notifications at 80% / 100% / overage; hard cap configurable in settings (default off for Pro+) |

---

## 16. Open Questions

| # | Question | Owner |
|---|---|---|
| Q1 | Final tier prices + credit allocations — validate via P0 conversion data before locking P1? | product |
| Q2 | Rollover cap at 1 month vs no rollover (simpler) vs unlimited rollover (more generous)? | product |
| Q3 | Per-template `credit_cost` set by template author (future marketplace) or platform-defined? | product |
| Q4 | Studio tier credits — shared team pool or per-seat allocation? | product |
| Q5 | Annual billing discount (e.g., 2 months free)? | product |
| Q6 | Purchasing-power-parity pricing for non-US markets? | product |
| Q7 | Are credits refundable for cash? (Recommendation: no — top-ups are non-refundable; subscription grants have no cash value.) | legal / finance |
| Q8 | Should a failed template unlock (e.g., user can't open the file) be auto-refundable within X minutes? | product |
| Q9 | Should free tier include a small one-time grant (e.g., 10 credits on signup) for activation? | growth |
| Q10 | Upgrade path when a Studio team needs > 5 seats — manual Enterprise sales or self-serve proration? | product |

**Q1 is the gating decision.** P0's flat-subscription data determines whether the
credit allocations proposed in §5 are right.

---

## 17. Out of Scope

- Two-sided marketplace payouts to template authors (separate RFC when community
  templates scale).
- Enterprise contracts, invoiced billing, custom credit allocations (post-v1 sales
  motion).
- Usage metering of OSS tool features (local agent, BYO API key — free forever).
- DRM or anti-piracy for template / asset bytes.
- Per-render billing of any kind.
- Credits as a refundable cash-equivalent instrument.
- Cross-account credit transfers (gifting credits to another user).
- Promotional-credit campaign tooling (the `source=promo` ledger entry exists, but
  campaign tooling is separate).

---

## 18. References

- [RFC 0001 — Cross-Platform Desktop Studio](./0001-cross-platform-desktop-studio.md)
  (project model, Go control-plane, Stripe-adjacent billing)
- [RFC 0002 — Asset Intelligence](./0002-asset-intelligence.md) (catalog surface that
  credit unlocks consume against)
- Stripe Checkout: https://stripe.com/docs/payments/checkout
- Stripe Customer Portal: https://stripe.com/docs/billing/customer-portal
- Stripe Billing webhooks: https://stripe.com/docs/webhooks
- Prior art on tiered + metered billing: Vercel pricing, Render pricing, Anthropic API
  credits
