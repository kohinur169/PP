# // path: plan_generator/group6.py
# Phase 9 (Steps 131 - 145) and Phase 10 (Steps 146 - 160)

GROUP_6 = [
    # Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security (131 - 145)
    {
        "number": "131",
        "title": "Cardholder Data Environment (CDE) Complete Isolation Architecture",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Enforce strict PCI-DSS SAQ A scope ensuring raw card numbers, CVVs, and expiry dates never touch platform servers.",
        "description": "Establish platform card security architecture in `docs/security/CDE_ISOLATION.md`. Card data is entered solely inside provider-hosted secure iframes (NMI Collect.js and Stripe Elements). Platform servers and databases handle only one-time payment tokens. Keylogging or scraping is physically impossible.",
        "substeps": [
            ("131.1", "Implement AST scanner forbidding any form input fields named `cardNumber`, `cvv`, or `expiry` on platform domains."),
            ("131.2", "Configure Content Security Policy (CSP) headers restricting iframe sources strictly to authorized payment providers."),
            ("131.3", "Implement server-side payload scanner raising security alerts if any incoming request body contains 13-19 digit PAN strings."),
            ("131.4", "Document PCI DSS SAQ A architecture and scope reduction boundaries in `docs/security/CDE_ISOLATION.md`.")
        ],
        "files": ["// path: docs/security/CDE_ISOLATION.md", "// path: scripts/scan-pan-leakage.ts", "// path: middleware.ts"],
        "verification": "Run PAN leakage scanner across codebase; verify zero input fields or API routes handle raw card data."
    },
    {
        "number": "132",
        "title": "NMI Collect.js Hosted Tokenization Front-End Component",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build React client component loading NMI Collect.js hosted fields and returning secure one-time payment tokens.",
        "description": "Implement NMI hosted fields component in `components/checkout/CollectJsField.tsx`. Load `https://secure.nmi.com/token/Collect.js`, inject hosted iframes for card number, CVV, and expiration, handle card validation, and emit one-time payment token on submission.",
        "substeps": [
            ("132.1", "Create `CollectJsField.tsx` loading script dynamically with integrity checking and error fallback."),
            ("132.2", "Configure Collect.js custom styling matching platform design system tokens."),
            ("132.3", "Handle `CollectJS.configure` callback extracting one-time payment token upon user submission."),
            ("132.4", "Display clear inline validation errors for invalid card numbers or expired dates directly from Collect.js callbacks.")
        ],
        "files": ["// path: components/checkout/CollectJsField.tsx", "// path: types/collectjs.d.ts", "// path: tests/checkout/collectjs.test.tsx"],
        "verification": "Render checkout form; verify NMI Collect.js iframes render securely and token callback fires on form submit."
    },
    {
        "number": "133",
        "title": "Stripe Elements & Hosted Secure Fields Component",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build React client component embedding Stripe Elements for card, Apple Pay, and Google Pay tokenization.",
        "description": "Implement Stripe Elements component in `components/checkout/StripeField.tsx` using `@stripe/react-stripe-js`. Embed hosted card element, enable digital wallets (Apple Pay, Google Pay), and confirm PaymentIntents securely in client browser.",
        "substeps": [
            ("133.1", "Create `StripeField.tsx` wrapping checkout form in `<Elements stripe={stripePromise}>`."),
            ("133.2", "Configure unified Payment Element supporting cards, Apple Pay, and Google Pay."),
            ("133.3", "Handle client-side `stripe.confirmPayment` flow with automated redirect and return URL handling."),
            ("133.4", "Add unit tests verifying Stripe elements mount properly and handle payment method creation.")
        ],
        "files": ["// path: components/checkout/StripeField.tsx", "// path: lib/payment/stripe-client.ts", "// path: tests/checkout/stripe-field.test.tsx"],
        "verification": "Load Stripe checkout element; verify payment element mounts and initiates client-side confirmation."
    },
    {
        "number": "134",
        "title": "3D Secure 2.0 (3DS2) Authentication & Liability Shift Engine",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Enforce 3D Secure 2.0 challenge and frictionless authentication on all card payments to secure fraud liability shift.",
        "description": "Implement 3DS2 flow in `lib/payment/three-ds.ts`. Request 3DS authentication on every card transaction. Support frictionless flow and step-up challenge modals. Verify ECI (Electronic Commerce Indicator) and CAVV results to confirm fraud liability shift to card issuer.",
        "substeps": [
            ("134.1", "Implement `initiate3dsAuthentication(paymentData, provider)` triggering 3DS2 enrollment check."),
            ("134.2", "Handle 3DS challenge redirect / iframe modal component `<ThreeDsChallengeModal url={challengeUrl} />`."),
            ("134.3", "Verify liability shift status: ECI 05/02 (liability shifted) vs ECI 07/00 (liability not shifted)."),
            ("134.4", "Record 3DS authentication result, CAVV, and XID on payment record for dispute defense.")
        ],
        "files": ["// path: lib/payment/three-ds.ts", "// path: components/checkout/ThreeDsChallengeModal.tsx", "// path: tests/payment/three-ds.test.ts"],
        "verification": "Simulate 3DS challenge test card; verify modal displays, challenge completes, and liability shift status is recorded."
    },
    {
        "number": "135",
        "title": "Non-3DS AVS & Payer IP Country Match Verification Fallback",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build risk fallback for non-3DS payments requiring billing postal code and payer IP country match before capture.",
        "description": "Per KD Solution IT security policy: when 3DS cannot be completed, capture happens only if billing postal code (AVS match) and payer IP geolocation country both match the invoice data. If either mismatches, capture is blocked and payment routes to manual review.",
        "substeps": [
            ("135.1", "Implement `verifyNon3dsRiskFallback(avsResult, payerIp, invoiceData)` in `lib/payment/avs-check.ts`."),
            ("135.2", "Inspect AVS postal match code (Y, X, D, F) against invoice postal code."),
            ("135.3", "Resolve payer country from IP address via GeoIP lookup and compare against invoice billing country."),
            ("135.4", "If postal or country mismatches, block immediate capture, set status to `in_review`, and alert compliance team.")
        ],
        "files": ["// path: lib/payment/avs-check.ts", "// path: tests/payment/avs-check.test.ts"],
        "verification": "Simulate non-3DS transaction with mismatched IP country; verify capture is blocked and payment moves to manual review."
    },
    {
        "number": "136",
        "title": "Card & IP Transaction Velocity Rate Limiting Engine",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build velocity filter detecting card testing attacks and rapid multi-attempt fraud by card hash and IP address.",
        "description": "Construct transaction velocity limiter in `lib/payment/velocity.ts`. Track charge frequency per card fingerprint (max 3 attempts per hour, max 5 per day) and per IP address (max 10 attempts per hour). Block card testing attacks and rate limit abusive sources.",
        "substeps": [
            ("136.1", "Create `payment_velocity_records` table tracking `card_fingerprint`, `ip_address`, `window_start`, `attempt_count`."),
            ("136.2", "Implement `checkPaymentVelocity(cardFingerprint, ip)` checking sliding window counts."),
            ("136.3", "If velocity exceeded, reject transaction with `CardVelocityLimitExceededError` and temporary IP block."),
            ("136.4", "Write tests simulating rapid card testing script; verify engine blocks further attempts after 3 rapid submissions.")
        ],
        "files": ["// path: lib/payment/velocity.ts", "// path: db/migrations/039_payment_velocity.sql", "// path: tests/payment/velocity.test.ts"],
        "verification": "Submit 4 rapid test charges with same card token; verify 4th charge is immediately blocked by velocity guard."
    },
    {
        "number": "137",
        "title": "Global Card Token & Provider Fingerprint Blacklist Filter",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build instant card blacklist rejecting known fraudulent cards by provider card fingerprint and token hash.",
        "description": "Implement blacklist filter in `lib/payment/blacklist.ts`. Check incoming card fingerprints against `card_blacklist` table. Immediately reject charges from cards associated with confirmed fraud, stolen card reports, or excessive chargebacks.",
        "substeps": [
            ("137.1", "Create `card_blacklist` table storing `card_fingerprint`, `reason`, `added_by`, `added_at`."),
            ("137.2", "Implement pre-charge check `isCardBlacklisted(fingerprint)` in payment authorization pipeline."),
            ("137.3", "Provide Super Admin interface to add/remove card fingerprints with mandatory justification notes."),
            ("137.4", "Add unit tests verifying blacklisted cards are rejected before reaching gateway API.")
        ],
        "files": ["// path: db/migrations/040_card_blacklist.sql", "// path: lib/payment/blacklist.ts", "// path: tests/payment/blacklist.test.ts"],
        "verification": "Add card fingerprint to blacklist; attempt charge and verify transaction is instantly rejected."
    },
    {
        "number": "138",
        "title": "Two-Step Authorization & Capture Workflow Engine",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build two-step authorization and capture engine supporting delayed capture and pre-capture compliance checks.",
        "description": "Implement separate authorization and capture pipelines in `lib/payment/auth-capture.ts`. Authorize funds on client card, hold authorization, evaluate fraud signals and transaction size gates, and execute capture only when all compliance rules pass.",
        "substeps": [
            ("138.1", "Implement `authorize(paymentRequest)` placing authorization hold without immediate settlement."),
            ("138.2", "Implement `capture(paymentId, amount)` executing capture on approved authorization."),
            ("138.3", "Enforce business rule: authorization must never be represented to merchant as settlement or payout-eligible cash."),
            ("138.4", "Implement auto-void for authorizations expiring without capture within 7 days.")
        ],
        "files": ["// path: lib/payment/auth-capture.ts", "// path: tests/payment/auth-capture.test.ts"],
        "verification": "Execute authorization; verify payment record shows status `authorized` and balance is not credited until capture."
    },
    {
        "number": "139",
        "title": "Mandatory USD $5,000+ Pre-Capture Compliance Review Gate",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Enforce mandatory manual compliance review before capturing any transaction exceeding USD $5,000.",
        "description": "Per KD Solution IT risk rule: any transaction over USD $5,000 requires documented manual review by Compliance team before capture, regardless of merchant tier. Capture is blocked until review passes. If provider cannot separate auth/capture, review occurs pre-charge or reject.",
        "substeps": [
            ("139.1", "Implement transaction size check: if `amount > 5000.0000`, set payment status to `pending_large_tx_review`."),
            ("139.2", "Block capture API execution while payment is in `pending_large_tx_review` state."),
            ("139.3", "Route transaction to compliance officer review queue (`app/(office)/compliance/payments/review/`)."),
            ("139.4", "Upon compliance review approval, release capture lock and trigger gateway capture.")
        ],
        "files": ["// path: lib/payment/large-tx-guard.ts", "// path: app/(office)/compliance/payments/review/page.tsx", "// path: tests/payment/large-tx.test.ts"],
        "verification": "Submit $5,500 charge; verify capture is held in review queue and completes only after compliance officer sign-off."
    },
    {
        "number": "140",
        "title": "Client Payment Processing API with Idempotency & Concurrency Locks",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build unified payment processing API (`POST /api/payments/charge`) with idempotency keys and concurrency locks.",
        "description": "Construct core payment route `POST /api/payments/charge`. Extract `Idempotency-Key`, validate payload, acquire advisory lock, route to processor, execute 3DS/AVS checks, post double-entry ledger entries on success, and return structured payment result.",
        "substeps": [
            ("140.1", "Create route handler `app/api/payments/charge/route.ts` validating Zod charge schema."),
            ("140.2", "Apply idempotency middleware ensuring duplicate requests return identical cached response."),
            ("140.3", "Enforce sub-merchant Tier 1 and Tier 2 single-transaction and monthly limits."),
            ("140.4", "Audit log all payment attempts with full forensic metadata and correlation IDs.")
        ],
        "files": ["// path: app/api/payments/charge/route.ts", "// path: lib/payment/charge.ts", "// path: tests/payment/charge-api.test.ts"],
        "verification": "Submit valid payment payload with idempotency key; verify payment succeeds and duplicate submission returns cached result."
    },
    {
        "number": "141",
        "title": "Payment Status Lifecycle State Machine & Audit Trailing",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build strict payment status state machine governing valid status transitions and immutability rules.",
        "description": "Implement state machine in `lib/payment/state-machine.ts`. Valid statuses: `initiated`, `pending_3ds`, `authorized`, `in_review`, `captured`, `failed`, `refunded`, `partially_refunded`, `disputed`, `voided`. Disallow invalid transitions (e.g. captured -> initiated).",
        "substeps": [
            ("141.1", "Define state machine transition table in `lib/payment/state-machine.ts`."),
            ("141.2", "Implement `transitionPaymentStatus(paymentId, newStatus, reason, actorId)` with optimistic locking."),
            ("141.3", "Record every status transition in `payment_status_history` table with timestamp and metadata."),
            ("141.4", "Add unit tests verifying invalid transitions (e.g. `failed` to `captured`) throw `InvalidStateTransitionError`.")
        ],
        "files": ["// path: lib/payment/state-machine.ts", "// path: db/migrations/041_payment_status_history.sql", "// path: tests/payment/state-machine.test.ts"],
        "verification": "Attempt illegal status change from `voided` to `captured`; verify state machine rejects operation with HTTP 400."
    },
    {
        "number": "142",
        "title": "Sub-Merchant Statement Descriptor Formatter (KD [Business Name])",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build dynamic statement descriptor formatter prepending 'KD ' to sub-merchant trade name within 22 characters.",
        "description": "Per KD Solution IT card network rules: cardholder statement descriptor must show the two letters 'KD ' together with sub-merchant business name. Clean special characters, truncate to card network 22-character limit, and pass to gateway.",
        "substeps": [
            ("142.1", "Implement `formatStatementDescriptor(submerchantName)` in `lib/payment/descriptor.ts`."),
            ("142.2", "Sanitize business name: remove symbols, enforce uppercase/alphanumeric, prepend `KD ` prefix."),
            ("142.3", "Truncate resulting string to exactly 22 characters maximum (e.g. `KD ACME SUPPLIES`)."),
            ("142.4", "Add unit tests verifying diverse business names format properly within character boundaries.")
        ],
        "files": ["// path: lib/payment/descriptor.ts", "// path: tests/payment/descriptor.test.ts"],
        "verification": "Format descriptor for 'Global Technologies & Services Ltd'; verify output is `KD GLOBAL TECH & SERV` (<=22 chars)."
    },
    {
        "number": "143",
        "title": "Hosted Checkout Page Architecture with Plan Branding Controls",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build responsive hosted checkout page under `app/(checkout)/pay/[id]/` with merchant logo and color customization.",
        "description": "Construct high-converting hosted checkout page in `app/(checkout)/pay/[id]/page.tsx`. Support mobile/desktop viewports, render sub-merchant logo and colors (if included in merchant plan), display itemized invoice lines, and embed secure hosted payment fields.",
        "substeps": [
            ("143.1", "Create checkout layout and page in `app/(checkout)/pay/[id]/page.tsx` with high-contrast responsive styling."),
            ("143.2", "Render sub-merchant branding (logo, primary color) if merchant plan includes branding entitlement; fallback to KD branding."),
            ("143.3", "Dynamically toggle Collect.js vs Stripe Elements based on resolved payment processor."),
            ("143.4", "Include security trust badges: 256-bit SSL encryption, PCI-DSS SAQ A compliant, Powered by Licensed Partners.")
        ],
        "files": ["// path: app/(checkout)/pay/[id]/page.tsx", "// path: components/checkout/CheckoutSummary.tsx", "// path: lib/checkout/session.ts"],
        "verification": "Load hosted checkout page; verify clean responsive rendering, merchant branding, and secure iframe initialization."
    },
    {
        "number": "144",
        "title": "Real-Time Payment Receipt Generator & Client Notification",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build real-time payment receipt generator displaying paid state and dispatching branded email receipt.",
        "description": "Implement receipt generator in `lib/payment/receipt.ts`. Upon successful payment capture, transition tokenized invoice link to paid state, render printable web receipt with transaction ID and statement descriptor, and dispatch confirmation email to payer.",
        "substeps": [
            ("144.1", "Create receipt view component `<PaymentReceipt payment={payment} invoice={invoice} />`."),
            ("144.2", "Generate printable/downloadable PDF payment receipt via background worker."),
            ("144.3", "Dispatch `PAYMENT_RECEIVED_RECEIPT` email to client with transaction ID, amount, date, and card last 4."),
            ("144.4", "Lock associated invoice and tokenized link against any further payment attempts.")
        ],
        "files": ["// path: lib/payment/receipt.ts", "// path: components/checkout/PaymentReceipt.tsx", "// path: tests/payment/receipt.test.ts"],
        "verification": "Complete payment; verify browser displays receipt, email receipt is dispatched, and invoice link locks."
    },
    {
        "number": "145",
        "title": "Payment Forensic Metadata Collector & Fraud Telemetry Engine",
        "phase": "Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security",
        "objective": "Build payment telemetry collector recording client IP, browser headers, AVS/CVV codes, and routing decisions.",
        "description": "Capture forensic metadata for every transaction in `payment_telemetry` table. Store: client IP address, ASN, user agent, browser language, screen resolution, AVS response, CVV match code, 3DS ECI/CAVV, routing rule matched, and gateway latency.",
        "substeps": [
            ("145.1", "Create `payment_telemetry` table linked to `payments.id` with UUIDv7 primary key."),
            ("145.2", "Extract client request telemetry in payment handler without storing any cardholder PII."),
            ("145.3", "Record provider response timing and gateway correlation IDs for dispute and audit trace."),
            ("145.4", "Write tests verifying telemetry persistence on both successful and failed transactions.")
        ],
        "files": ["// path: db/migrations/042_payment_telemetry.sql", "// path: lib/payment/telemetry.ts", "// path: tests/payment/telemetry.test.ts"],
        "verification": "Execute payment; verify `payment_telemetry` contains IP, user agent, AVS code, and 3DS indicators."
    },

    # Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation (146 - 160)
    {
        "number": "146",
        "title": "Chart of Accounts & Immutable Double-Entry Foundation",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Establish formal Chart of Accounts categorizing Assets, Liabilities, Equity, Revenue, and Expense accounts.",
        "description": "Define the platform financial accounting structure in `lib/ledger/accounts.ts`. Number accounts: Assets (1000s: Processor Receivables, Bank Accounts), Liabilities (2000s: Merchant Available Balance, Pending Settlement, Held Reserves), Revenue (4000s: Platform Fees, Subscription Revenue), Expense (5000s: Processor Interchange Costs, Dispute Fees).",
        "substeps": [
            ("146.1", "Create `ledger_accounts` table storing `account_number`, `name`, `type` (asset, liability, equity, revenue, expense), `company_id`."),
            ("146.2", "Seed standard system chart of accounts in `db/seeds/ledger-accounts.ts`."),
            ("146.3", "Create merchant sub-accounts dynamically for each provisioned sub-merchant tenant."),
            ("146.4", "Define TypeScript enums for standard account codes in `types/ledger.ts`.")
        ],
        "files": ["// path: db/migrations/043_ledger_accounts.sql", "// path: lib/ledger/accounts.ts", "// path: types/ledger.ts"],
        "verification": "Verify chart of accounts schema, standard account seeds, and tenant sub-account initialization."
    },
    {
        "number": "147",
        "title": "Double-Entry Journal & Ledger Schema Migration",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Create `ledger_journals` and `ledger_entries` tables storing debits and credits with fixed numeric(18,4) precision.",
        "description": "Migrate core double-entry accounting tables. Each transaction writes a journal header (`ledger_journals`) and at least two balancing entries (`ledger_entries`) storing `account_id`, `debit numeric(18,4)`, `credit numeric(18,4)`, `currency VARCHAR(3)` (USD only), and `company_id`.",
        "substeps": [
            ("147.1", "Create SQL migration `044_create_ledger_tables.sql` defining `ledger_journals` and `ledger_entries`."),
            ("147.2", "Add columns to `ledger_entries`: `journal_id`, `account_id`, `debit numeric(18,4)`, `credit numeric(18,4)`."),
            ("147.3", "Enforce positive amounts constraint: `CHECK (debit >= 0 AND credit >= 0 AND (debit > 0 OR credit > 0))`."),
            ("147.4", "Add indexes on `account_id`, `company_id`, `created_at`, and `journal_id`.")
        ],
        "files": ["// path: db/migrations/044_create_ledger_tables.sql", "// path: lib/ledger/types.ts", "// path: lib/db/ledger.ts"],
        "verification": "Verify table creation, column types `numeric(18,4)`, and foreign key relationships between journals and entries."
    },
    {
        "number": "148",
        "title": "Zero-Balance Journal Entry Database Trigger",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Install PostgreSQL constraint trigger verifying SUM(debit) equals SUM(credit) on every journal transaction.",
        "description": "Enforce fundamental double-entry invariant at database engine level: every journal entry set must balance to exactly zero: `SUM(debit) - SUM(credit) = 0`. Create PostgreSQL constraint trigger deferred to transaction commit, aborting transaction if unbalanced.",
        "substeps": [
            ("148.1", "Create SQL migration `045_ledger_zero_balance_trigger.sql` defining deferred constraint trigger `check_journal_balance`."),
            ("148.2", "Trigger verifies `SUM(debit) = SUM(credit)` for given `journal_id` before transaction commits."),
            ("148.3", "Raise fatal exception `LedgerUnbalancedError` if imbalance is detected, rolling back entire transaction."),
            ("148.4", "Write database integration test attempting to commit unbalanced journal; verify PostgreSQL raises fatal error.")
        ],
        "files": ["// path: db/migrations/045_ledger_zero_balance_trigger.sql", "// path: tests/db/ledger-trigger.test.ts"],
        "verification": "Attempt to post journal with $100 debit and $90 credit; verify database trigger aborts transaction."
    },
    {
        "number": "149",
        "title": "Immutable Ledger Constraints & Compensating Reversal Engine",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Install database rules blocking UPDATE/DELETE on ledger and build compensating reversal entry engine.",
        "description": "Per KD Solution IT financial rules: ledger entries are never edited or deleted. Install database rules blocking all UPDATE and DELETE commands on `ledger_entries`. Corrections must be written strictly as reversing entries referencing original journal ID.",
        "substeps": [
            ("149.1", "Create SQL migration `046_ledger_immutability_rules.sql` installing rules preventing UPDATE and DELETE on ledger tables."),
            ("149.2", "Implement `createReversingJournal(originalJournalId, reason, actorId)` in `lib/ledger/reversal.ts`."),
            ("149.3", "Swap debits and credits of original entries in compensating reversal transaction."),
            ("149.4", "Write tests verifying attempt to mutate ledger row throws error and reversal balances out original entries.")
        ],
        "files": ["// path: db/migrations/046_ledger_immutability_rules.sql", "// path: lib/ledger/reversal.ts", "// path: tests/ledger/reversal.test.ts"],
        "verification": "Execute `UPDATE ledger_entries SET credit = 0`; verify PostgreSQL raises error and reversal engine creates clean reversing journal."
    },
    {
        "number": "150",
        "title": "Core Payment Flow Double-Entry Posting Rules",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Implement double-entry posting rules for payment capture: Processor Receivable, Merchant Balance, and Platform Fee.",
        "description": "Construct core payment journal poster in `lib/ledger/post-payment.ts`. Upon successful $100 charge with 3% platform fee: Debit Account 1100 (Processor Receivable) $100.0000; Credit Account 2100 (Merchant Pending Settlement) $97.0000; Credit Account 4100 (Platform Fee Revenue) $3.0000.",
        "substeps": [
            ("150.1", "Implement `postPaymentCaptureJournal(payment, feeAmount)` within database transaction."),
            ("150.2", "Calculate exact fee split using `numeric(18,4)` Decimal math, ensuring zero rounding discrepancy."),
            ("150.3", "Assert debits equal credits before posting."),
            ("150.4", "Add unit tests verifying exact ledger balances across varied transaction amounts and fee tiers.")
        ],
        "files": ["// path: lib/ledger/post-payment.ts", "// path: tests/ledger/post-payment.test.ts"],
        "verification": "Post sample payment capture; verify Processor Receivable increases by gross amount, Merchant balance by net, and Fee revenue by split."
    },
    {
        "number": "151",
        "title": "Platform Processing Fee Calculation & Split-Payment Posting",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build platform fee calculator evaluating global vs merchant-specific overrides and posting fee revenue journals.",
        "description": "Implement fee calculator in `lib/ledger/platform-fee.ts`. Evaluate global platform fee percent (set by Super Admin) or merchant custom override (approved by CEO/Super Admin). Deduct fee at capture and credit Platform Fee Revenue account.",
        "substeps": [
            ("151.1", "Implement `calculatePlatformFee(amount, companyId)` retrieving active fee rate."),
            ("151.2", "Ensure fee calculation uses fixed-precision Decimal math with Banker's rounding."),
            ("151.3", "Record fee calculation breakdown on payment journal entry for transparency."),
            ("151.4", "Write tests verifying custom fee overrides take precedence over global default fee rates.")
        ],
        "files": ["// path: lib/ledger/platform-fee.ts", "// path: tests/ledger/platform-fee.test.ts"],
        "verification": "Set merchant custom fee to 2.5%; process $200 charge and verify platform fee deducted is exactly $5.0000."
    },
    {
        "number": "152",
        "title": "Settlement Hold & Rolling Reserve Double-Entry Journal Posting",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build double-entry journal poster for settlement hold maturation and rolling reserve allocation.",
        "description": "Implement hold and reserve posting rules in `lib/ledger/reserves.ts`. When funds clear holding period: Debit Account 2100 (Pending Settlement), Credit Account 2000 (Available Balance). Allocate reserve: Debit Account 2000 (Available Balance), Credit Account 2200 (Rolling Reserve).",
        "substeps": [
            ("152.1", "Implement `postSettlementReleaseJournal(companyId, amount)` moving funds from Pending to Available."),
            ("152.2", "Implement `postRollingReserveJournal(companyId, reserveAmount)` allocating funds into Rolling Reserve account."),
            ("152.3", "Implement `postReserveReleaseJournal(companyId, releasedAmount)` returning matured reserve to Available Balance."),
            ("152.4", "Write tests verifying total sub-merchant equity is conserved throughout hold, reserve, and release transitions.")
        ],
        "files": ["// path: lib/ledger/reserves.ts", "// path: tests/ledger/reserves.test.ts"],
        "verification": "Release matured settlement batch; verify journal correctly moves balance from Pending Settlement to Available Balance."
    },
    {
        "number": "153",
        "title": "Sub-Merchant Real-Time Balance Query & Aggregation Service",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build high-performance balance aggregation service querying Available Balance, Pending Settlement, and Rolling Reserve.",
        "description": "Implement balance calculator in `lib/ledger/balance.ts`. Aggregate debits and credits from `ledger_entries` for given company: Available Balance = Net credit in Account 2000; Pending Settlement = Net credit in Account 2100; Rolling Reserve = Net credit in Account 2200.",
        "substeps": [
            ("153.1", "Implement `getMerchantBalance(companyId)` returning `{ available, pending, reserve, currency: 'USD' }`."),
            ("153.2", "Optimize query using indexed aggregation on `account_id` with short-lived cache for dashboard rendering."),
            ("153.3", "Provide API endpoint `GET /api/merchant/balance` for sub-merchant dashboard."),
            ("153.4", "Add unit tests verifying balance query accurately matches ledger entries after series of charges and payouts.")
        ],
        "files": ["// path: lib/ledger/balance.ts", "// path: app/api/merchant/balance/route.ts", "// path: tests/ledger/balance.test.ts"],
        "verification": "Query merchant balance after $1,000 charges and $100 reserve; verify available, pending, and reserve values are exact."
    },
    {
        "number": "154",
        "title": "Negative Balance Management & Rolling Reserve Recovery Engine",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build negative balance recovery engine offsetting chargeback losses from rolling reserve and contract recovery.",
        "description": "Implement negative balance resolution in `lib/ledger/negative-balance.ts`. When chargeback or refund creates negative Available Balance: automatically debit Rolling Reserve (Account 2200) to restore Available Balance to zero. If reserve is exhausted, enqueue remaining deficit for legal/contract collection.",
        "substeps": [
            ("154.1", "Implement `offsetNegativeBalance(companyId)` evaluating available balance deficit against held reserve."),
            ("154.2", "Post compensating journal transferring deficit amount from Rolling Reserve to Available Balance."),
            ("154.3", "If total equity remains negative, flag account `negative_balance_collection` and alert Finance Ops."),
            ("154.4", "Write tests verifying rolling reserve successfully absorbs chargeback deficit without manual intervention.")
        ],
        "files": ["// path: lib/ledger/negative-balance.ts", "// path: tests/ledger/negative-balance.test.ts"],
        "verification": "Simulate $500 chargeback on empty available balance with $600 reserve; verify reserve absorbs deficit and balance zeros out."
    },
    {
        "number": "155",
        "title": "Continuous Invariant Ledger Monitor & Imbalance Alert Worker",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build automated background monitor continuously verifying global ledger mathematical balance and alerting office on mismatch.",
        "description": "Implement ledger invariant scanner in `lib/ledger/monitor.ts`. Continuously verify: (1) every journal balances to zero; (2) total system Assets equal total Liabilities plus Equity; (3) Bank custodial balance covers all merchant liabilities. Alert office immediately on any discrepancy.",
        "substeps": [
            ("155.1", "Implement `checkGlobalLedgerInvariants()` scanning all journals and account balances."),
            ("155.2", "Verify global equation: `SUM(debits) - SUM(credits) === 0` across entire platform database."),
            ("155.3", "If any mismatch is detected, dispatch critical Sentry alert and emergency email to Finance Ops and CEO."),
            ("155.4", "Configure automated hourly background job executing invariant check.")
        ],
        "files": ["// path: lib/ledger/monitor.ts", "// path: scripts/check-ledger.ts", "// path: tests/ledger/monitor.test.ts"],
        "verification": "Run `scripts/check-ledger.ts`; verify scanner validates all journals and reports 100% balanced ledger."
    },
    {
        "number": "156",
        "title": "Multi-Provider Settlement Report Parsing & Ingestion Engine",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build settlement report parsers ingesting CSV and JSON settlement files from NMI, Stripe, Rainforest, and Airwallex.",
        "description": "Implement settlement report parser in `lib/reconciliation/ingest.ts`. Ingest daily processor payout and settlement reports. Parse processor transaction IDs, gross amounts, fee deductions, net payout amounts, and settlement dates into `processor_settlement_lines` table.",
        "substeps": [
            ("156.1", "Create `processor_settlement_lines` table tracking `provider`, `processor_tx_id`, `amount`, `fee`, `net`, `settlement_date`."),
            ("156.2", "Implement CSV parsers for Stripe Settlement CSV, NMI Settlement Reports, Rainforest, and Airwallex files."),
            ("156.3", "Provide file upload portal for Finance Ops (`app/(office)/finance/settlement-upload/`)."),
            ("156.4", "Add unit tests verifying parser accurately extracts line items from sample provider CSV formats.")
        ],
        "files": ["// path: db/migrations/047_processor_settlement_lines.sql", "// path: lib/reconciliation/ingest.ts", "// path: tests/reconciliation/ingest.test.ts"],
        "verification": "Upload sample Stripe settlement CSV; verify all settlement lines parse and insert into database with zero errors."
    },
    {
        "number": "157",
        "title": "Automated Transaction-Level Reconciliation Matcher",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build automated reconciliation matcher pairing platform transaction records with processor settlement lines.",
        "description": "Implement automated reconciliation in `lib/reconciliation/matcher.ts`. Match platform payment records with processor settlement lines by provider transaction ID and amount. Flag records as `matched`, `amount_mismatch`, `missing_in_processor`, or `missing_in_platform`.",
        "substeps": [
            ("157.1", "Create `reconciliation_matches` table tracking `payment_id`, `settlement_line_id`, `status`, `discrepancy_amount`."),
            ("157.2", "Execute matching algorithm comparing gross charge, processor fee, and net settlement within 1-cent tolerance."),
            ("157.3", "Mark matched records `reconciled` and update ledger Account 1100 (Processor Receivable) to settled cash."),
            ("157.4", "Write tests verifying matcher accurately pairs 1,000 transactions and flags single-cent anomalies.")
        ],
        "files": ["// path: db/migrations/048_reconciliation_matches.sql", "// path: lib/reconciliation/matcher.ts", "// path: tests/reconciliation/matcher.test.ts"],
        "verification": "Run reconciliation matcher; verify matched records update to `reconciled` and mismatches route to investigation queue."
    },
    {
        "number": "158",
        "title": "3-Day Reconciliation Mismatch Resolution Queue & Escalation SLA",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build Finance Ops reconciliation mismatch queue enforcing mandatory resolution within 3 business days.",
        "description": "Per KD Solution IT operational rules: any reconciliation mismatch must be resolved by Finance Ops within 3 days. Construct resolution queue in `app/(office)/finance/reconciliation/`. Track 72-hour countdown SLA, auto-escalate to CEO at 48 hours, and audit log all resolution steps.",
        "substeps": [
            ("158.1", "Create `reconciliation_mismatch_cases` table tracking `case_id`, `mismatch_type`, `sla_deadline`, `assigned_to`, `status`."),
            ("158.2", "Build resolution interface with side-by-side comparison of platform record vs processor report line."),
            ("158.3", "Provide resolution actions: post adjusting entry, re-query processor API, or flag processor billing error."),
            ("158.4", "Trigger automated email escalation to Finance Ops lead and CEO at 48 hours and 72 hours.")
        ],
        "files": ["// path: db/migrations/049_reconciliation_mismatches.sql", "// path: app/(office)/finance/reconciliation/[id]/page.tsx", "// path: lib/reconciliation/sla.ts"],
        "verification": "Inspect mismatch case; verify 3-day SLA countdown displays and resolution action writes adjusting journal."
    },
    {
        "number": "159",
        "title": "Processor Monthly Bill Matching & Interchange Fee Audit Engine",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build processor monthly bill matching tool comparing billed fees against platform calculated deductions.",
        "description": "Implement invoice audit engine in `lib/reconciliation/bill-match.ts`. Ingest monthly processor billing statements. Compare billed interchange, assessment, and fixed gateway fees against internal platform ledger cost accruals, flagging overcharges for dispute.",
        "substeps": [
            ("159.1", "Create `processor_monthly_bills` table storing `provider`, `billing_period`, `total_billed_fees`, `audit_status`."),
            ("159.2", "Implement bill comparison calculator aggregating 30-day transaction volume and computing fee variance."),
            ("159.3", "Build bill audit dashboard in Finance Ops console (`app/(office)/finance/bill-audit/`)."),
            ("159.4", "Record audit sign-off by Finance Ops lead and CEO in `audit_logs`.")
        ],
        "files": ["// path: db/migrations/050_processor_monthly_bills.sql", "// path: lib/reconciliation/bill-match.ts", "// path: app/(office)/finance/bill-audit/page.tsx"],
        "verification": "Audit monthly processor bill; verify system compares internal fee accruals against billed total and reports variance."
    },
    {
        "number": "160",
        "title": "Sub-Merchant Settlement Statement Generator (CSV & PDF)",
        "phase": "Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation",
        "objective": "Build settlement statement exporter allowing merchants to download detailed periodic statements as CSV and PDF.",
        "description": "Construct settlement statement generator in `lib/ledger/statement.ts`. Allow merchants to select any date range and download complete statement itemizing: gross payments, platform fees, processor costs, reserve allocations, refunds, chargebacks, and net payouts.",
        "substeps": [
            ("160.1", "Implement `generateSettlementStatement(companyId, startDate, endDate)` aggregating ledger entries."),
            ("160.2", "Create CSV export formatter producing standard accounting spreadsheet format."),
            ("160.3", "Create PDF statement generator producing branded settlement summary statement."),
            ("160.4", "Provide download interface on merchant dashboard (`app/(merchant)/statements/`).")
        ],
        "files": ["// path: lib/ledger/statement.ts", "// path: app/(merchant)/statements/page.tsx", "// path: tests/ledger/statement.test.ts"],
        "verification": "Download settlement statement for past month; verify CSV and PDF accurately reflect all ledger movements and totals."
    }
]

print(f"Group 6 loaded: {len(GROUP_6)} steps.")
