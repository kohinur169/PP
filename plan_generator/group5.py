# // path: plan_generator/group5.py
# Phase 8: Payment Processor Adapters & Gateway Architecture (Steps 111 - 130)

GROUP_5 = [
    {
        "number": "111",
        "title": "Unified Payment Processor Adapter Interface Specification",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Define standard TypeScript interface for payment processor adapters covering charges, refunds, payouts, and webhooks.",
        "description": "Establish the unified gateway contract in `lib/processors/types.ts`. Standardize method signatures: `createSubMerchant`, `authorizePayment`, `capturePayment`, `refundPayment`, `createPayout`, `verifyWebhook`, and `testConnection` across all five platform providers.",
        "substeps": [
            ("111.1", "Define `PaymentProcessorAdapter` interface in `lib/processors/types.ts` with strict TypeScript typings."),
            ("111.2", "Define standardized request and response types: `AuthorizeRequest`, `ChargeResult`, `RefundResult`, `PayoutResult`."),
            ("111.3", "Normalize gateway error codes into platform standard `GatewayError` classes."),
            ("111.4", "Create mock payment processor adapter for automated integration tests and developer sandbox.")
        ],
        "files": ["// path: lib/processors/types.ts", "// path: lib/processors/mock.ts", "// path: tests/processors/interface.test.ts"],
        "verification": "Verify TypeScript compiles mock processor adapter fulfilling all interface methods without type errors."
    },
    {
        "number": "112",
        "title": "Payment Processor Registry & Capability Matrix",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build central payment processor registry cataloging all 5 providers and their supported capability matrix.",
        "description": "Create provider registry in `lib/processors/registry.ts`. Register all 5 launch providers: NMI, Payoneer, Rainforest, Stripe Connect, and Airwallex. Document capability matrix: card acceptance, e-wallets, sub-merchant creation, payouts, and supported countries.",
        "substeps": [
            ("112.1", "Create `lib/processors/registry.ts` mapping provider slugs to adapter implementations and metadata."),
            ("112.2", "Define capability matrix: NMI (cards/sub-merchants), Payoneer (payouts), Rainforest (cards/sub-merchants), Stripe (cards/wallets/payouts), Airwallex (global/payouts)."),
            ("112.3", "Implement registry lookup methods: `getAdapter(slug)`, `getAvailableProcessors(country, capability)`."),
            ("112.4", "Add unit tests verifying registry returns correct adapter instances and capability flags.")
        ],
        "files": ["// path: lib/processors/registry.ts", "// path: types/processors.ts", "// path: tests/processors/registry.test.ts"],
        "verification": "Query registry for payout-capable providers; verify registry returns Payoneer, Airwallex, and Stripe."
    },
    {
        "number": "113",
        "title": "NMI Official Adapter Implementation with Collect.js Token Exchange",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build official NMI adapter consuming Collect.js hosted payment tokens and executing charges via NMI Three-Step/REST API.",
        "description": "Implement official NMI adapter in `lib/processors/nmi.ts` following nmi.com and docs.nmi.com specifications. Browser collects card data strictly through Collect.js hosted fields (secure.nmi.com/token/Collect.js) returning a payment token. Server exchanges token for payment via NMI API. Server never sees raw card number, expiry, or CVV.",
        "substeps": [
            ("113.1", "Implement `NmiAdapter` class handling API authentication via security keys or username/password."),
            ("113.2", "Implement `authorizePayment` and `capturePayment` exchanging Collect.js token (`payment_token`) via NMI Direct Post / REST API."),
            ("113.3", "Implement `refundPayment` sending transaction ID and amount to NMI refund endpoint."),
            ("113.4", "Parse NMI response codes (1=Approved, 2=Declined, 3=Error), AVS responses, and CVV match codes.")
        ],
        "files": ["// path: lib/processors/nmi.ts", "// path: lib/processors/nmi-types.ts", "// path: tests/processors/nmi.test.ts"],
        "verification": "Execute sandbox NMI token exchange; verify authorization succeeds with response code 1 and zero raw card data processed."
    },
    {
        "number": "114",
        "title": "NMI Sub-Merchant Gateway Provisioning Client",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build automated NMI sub-merchant onboarding client provisioning merchant accounts through the NMI partner gateway API.",
        "description": "Implement NMI sub-merchant provisioning in `lib/processors/nmi-submerchant.ts`. Transmit approved merchant business details, processing limits, and MCC code to NMI gateway partner API. Store returned gateway sub-merchant ID and credentials.",
        "substeps": [
            ("114.1", "Implement `createNmiSubMerchant(companyData)` calling NMI affiliate/partner gateway creation endpoint."),
            ("114.2", "Transmit required NMI fields: business legal name, address, tax ID, representative details, and MCC."),
            ("114.3", "Store resulting NMI merchant ID and API keys encrypted in `submerchant_accounts` table."),
            ("114.4", "Write tests verifying sub-merchant provisioning payload matches official NMI partner documentation.")
        ],
        "files": ["// path: lib/processors/nmi-submerchant.ts", "// path: tests/processors/nmi-submerchant.test.ts"],
        "verification": "Provision test NMI sub-merchant; verify NMI returns gateway account ID and credentials are encrypted at rest."
    },
    {
        "number": "115",
        "title": "Payoneer Global Payout Adapter Implementation",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build Payoneer payout adapter automatically registering merchant bank accounts and disbursing approved payouts.",
        "description": "Implement Payoneer integration in `lib/processors/payoneer.ts`. Automatically link payout bank account added in merchant profile to Payoneer Mass Payouts API. Disburse approved settlement payouts in USD and ingest payout status webhooks.",
        "substeps": [
            ("115.1", "Implement `PayoneerAdapter` class connecting to Payoneer Mass Payouts REST API with OAuth2 client credentials."),
            ("115.2", "Implement `registerPayoutBank(companyId, bankDetails)` creating payee and bank account record in Payoneer."),
            ("115.3", "Implement `createPayout(payoutBatchId, amount, payeeId)` submitting payout instruction."),
            ("115.4", "Process Payoneer payout status webhooks (SUBMITTED, COMPLETED, FAILED) and update ledger entries.")
        ],
        "files": ["// path: lib/processors/payoneer.ts", "// path: app/api/webhooks/payment/payoneer/route.ts", "// path: tests/processors/payoneer.test.ts"],
        "verification": "Simulate Payoneer payout creation; verify payout ID generated and webhook transitions payout to completed."
    },
    {
        "number": "116",
        "title": "Rainforest Payment Acceptance & Sub-Merchant Creation Adapter",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build Rainforest (rainforestpay.com) adapter for PayFac sub-merchant onboarding and embedded payment processing.",
        "description": "Implement Rainforest adapter in `lib/processors/rainforest.ts` per rainforestpay.com API. Support automated sub-merchant merchant creation, hosted field card tokenization session generation, payment intents, and signature-verified webhook ingestion.",
        "substeps": [
            ("116.1", "Implement `RainforestAdapter` class communicating with Rainforest REST API with bearer authentication."),
            ("116.2", "Implement `createSubMerchant` creating Rainforest merchant entity with legal and KYB details."),
            ("116.3", "Implement `authorizePayment` and `capturePayment` using Rainforest payment methods and card tokens."),
            ("116.4", "Verify Rainforest webhook HMAC signatures and process merchant capability update events.")
        ],
        "files": ["// path: lib/processors/rainforest.ts", "// path: app/api/webhooks/payment/rainforest/route.ts", "// path: tests/processors/rainforest.test.ts"],
        "verification": "Create test sub-merchant on Rainforest sandbox; verify merchant ID returned and payment session created."
    },
    {
        "number": "117",
        "title": "Stripe Connect Custom & Express Sub-Merchant Adapter",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build Stripe Connect adapter managing connected accounts, PaymentIntents, and destination charge payouts.",
        "description": "Implement Stripe Connect integration in `lib/processors/stripe.ts` using `stripe` SDK. Create connected accounts, process PaymentIntents with Stripe Elements hosted fields, handle destination charges with application fees, and manage payouts.",
        "substeps": [
            ("117.1", "Implement `StripeAdapter` class initializing Stripe client with encrypted platform master secret key."),
            ("117.2", "Implement `createSubMerchant` creating Stripe Connect account with capability requests (card_payments, transfers)."),
            ("117.3", "Implement PaymentIntent creation with `transfer_data[destination]` and `application_fee_amount`."),
            ("117.4", "Process Stripe webhooks (`payment_intent.succeeded`, `charge.dispute.created`, `account.updated`) with signature verification.")
        ],
        "files": ["// path: lib/processors/stripe.ts", "// path: app/api/webhooks/payment/stripe/route.ts", "// path: tests/processors/stripe.test.ts"],
        "verification": "Create Stripe PaymentIntent; verify connected account destination transfer and webhook signature validation."
    },
    {
        "number": "118",
        "title": "Airwallex Connected Accounts & Payment/Payout Adapter",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build Airwallex (airwallex.com) adapter for Asian/global payment acceptance, connected accounts, and payouts.",
        "description": "Implement Airwallex integration in `lib/processors/airwallex.ts`. Support Airwallex connected account onboarding, hosted card elements/e-wallet checkout sessions, cross-border payouts, and signature-verified webhook processing.",
        "substeps": [
            ("118.1", "Implement `AirwallexAdapter` class handling API client authentication and token refresh."),
            ("118.2", "Implement connected account creation passing sub-merchant business identity and beneficial ownership data."),
            ("118.3", "Implement `createPaymentIntent` and `createPayout` for Asian local payment methods and SWIFT bank payouts."),
            ("118.4", "Verify Airwallex webhook RSA/HMAC signatures and dispatch events to ledger worker.")
        ],
        "files": ["// path: lib/processors/airwallex.ts", "// path: app/api/webhooks/payment/airwallex/route.ts", "// path: tests/processors/airwallex.test.ts"],
        "verification": "Execute test charge on Airwallex sandbox; verify payment intent confirms and webhook verifies cleanly."
    },
    {
        "number": "119",
        "title": "Gateway Architecture Extension Point for Future Providers",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Design hot-pluggable gateway extension point enabling addition of new payment providers without refactoring core code.",
        "description": "Implement open-closed architecture for payment gateways in `lib/processors/factory.ts`. Any new provider adapter fulfilling `PaymentProcessorAdapter` and added to `registry.ts` automatically surfaces in Super Admin dashboard and routing rules.",
        "substeps": [
            ("119.1", "Implement dynamic adapter loader in `lib/processors/factory.ts` resolving provider from database configuration."),
            ("119.2", "Ensure core payment engine relies strictly on `PaymentProcessorAdapter` interface without provider-specific branching."),
            ("119.3", "Build admin UI dynamically rendering gateway configuration cards based on registered providers."),
            ("119.4", "Add unit tests verifying a dummy 6th adapter can be registered and called without modifying checkout routes.")
        ],
        "files": ["// path: lib/processors/factory.ts", "// path: docs/gateways/ADDING_A_PROVIDER.md", "// path: tests/processors/factory.test.ts"],
        "verification": "Register mock provider; verify admin gateway management page displays new provider card automatically."
    },
    {
        "number": "120",
        "title": "Super Admin Gateway Management Dashboard with 2FA Step-Up",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build Super Admin gateway configuration console with mandatory 2FA step-up reauthentication and zero code change activation.",
        "description": "Construct gateway administration console under `app/(office)/super-admin/gateways/`. Restrict strictly to Super Admin role with fresh 2FA reauthentication within 5 minutes. Allow adding, testing, enabling, and disabling gateway credentials without redeploying code.",
        "substeps": [
            ("120.1", "Create gateway management layout and list in `app/(office)/super-admin/gateways/page.tsx`."),
            ("120.2", "Enforce step-up reauthentication modal before allowing viewing or editing of gateway parameters."),
            ("120.3", "Provide toggles for enable/disable; prevent enabling any provider whose connection test fails."),
            ("120.4", "Audit log all gateway credential additions, toggles, and tests in `audit_logs`.")
        ],
        "files": ["// path: app/(office)/super-admin/gateways/page.tsx", "// path: components/admin/GatewayConfigCard.tsx", "// path: lib/processors/admin.ts"],
        "verification": "Access gateway console; verify step-up 2FA is required and disabled provider cannot be toggled without valid connection test."
    },
    {
        "number": "121",
        "title": "AES-256-GCM Gateway Credential Encryption & Masked UI",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Enforce AES-256-GCM encryption at rest for all gateway API keys and secrets with masked UI display.",
        "description": "Per KD Solution IT security mandate: all gateway API keys, client secrets, and webhook secrets must be AES-256-GCM encrypted before storage in `gateway_credentials` table. After saving, full key is never displayed again; show only last 4 chars and update time.",
        "substeps": [
            ("121.1", "Create `gateway_credentials` table storing `provider_slug`, `encrypted_payload`, `last4`, `version`, `is_active`."),
            ("121.2", "Encrypt credentials using domain-derived AES-256-GCM subkey prior to database insert/update."),
            ("121.3", "Never return plaintext secret in API responses; send only masked string (e.g. `••••••••••••a1b2`)."),
            ("121.4", "Write tests verifying database query on `gateway_credentials` returns only ciphertext buffers.")
        ],
        "files": ["// path: db/migrations/035_gateway_credentials.sql", "// path: lib/processors/credentials.ts", "// path: tests/processors/credentials.test.ts"],
        "verification": "Inspect raw database row for Stripe secret key; verify data is encrypted ciphertext and UI displays masked last 4."
    },
    {
        "number": "122",
        "title": "Built-in Live Gateway Connection Test Harness",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build automated connection test harness executing live sandbox API ping before allowing gateway activation.",
        "description": "Implement live connection tester in `lib/processors/test-connection.ts`. Call provider balance or account endpoint with entered credentials. Require 100% successful ping response before enabling gateway toggle in Super Admin dashboard.",
        "substeps": [
            ("122.1", "Implement `testGatewayConnection(providerSlug, credentials)` calling provider test endpoint."),
            ("122.2", "Expose endpoint `POST /api/office/gateways/[provider]/test` with detailed latency and diagnostic output."),
            ("122.3", "Enforce business rule: if connection test fails or times out, block gateway activation toggle."),
            ("122.4", "Write unit tests simulating connection success and failure handling across all 5 providers.")
        ],
        "files": ["// path: lib/processors/test-connection.ts", "// path: app/api/office/gateways/[provider]/test/route.ts", "// path: tests/processors/test-connection.test.ts"],
        "verification": "Click 'Test Connection' with invalid API key; verify error diagnostics display and activation toggle remains disabled."
    },
    {
        "number": "123",
        "title": "Deterministic Payment Routing Rules Engine with Fail-Closed Guard",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build deterministic payment routing rules engine routing transactions by currency, country, and card brand.",
        "description": "Implement routing engine in `lib/processors/routing.ts`. Evaluate transaction parameters: merchant country, payer country, currency (USD), card brand, and sub-merchant connected accounts. Route to optimal gateway. If no rule matches, fail closed (reject payment); never silently reroute.",
        "substeps": [
            ("123.1", "Create `payment_routing_rules` table storing `priority`, `conditions` (country, currency, mcc), `target_provider`."),
            ("123.2", "Implement `resolvePaymentProcessor(txContext)` evaluating prioritized rules deterministically."),
            ("123.3", "Enforce fail-closed guard: if no routing rule matches, throw `UnroutablePaymentError` and reject transaction."),
            ("123.4", "Write tests verifying payment is rejected rather than sent to incorrect fallback provider when rules do not match.")
        ],
        "files": ["// path: lib/processors/routing.ts", "// path: db/migrations/036_payment_routing_rules.sql", "// path: tests/processors/routing.test.ts"],
        "verification": "Submit payment with unsupported currency or unrouted country; verify system rejects payment with clean error."
    },
    {
        "number": "124",
        "title": "Provider Verification Status & Account Capability Synchronization",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build provider capability synchronizer persisting independent verification states for each connected processor.",
        "description": "Implement capability tracker in `lib/processors/sync-status.ts`. Payment processors own their sub-merchant KYB decision. Store independent status for each provider: `pending`, `action_required`, `verified`, `restricted`, `rejected`. Verification from one provider never satisfies another.",
        "substeps": [
            ("124.1", "Update `submerchant_accounts` table tracking `verification_status` and `capabilities` (charges_enabled, payouts_enabled)."),
            ("124.2", "Sync capabilities via signature-verified idempotent webhook handlers from each provider."),
            ("124.3", "Enforce rule: seller charges stay disabled for a provider until that specific provider reports verified status."),
            ("124.4", "Audit log all provider capability transitions with provider timestamp and raw payload hash.")
        ],
        "files": ["// path: lib/processors/sync-status.ts", "// path: tests/processors/sync-status.test.ts"],
        "verification": "Simulate provider webhook restricting payouts; verify platform updates capability state and blocks payouts for that provider."
    },
    {
        "number": "125",
        "title": "Master Platform Account Connection Queue & Missing-Key Alerting",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build queue handler pausing sub-merchant provisioning and alerting office if master platform gateway keys are missing.",
        "description": "Implement safeguard in `lib/processors/master-account.ts`. If an approved merchant requires provisioning on a gateway where master platform account credentials are not configured, hold provisioning in queued state and trigger urgent dashboard/email alerts to office.",
        "substeps": [
            ("125.1", "Implement `verifyMasterAccountConfigured(providerSlug)` checking active credentials before provisioning."),
            ("125.2", "If credentials missing, set provisioning status to `queued_missing_master_credentials`."),
            ("125.3", "Dispatch notification to Super Admin and CEO requesting gateway credential configuration."),
            ("125.4", "Write tests verifying provisioning job retries cleanly once master gateway credentials are saved.")
        ],
        "files": ["// path: lib/processors/master-account.ts", "// path: tests/processors/master-account.test.ts"],
        "verification": "Attempt sub-merchant provisioning without master gateway key; verify job queues safely and alerts office team."
    },
    {
        "number": "126",
        "title": "Multi-Provider Webhook Ingestion Router & Payload Dispatcher",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build unified webhook router receiving webhooks from all 5 providers with signature verification and event dispatching.",
        "description": "Construct central webhook ingestion endpoint `app/api/webhooks/payment/[provider]/route.ts`. Route incoming payloads to provider-specific signature verification modules, store raw events in database, and dispatch asynchronous worker jobs.",
        "substeps": [
            ("126.1", "Create dynamic route `app/api/webhooks/payment/[provider]/route.ts` supporting POST requests."),
            ("126.2", "Read raw request body buffer before any JSON parsing to allow precise cryptographic HMAC signature verification."),
            ("126.3", "Dispatch verified event to background queue worker for asynchronous ledger and notification processing."),
            ("126.4", "Return HTTP 200/202 response to provider within 2 seconds to prevent provider webhook delivery retries.")
        ],
        "files": ["// path: app/api/webhooks/payment/[provider]/route.ts", "// path: lib/webhooks/dispatcher.ts", "// path: tests/webhooks/router.test.ts"],
        "verification": "Send test webhook to `/api/webhooks/payment/stripe`; verify raw payload captured, verified, and enqueued."
    },
    {
        "number": "127",
        "title": "Processor-Specific Webhook Signature Verification Modules",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build cryptographic webhook signature verification modules for NMI, Stripe, Rainforest, Airwallex, and Payoneer.",
        "description": "Implement signature verifiers in `lib/webhooks/signatures/`. Verify Stripe `Stripe-Signature` header (timestamp + v1 HMAC), NMI MD5/SHA256 hash checks, Rainforest HMAC-SHA256, Airwallex RSA/HMAC, and Payoneer webhook tokens. Reject unverified webhooks with HTTP 401.",
        "substeps": [
            ("127.1", "Implement `verifyStripeWebhook(rawBody, signature, secret)` using Stripe SDK."),
            ("127.2", "Implement `verifyNmiWebhook(payload, receivedHash, secretKey)` using HMAC-SHA256."),
            ("127.3", "Implement Rainforest, Airwallex, and Payoneer signature verifiers in dedicated modules."),
            ("127.4", "Add unit tests verifying rejection of webhooks with expired timestamps or tampered signatures.")
        ],
        "files": ["// path: lib/webhooks/signatures/stripe.ts", "// path: lib/webhooks/signatures/nmi.ts", "// path: lib/webhooks/signatures/rainforest.ts", "// path: lib/webhooks/signatures/airwallex.ts", "// path: lib/webhooks/signatures/payoneer.ts"],
        "verification": "Submit webhook with altered payload byte; verify signature validator rejects request with HTTP 401 Unauthorized."
    },
    {
        "number": "128",
        "title": "Webhook Idempotency & Distributed Event Lock Engine",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build webhook deduplication and event locking engine preventing duplicate processing of retried webhook events.",
        "description": "Implement deduplication engine in `lib/webhooks/idempotency.ts`. Store incoming event IDs in `webhook_events` table with unique constraint on `(provider, event_id)`. Acquire database lock during processing to prevent concurrent execution of duplicate webhook deliveries.",
        "substeps": [
            ("128.1", "Create `webhook_events` table tracking `provider`, `event_id`, `status` (pending, processing, completed, failed), `payload`."),
            ("128.2", "Implement `acquireWebhookLock(provider, eventId)` returning false if event is already processing or completed."),
            ("128.3", "If event previously completed, return HTTP 200 immediately without re-executing ledger or status changes."),
            ("128.4", "Write tests simulating identical webhook delivered 5 times concurrently; verify exactly 1 execution occurs.")
        ],
        "files": ["// path: db/migrations/037_webhook_events.sql", "// path: lib/webhooks/idempotency.ts", "// path: tests/webhooks/idempotency.test.ts"],
        "verification": "Post identical Stripe event 3 times; verify only first execution mutates ledger and subsequent calls return cached 200."
    },
    {
        "number": "129",
        "title": "Processor Fee Modeling & Interchange++ Cost Tracking Engine",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Build gateway fee modeling engine calculating processor interchange and fixed transaction costs per transaction.",
        "description": "Implement fee calculator in `lib/processors/fees.ts`. Model Interchange++ and flat fees for each connected processor (e.g. 2.9% + $0.30 for standard cards, lower for ACH/debit). Record estimated and reconciled processor costs for margin analysis.",
        "substeps": [
            ("129.1", "Create `processor_fee_schedules` table storing percentage rate, fixed fee, and international surcharge per provider."),
            ("129.2", "Implement `calculateProcessorCost(amount, provider, cardBrand, isInternational)` using `numeric(18,4)` Decimal math."),
            ("129.3", "Record processor fee debit on transaction record alongside platform fee deduction."),
            ("129.4", "Write tests verifying precision of fee calculations across domestic and international payment scenarios.")
        ],
        "files": ["// path: lib/processors/fees.ts", "// path: db/migrations/038_processor_fee_schedules.sql", "// path: tests/processors/fees.test.ts"],
        "verification": "Calculate processor cost for $100 international transaction; verify Decimal math calculates exact fees without rounding drift."
    },
    {
        "number": "130",
        "title": "Gateway Official Documentation & Verified Sandbox URLs Registry",
        "phase": "Phase 8: Payment Processor Adapters & Gateway Architecture",
        "objective": "Document official verified documentation URLs and sandbox testing portals for all 5 payment processors.",
        "description": "Per KD Solution IT architectural rules: record verified official documentation URLs and sandbox test resources in `docs/gateways/VERIFIED_URLS.md`. Ensure all adapter implementations align directly with verified provider documentation.",
        "substeps": [
            ("130.1", "Create `docs/gateways/VERIFIED_URLS.md` cataloging official documentation and sandbox URLs for all 5 processors."),
            ("130.2", "Document NMI Collect.js tokenization endpoints (https://secure.nmi.com/token/Collect.js) and Direct Post docs (docs.nmi.com)."),
            ("130.3", "Document Rainforest (rainforestpay.com), Stripe Connect, Airwallex (airwallex.com), and Payoneer official developer docs."),
            ("130.4", "Include test card numbers, sandbox error simulation codes, and webhook testing CLI commands for each provider.")
        ],
        "files": ["// path: docs/gateways/VERIFIED_URLS.md", "// path: docs/gateways/TEST_CARDS.md"],
        "verification": "Review `docs/gateways/VERIFIED_URLS.md`; verify all 5 provider doc links, endpoints, and test card catalogs are present."
    }
]

print(f"Group 5 loaded: {len(GROUP_5)} steps.")
