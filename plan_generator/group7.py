# // path: plan_generator/group7.py
# Phase 11 (Steps 161 - 175) and Phase 12 (Steps 176 - 185)

GROUP_7 = [
    # Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates (161 - 175)
    {
        "number": "161",
        "title": "Risk Tier Policy Versioning Schema & Governance Rules",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Design versioned risk tier policy schema editable only by CEO and Super Admin through formal approval workflow.",
        "description": "Create risk tier policy architecture in `lib/compliance/tier-policy.ts`. Store versioned policy definitions in `risk_tier_policies` table. Define transaction caps, monthly limits, reserve rates, reserve holding days, and post-fulfilment payout delays. Any change requires distinct proposal and CEO/Super Admin approval.",
        "substeps": [
            ("161.1", "Create SQL migration `051_create_risk_tier_policies.sql` storing policy versions, parameters, and effective dates."),
            ("161.2", "Define immutable policy version linking: every payment and payout record references the active `policy_version_id` applied at authorization."),
            ("161.3", "Enforce dual-actor governance: changes proposed by Super Admin require CEO confirmation; changes proposed by CEO require Super Admin confirmation."),
            ("161.4", "Audit log all policy version proposals and approvals in `audit_logs`.")
        ],
        "files": ["// path: db/migrations/051_create_risk_tier_policies.sql", "// path: lib/compliance/tier-policy.ts", "// path: types/tier-policy.ts"],
        "verification": "Verify policy version schema, constraints, and assert that unapproved policy proposals cannot be activated."
    },
    {
        "number": "162",
        "title": "Tier 1 (New Merchant) Limits & 10% 90-Day Reserve Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Enforce baseline Tier 1 limits: max USD $500/transaction, USD $2,500/month, 10% 90-day reserve, payout >= 7 days post-fulfilment.",
        "description": "Implement Tier 1 policy rules in `lib/compliance/tier1.ts`. Every newly onboarded seller starts strictly in Tier 1. Enforce: single transaction cap $500 USD, monthly gross volume cap $2,500 USD, 10% rolling reserve held for 90 days, and payout eligibility no earlier than 7 days after verified delivery.",
        "substeps": [
            ("162.1", "Implement pre-charge check `validateTier1Transaction(companyId, amount)` rejecting charges > $500."),
            ("162.2", "Check calendar month cumulative volume, rejecting charges that would push monthly total past $2,500."),
            ("162.3", "Allocate 10% of captured amount into rolling reserve account with 90-day maturity timestamp."),
            ("162.4", "Enforce payout gate: block settlement release until at least 7 days after recorded delivery confirmation.")
        ],
        "files": ["// path: lib/compliance/tier1.ts", "// path: tests/compliance/tier1.test.ts"],
        "verification": "Attempt $550 charge for Tier 1 merchant; verify charge is rejected with error `Exceeds Tier 1 transaction limit of $500`."
    },
    {
        "number": "163",
        "title": "Tier 2 Eligibility Evaluator & 5% 60-Day Reserve Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build Tier 2 eligibility evaluator and limits: max USD $2,500/tx, $15,000/mo, 5% 60-day reserve, payout >= 3 days post-fulfilment.",
        "description": "Implement Tier 2 policy in `lib/compliance/tier2.ts`. Eligibility criteria: minimum 60 active days, at least 20 completed orders, chargeback rate below 0.3%, and zero active fraud flags. Tier 2 limits: max $2,500 per charge, $15,000 monthly limit, 5% reserve held 60 days, payout >= 3 days post-fulfilment.",
        "substeps": [
            ("163.1", "Implement `evaluateTier2Eligibility(companyId)` evaluating 60 days, 20 orders, and <0.3% chargeback rate."),
            ("163.2", "Enforce Tier 2 limits on approved accounts: $2,500 max transaction and $15,000 monthly volume cap."),
            ("163.3", "Apply 5% rolling reserve with 60-day maturity on Tier 2 payments."),
            ("163.4", "Enforce post-fulfilment payout delay of at least 3 days after verified delivery.")
        ],
        "files": ["// path: lib/compliance/tier2.ts", "// path: tests/compliance/tier2.test.ts"],
        "verification": "Evaluate merchant with 65 active days and 25 orders; verify eligibility succeeds and Tier 2 parameters apply upon approval."
    },
    {
        "number": "164",
        "title": "Tier 3 Eligibility Evaluator & Custom Reserve Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build Tier 3 eligibility evaluator and limits: max USD $10,000/tx, $50,000/mo, 0-5% reserve, payout >= 2 days post-fulfilment.",
        "description": "Implement Tier 3 policy in `lib/compliance/tier3.ts`. Eligibility criteria: minimum 180 active days, 100 completed orders, chargeback rate below 0.3%, and current cleared re-KYC. Tier 3 limits: max $10,000 per charge, $50,000 monthly limit (higher requires custom approval), 0-5% reserve, payout >= 2 days post-fulfilment.",
        "substeps": [
            ("164.1", "Implement `evaluateTier3Eligibility(companyId)` checking 180 days, 100 orders, chargeback <0.3%, and re-KYC validity."),
            ("164.2", "Enforce Tier 3 limits: $10,000 transaction cap and $50,000 monthly volume cap."),
            ("164.3", "Configure custom reserve rate (0% to 5%) based on compliance risk determination."),
            ("164.4", "Enforce post-fulfilment payout delay of at least 2 days after verified delivery.")
        ],
        "files": ["// path: lib/compliance/tier3.ts", "// path: tests/compliance/tier3.test.ts"],
        "verification": "Evaluate merchant meeting Tier 3 criteria; verify system qualifies account for manual Tier 3 upgrade review."
    },
    {
        "number": "165",
        "title": "Idempotent Monthly Volume Counter & Limit Enforcement",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build idempotent calendar-month volume accumulator enforcing tier caps with zero race-condition overages.",
        "description": "Implement monthly volume tracker in `lib/compliance/volume-tracker.ts`. Track cumulative gross processing volume for current calendar month using idempotent database counter and advisory locks. Reject charges that would cause cumulative volume to exceed active tier cap.",
        "substeps": [
            ("165.1", "Create `company_monthly_volumes` table storing `company_id`, `month_year`, `gross_volume`, `charge_count`."),
            ("165.2", "Atomically increment volume within payment transaction using row lock `FOR UPDATE`."),
            ("165.3", "If `gross_volume + charge_amount > monthly_limit`, reject charge with `MonthlyVolumeCapExceededError`."),
            ("165.4", "Write tests simulating concurrent charges near monthly limit; verify volume cap is strictly enforced without overages.")
        ],
        "files": ["// path: db/migrations/052_company_monthly_volumes.sql", "// path: lib/compliance/volume-tracker.ts", "// path: tests/compliance/volume-tracker.test.ts"],
        "verification": "Process charges up to $2,500 monthly limit; verify next charge is blocked and volume resets cleanly on 1st of next month."
    },
    {
        "number": "166",
        "title": "Standardized Chargeback Rate Observation Window & Denominator Calculator",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build card network standard chargeback rate calculator evaluating sliding observation window and minimum sample size.",
        "description": "Implement chargeback rate calculator in `lib/compliance/chargeback-rate.ts`. Calculate rate = `total_chargebacks / total_transactions` over 90-day sliding observation window. Enforce card network rule: percentage threshold applies only after minimum sample size of 50 transactions is reached.",
        "substeps": [
            ("166.1", "Implement `calculateChargebackRate(companyId, windowDays = 90)` returning ratio and sample count."),
            ("166.2", "Apply minimum sample size threshold: if transactions < 50, do not trigger automated percentage sanctions."),
            ("166.3", "If chargeback rate >= 0.3% and sample >= 50, flag account for compliance monitoring and extra reserve."),
            ("166.4", "If chargeback rate >= 0.9%, trigger automated suspension warning and hold escalation.")
        ],
        "files": ["// path: lib/compliance/chargeback-rate.ts", "// path: tests/compliance/chargeback-rate.test.ts"],
        "verification": "Test with 1 dispute in 10 transactions (10% rate, sample < 50); verify system holds penalty pending minimum sample threshold."
    },
    {
        "number": "167",
        "title": "Four-Eye Merchant Tier Upgrade Review & CEO Approval Workflow",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build four-eye tier upgrade workflow requiring automated qualification, compliance review, and CEO final approval.",
        "description": "Per KD Solution IT policy: no automatic tier upgrades occur. When merchant meets eligibility, system generates upgrade proposal. Compliance officer reviews business history and submits recommendation. CEO performs required final approval. Super Admin retains full authority.",
        "substeps": [
            ("167.1", "Create `tier_upgrade_requests` table tracking `company_id`, `current_tier`, `requested_tier`, `reviewed_by`, `approved_by`."),
            ("167.2", "System generates upgrade proposal when automated metrics qualify account."),
            ("167.3", "Compliance team reviews chargeback history, fulfilment proof, and re-KYC before recommending upgrade."),
            ("167.4", "CEO executes final approval sign-off; tier upgrade takes effect prospectively from approval timestamp.")
        ],
        "files": ["// path: db/migrations/053_tier_upgrades.sql", "// path: lib/compliance/tier-upgrade.ts", "// path: app/(office)/compliance/tier-upgrades/page.tsx"],
        "verification": "Qualify merchant for Tier 2; verify upgrade requires Compliance review followed by CEO approval before taking effect."
    },
    {
        "number": "168",
        "title": "Automated Risk-Based Tier Downgrade & Settlement Freeze Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build automated risk-based tier downgrade and settlement freeze engine responding to fraud spikes or dispute surges.",
        "description": "Implement risk mitigation engine in `lib/compliance/risk-downgrade.ts`. Automatically apply risk tier downgrade (Tier 3->2 or Tier 2->1), increase rolling reserve, or freeze payouts when: chargeback rate spikes, fraud alert is received, or adverse media triggers.",
        "substeps": [
            ("168.1", "Implement `triggerRiskAction(companyId, actionType, reason, evidence)` in `lib/compliance/risk-downgrade.ts`."),
            ("168.2", "Supported actions: `downgrade_tier`, `increase_reserve_rate`, `extend_hold_days`, `freeze_payouts`."),
            ("168.3", "Record evidence, rationale, and active policy version in `risk_intervention_logs`."),
            ("168.4", "Dispatch formal merchant notice explaining risk action and providing appeal pathway under approved policy.")
        ],
        "files": ["// path: lib/compliance/risk-downgrade.ts", "// path: db/migrations/054_risk_intervention_logs.sql", "// path: tests/compliance/risk-downgrade.test.ts"],
        "verification": "Simulate chargeback surge >0.9%; verify system executes risk action, increases reserve, and notifies merchant with appeal link."
    },
    {
        "number": "169",
        "title": "Fulfilment Evidence Ingestion & Carrier Tracking Verification Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build fulfilment evidence collection and carrier tracking integration validating delivery confirmation before payout.",
        "description": "Construct fulfilment tracking engine in `lib/fulfilment/tracker.ts`. Merchants submit delivery evidence for physical goods (carrier tracking number: FedEx, UPS, DHL, USPS) or service completion proof (client acceptance sign-off, digital delivery log).",
        "substeps": [
            ("169.1", "Create `fulfilment_records` table tracking `invoice_id`, `carrier`, `tracking_number`, `delivery_status`, `delivered_at`."),
            ("169.2", "Integrate tracking webhook/API verifying carrier status transitions to `delivered`."),
            ("169.3", "For services, support digital client delivery confirmation with timestamped client sign-off."),
            ("169.4", "Add unit tests verifying delivery timestamp is persisted and unverified shipments block payout timers.")
        ],
        "files": ["// path: db/migrations/055_fulfilment_records.sql", "// path: lib/fulfilment/tracker.ts", "// path: app/(merchant)/fulfilment/page.tsx"],
        "verification": "Submit carrier tracking; verify system records delivery confirmation and starts post-fulfilment payout timer."
    },
    {
        "number": "170",
        "title": "Fulfilment-Gated Settlement Holding Period Release Gate",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Enforce mandatory fulfilment gate: settlement hold timer starts only after verified delivery; funds held if delivery missing.",
        "description": "Per KD Solution IT payout rules: payout eligibility requires recorded delivery confirmation or buyer acceptance. The post-fulfilment hold delay (7d for Tier 1, 3d for Tier 2, 2d for Tier 3) begins strictly on `delivered_at` timestamp. Missing fulfilment proof keeps funds held indefinitely.",
        "substeps": [
            ("170.1", "Implement `isSettlementFulfilmentCleared(paymentId)` evaluating delivery status and post-fulfilment delay."),
            ("170.2", "If fulfilment evidence is missing, keep funds in Pending Settlement; never release on timer alone."),
            ("170.3", "Exception release requires documented compliance justification and dual CEO/Super Admin sign-off."),
            ("170.4", "Write tests verifying funds remain held indefinitely when delivery tracking is not supplied.")
        ],
        "files": ["// path: lib/fulfilment/payout-gate.ts", "// path: tests/fulfilment/payout-gate.test.ts"],
        "verification": "Test payment with completed holding timer but missing delivery proof; verify settlement release is blocked."
    },
    {
        "number": "171",
        "title": "Payout Multi-Gate Evaluator & Eligibility Barrier Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build multi-gate payout barrier verifying 6 prerequisites before disbursing funds: provider, bank, reserve, fulfilment, disputes, and cooling.",
        "description": "Implement payout evaluator in `lib/finance/payout-gates.ts`. Payout dispatches only when ALL 6 gates pass: (1) Processor verification active; (2) Verified payout bank; (3) Bank change 96h cooling clear; (4) Minimum $100 balance available; (5) Fulfilment confirmed + tier delay passed; (6) Zero blocking disputes/reviews.",
        "substeps": [
            ("171.1", "Implement `evaluatePayoutEligibility(companyId)` evaluating all 6 barrier conditions."),
            ("171.2", "If any single gate fails, block payout batch inclusion and log specific blocking reason."),
            ("171.3", "Provide detailed payout eligibility diagnostic view on sub-merchant dashboard."),
            ("171.4", "Write unit tests asserting payout failure when each of the 6 individual gates is toggled to failed.")
        ],
        "files": ["// path: lib/finance/payout-gates.ts", "// path: tests/finance/payout-gates.test.ts"],
        "verification": "Evaluate payout with 5 gates passed and 1 gate failing; verify payout is blocked with exact diagnostic indicator."
    },
    {
        "number": "172",
        "title": "Merchant Payout Bank Account Verification & Name Matching",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build payout bank account registration and legal name verification syncing to Payoneer or Airwallex.",
        "description": "Implement bank management in `lib/finance/bank-account.ts`. When merchant adds bank account: verify bank account name matches registered legal business name. Automatically register verified bank with Payoneer or Airwallex payout adapters.",
        "substeps": [
            ("172.1", "Create `company_bank_accounts` table storing `company_id`, `bank_name`, `account_last4`, `routing_number`, `status`."),
            ("172.2", "Encrypt full bank account number and routing codes at rest using AES-256-GCM."),
            ("172.3", "Sync verified bank details automatically to Payoneer Mass Payouts or Airwallex Connected Accounts."),
            ("172.4", "Reject bank accounts where account holder name differs from registered corporate entity name.")
        ],
        "files": ["// path: db/migrations/056_company_bank_accounts.sql", "// path: lib/finance/bank-account.ts", "// path: app/(merchant)/settings/payouts/page.tsx"],
        "verification": "Add payout bank account; verify encryption at rest, name match check, and automatic registration with Payoneer."
    },
    {
        "number": "173",
        "title": "Bank Account Change 96-Hour Cooling Period Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Enforce mandatory 96-hour payout freeze on bank account changes starting only after manual compliance verification.",
        "description": "Per KD Solution IT anti-account-takeover rules: changing a payout bank account requires manual compliance verification first. The 96-hour cooling period starts ONLY after compliance verification passes. During cooling, all payouts are 100% frozen (including to old bank). If verification fails, cooling never starts.",
        "substeps": [
            ("173.1", "When bank update is submitted, set status to `pending_compliance_verification`."),
            ("173.2", "Compliance officer inspects bank proof; upon approval, set `cooling_ends_at = NOW() + INTERVAL '96 hours'`."),
            ("173.3", "During 96-hour cooling window, block all payouts completely across all platform accounts for that merchant."),
            ("173.4", "If compliance verification fails, reject update; cooling never starts and previous bank remains active.")
        ],
        "files": ["// path: lib/finance/cooling-period.ts", "// path: tests/finance/cooling-period.test.ts"],
        "verification": "Update bank account; verify compliance must verify first, then 96-hour cooling freezes all payouts until timer expires."
    },
    {
        "number": "174",
        "title": "Minimum USD $100 Payout Rule & Remainder Accumulation Engine",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Enforce minimum USD $100 payout threshold and accumulate smaller amounts until threshold or account closure.",
        "description": "Implement payout batching rules in `lib/finance/payout-batch.ts`. Minimum payout amount is USD $100.0000. Available balances below $100 are retained in Available Balance and accumulate across settlement periods until exceeding $100, or paid out on final account closure.",
        "substeps": [
            ("174.1", "Implement `qualifyPayoutAmount(availableBalance)` checking `availableBalance >= 100.0000`."),
            ("174.2", "If balance < $100, retain funds in Available Balance and display accumulation notice on merchant dashboard."),
            ("174.3", "When merchant formally closes account, release full remaining balance regardless of $100 minimum post-hold."),
            ("174.4", "Write tests verifying $95 balance accumulates and triggers payout once next settlement pushes balance to $120.")
        ],
        "files": ["// path: lib/finance/payout-batch.ts", "// path: tests/finance/payout-batch.test.ts"],
        "verification": "Attempt payout of $85; verify system accumulates balance without payout and triggers payout when balance hits $100+."
    },
    {
        "number": "175",
        "title": "Failed Payout Notification & Finance Operations Resolution Queue",
        "phase": "Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates",
        "objective": "Build failed payout handler dispatching immediate merchant email alerts and enqueuing Finance Ops investigation.",
        "description": "Implement failed payout handler in `lib/finance/failed-payout.ts`. When bank or provider rejects payout: immediately reverse ledger debit back to Available Balance, dispatch security/information email to merchant, and open investigation ticket in Finance Ops queue.",
        "substeps": [
            ("175.1", "Process payout rejection webhook: set payout status to `failed` with provider rejection code."),
            ("175.2", "Post reversing ledger journal returning funds from Payout In Transit to Merchant Available Balance."),
            ("175.3", "Dispatch `PAYMENT_PAYOUT_FAILED` email to merchant explaining bank rejection reason."),
            ("175.4", "Create investigation ticket in Finance Ops dashboard (`app/(office)/finance/payouts/failed/`).")
        ],
        "files": ["// path: lib/finance/failed-payout.ts", "// path: app/(office)/finance/payouts/failed/page.tsx", "// path: tests/finance/failed-payout.test.ts"],
        "verification": "Simulate failed Payoneer payout; verify ledger reverses funds to merchant balance and email alert is sent."
    },

    # Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine (176 - 185)
    {
        "number": "176",
        "title": "TaxCloud API Client & Credential Encryption",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build TaxCloud REST API client with AES-256-GCM encrypted credential storage for US sales tax calculation.",
        "description": "Implement TaxCloud client in `lib/tax/taxcloud.ts`. Encrypt merchant TaxCloud API ID and API Key at rest. Communicate with TaxCloud API (`Lookup`, `Authorized`, `Captured`, `Returned`) to calculate destination-based US state and local sales tax.",
        "substeps": [
            ("176.1", "Create `lib/tax/taxcloud.ts` wrapping TaxCloud API endpoints with error handling and retry."),
            ("176.2", "Encrypt TaxCloud credentials at rest in `merchant_taxcloud_configs` table."),
            ("176.3", "Implement masked display showing only last 4 characters of TaxCloud API key."),
            ("176.4", "Write tests verifying TaxCloud client builds correct tax lookup payload from invoice line items.")
        ],
        "files": ["// path: lib/tax/taxcloud.ts", "// path: db/migrations/057_taxcloud_configs.sql", "// path: tests/tax/taxcloud.test.ts"],
        "verification": "Test TaxCloud client with sandbox credentials; verify address lookup returns tax percentage breakdown."
    },
    {
        "number": "177",
        "title": "Sub-Merchant TaxCloud Integration & On/Off Toggle",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build merchant tax settings portal allowing sub-merchants to connect personal TaxCloud accounts and toggle tax collection.",
        "description": "Construct tax settings interface in `app/(merchant)/settings/taxes/page.tsx`. Enable sub-merchants to input their TaxCloud credentials, test connection, and toggle automated US sales tax collection on or off. Platform builds no complex tax engine of its own.",
        "substeps": [
            ("177.1", "Build tax configuration page in `app/(merchant)/settings/taxes/page.tsx`."),
            ("177.2", "Provide toggle switch: 'Collect US Sales Tax via TaxCloud' (default off)."),
            ("177.3", "Validate credentials via live TaxCloud ping before permitting toggle activation."),
            ("177.4", "Audit log tax configuration updates in `audit_logs`.")
        ],
        "files": ["// path: app/(merchant)/settings/taxes/page.tsx", "// path: lib/tax/settings.ts", "// path: tests/tax/settings.test.ts"],
        "verification": "Enable TaxCloud with test credentials; verify connection verifies and tax toggle activates successfully."
    },
    {
        "number": "178",
        "title": "Real-Time Destination-Based US Sales Tax Calculation Engine",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build real-time sales tax calculator computing US state and municipal tax by destination address on checkout.",
        "description": "Implement tax calculator in `lib/tax/calculate.ts`. When US customer enters billing/shipping address: call TaxCloud `Lookup` with origin and destination postal addresses and line item TIC codes. Add exact calculated sales tax as separate invoice line item.",
        "substeps": [
            ("178.1", "Implement `calculateSalesTax(invoice, customerAddress)` querying TaxCloud when tax toggle is enabled."),
            ("178.2", "Verify destination country is United States (US); skip calculation for non-US transactions."),
            ("178.3", "Append calculated tax as distinct line item: 'Sales Tax (State/Local)' on invoice and checkout screen."),
            ("178.4", "Add unit tests verifying tax is added only when enabled and matches TaxCloud response exactly.")
        ],
        "files": ["// path: lib/tax/calculate.ts", "// path: tests/tax/calculate.test.ts"],
        "verification": "Calculate tax for California destination; verify invoice displays California sales tax line item accurately."
    },
    {
        "number": "179",
        "title": "Tax Line-Item Breakdown & Dedicated Ledger Journal Storage",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Store sales tax line items immutably on invoice and post dedicated double-entry ledger entries for sales tax collected.",
        "description": "Record tax details on invoice and payment records. Upon payment capture: post sales tax liability to Account 2300 (Sales Tax Payable). Fiduciary segregation ensures collected sales tax is accounted separately from merchant product revenue.",
        "substeps": [
            ("179.1", "Store `tax_amount`, `tax_rate`, `tax_jurisdiction` on `invoices` and `payments` tables."),
            ("179.2", "Post double-entry journal: Credit Account 2300 (Sales Tax Payable) for exact tax portion of payment."),
            ("179.3", "Ensure platform fee calculation applies strictly to gross subtotal excluding tax (or per merchant setting)."),
            ("179.4", "Write tests verifying tax amounts balance to penny in ledger journals.")
        ],
        "files": ["// path: lib/tax/ledger.ts", "// path: tests/tax/ledger.test.ts"],
        "verification": "Capture payment with $8.50 sales tax; verify ledger credits Account 2300 (Sales Tax Payable) with exactly $8.5000."
    },
    {
        "number": "180",
        "title": "Sub-Merchant & Platform-Wide Sales Tax Reporting Dashboard",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build sales tax reporting dashboard displaying collected sales tax totals per sub-merchant and platform-wide.",
        "description": "Construct tax reporting interfaces in merchant dashboard (`app/(merchant)/analytics/taxes/`) and Super Admin console (`app/(office)/super-admin/taxes/`). Display collected tax totals by state, jurisdiction, and date range for easy filing with TaxCloud/state authorities.",
        "substeps": [
            ("180.1", "Build merchant tax report view itemizing tax collected by US state and tax jurisdiction."),
            ("180.2", "Build Super Admin platform-wide tax summary aggregating tax collected across all sub-merchants."),
            ("180.3", "Provide CSV export of tax reporting lines for quarterly state tax filing."),
            ("180.4", "Add unit tests verifying aggregation accuracy across multiple sub-merchants and states.")
        ],
        "files": ["// path: app/(merchant)/analytics/taxes/page.tsx", "// path: app/(office)/super-admin/taxes/page.tsx", "// path: lib/tax/reporting.ts"],
        "verification": "Generate tax report for Q1; verify state-by-state tax totals match ledger Account 2300 entries."
    },
    {
        "number": "181",
        "title": "SaaS Subscription Plans Schema & Entitlements Definition",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Create `subscription_plans` schema defining plan tiers, prices, intervals, and included platform services.",
        "description": "Migrate plan definitions in `db/migrations/058_subscription_plans.sql`. Super Admin configures plans: name, monthly/annual price in USD, and entitled services array (`invoicing`, `payment_links`, `recurring_billing`, `public_api`, `custom_branding`, `test_mode`).",
        "substeps": [
            ("181.1", "Create `subscription_plans` table storing `name`, `price_usd`, `interval`, `entitlements JSONB`, `is_active`."),
            ("181.2", "Create `company_subscriptions` table linking sub-merchants to active plan, status, and renewal dates."),
            ("181.3", "Build Super Admin plan management UI (`app/(office)/super-admin/plans/`)."),
            ("181.4", "Seed default launch plans: Starter ($29/mo), Professional ($79/mo), Enterprise ($199/mo).")
        ],
        "files": ["// path: db/migrations/058_subscription_plans.sql", "// path: lib/billing/plans.ts", "// path: app/(office)/super-admin/plans/page.tsx"],
        "verification": "Create new plan in Super Admin console; verify plan details and entitlement array persist in database."
    },
    {
        "number": "182",
        "title": "Plan Entitlements Guard & Feature Authorization Middleware",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build entitlement enforcement middleware blocking sub-merchants from accessing services outside their active plan.",
        "description": "Implement feature gating engine in `lib/billing/entitlements.ts`. Check sub-merchant's active plan entitlements before permitting: API key creation, public payment links, recurring invoice schedules, custom branding, or store plugin connections.",
        "substeps": [
            ("182.1", "Implement `hasEntitlement(companyId, entitlementKey)` querying cached company plan features."),
            ("182.2", "Create route middleware and server action guard `requireEntitlement(key)` returning HTTP 403 / upgrade prompt."),
            ("182.3", "Create UI component `<PlanUpgradeModal feature={...} />` displayed when accessing locked features."),
            ("182.4", "Add unit tests verifying Starter plan merchant cannot generate public API keys or recurring schedules.")
        ],
        "files": ["// path: lib/billing/entitlements.ts", "// path: components/billing/PlanUpgradeModal.tsx", "// path: tests/billing/entitlements.test.ts"],
        "verification": "Attempt to create API key on plan lacking API entitlement; verify system blocks action and prompts for upgrade."
    },
    {
        "number": "183",
        "title": "Merchant Subscription Balance-First Auto-Debit Engine",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build subscription billing engine debiting plan fee from merchant platform balance first, falling back to saved card.",
        "description": "Implement subscription billing in `lib/billing/charge-subscription.ts`. On plan renewal due date: attempt debit first from sub-merchant Available Balance. If balance is insufficient, charge saved payment card stored in Super Admin platform gateway account.",
        "substeps": [
            ("183.1", "Implement `processSubscriptionRenewal(companyId)` evaluating available balance."),
            ("183.2", "If balance >= plan price: post double-entry journal debiting Merchant Available Balance and crediting Platform Subscription Revenue."),
            ("183.3", "If balance insufficient: charge saved customer card token via platform gateway account."),
            ("183.4", "Write tests verifying balance-first debit logic and fallback to card when balance is empty.")
        ],
        "files": ["// path: lib/billing/charge-subscription.ts", "// path: tests/billing/charge-subscription.test.ts"],
        "verification": "Execute subscription renewal on account with $100 balance; verify $29 fee is debited from balance with zero card charge."
    },
    {
        "number": "184",
        "title": "Stored Card Mandate Legal Agreement & Future-Charge Consent Tracker",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build stored card mandate agreement recording explicit future-charge consent text, version, timestamp, and IP.",
        "description": "Per card scheme and legal rules: saving a card for subscription fallback requires explicit merchant future-charge mandate agreement. Record consent text, mandate version, acceptance timestamp, and IP address in `subscription_card_mandates` table.",
        "substeps": [
            ("184.1", "Create `subscription_card_mandates` table tracking `company_id`, `card_last4`, `consent_text`, `ip_address`, `accepted_at`."),
            ("184.2", "Build mandate acceptance UI with explicit checkbox: 'I authorize KD Solution IT to charge this card for recurring subscription fees'."),
            ("184.3", "Store card token via platform gateway account; delete token immediately upon account closure or cancellation."),
            ("184.4", "Add unit tests verifying card cannot be saved without valid signed mandate record.")
        ],
        "files": ["// path: db/migrations/059_card_mandates.sql", "// path: lib/billing/mandates.ts", "// path: components/billing/CardMandateCheckbox.tsx"],
        "verification": "Save card for subscription billing; verify database records explicit mandate text, IP, and timestamp."
    },
    {
        "number": "185",
        "title": "7-Day Pre-Due Warning & Automatic Due-Date Service Suspension Engine",
        "phase": "Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine",
        "objective": "Build subscription alert engine sending warnings 7 days prior and instantly suspending services if unpaid on due date.",
        "description": "Implement subscription lifecycle manager in `lib/billing/lifecycle.ts`. Dispatch email warnings 7 days before renewal. If balance debit and card charge both fail on due date: instantly suspend payment processing and public links. Keep login, billing page, and support open. Restore all services immediately upon successful payment.",
        "substeps": [
            ("185.1", "Implement background job sending advance renewal warning emails 7 days prior to renewal."),
            ("185.2", "If payment fails on due date: update company status to `suspended_unpaid_billing` and block payment processing."),
            ("185.3", "Enforce access rules: sub-merchant can still log in, access billing payment screen, and open support tickets."),
            ("185.4", "Upon payment success, automatically transition status back to `active` and re-enable all services instantly.")
        ],
        "files": ["// path: lib/billing/lifecycle.ts", "// path: tests/billing/lifecycle.test.ts"],
        "verification": "Simulate failed billing on due date; verify payment links disable, merchant logs in, and paying invoice restores services."
    }
]

print(f"Group 7 loaded: {len(GROUP_7)} steps.")
