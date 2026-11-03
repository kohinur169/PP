# // path: plan_generator/group10.py
# Phase 18 (Steps 237 - 242), Phase 19 (Steps 243 - 247), and Phase 20 (Steps 248 - 250)

GROUP_10 = [
    # Phase 18: Company Accounting, Office Dashboards & Operations Metrics (237 - 242)
    {
        "number": "237",
        "title": "Internal Platform Company Accounting Subsystem",
        "phase": "Phase 18: Company Accounting, Office Dashboards & Operations Metrics",
        "objective": "Build platform corporate accounting subsystem tracking company revenue, operating expenses, and processor bills.",
        "description": "Construct internal accounting subsystem in `lib/accounting/company-books.ts`. Track corporate income (platform fee revenue, subscription fees, dispute fee collections) and operating expenses (processor interchange bills, SaaS tooling, salaries, taxes) to produce financial statements.",
        "substeps": [
            ("237.1", "Create `company_accounting_entries` table with standard base columns and UUIDv7 primary keys."),
            ("237.2", "Post automated corporate revenue accruals from payment fee deductions and subscription billing."),
            ("237.3", "Provide expense entry interface for Finance Ops to log processor invoices and operational overhead."),
            ("237.4", "Generate corporate Profit & Loss (P&L) and Balance Sheet reports for executive management.")
        ],
        "files": ["// path: db/migrations/080_company_accounting.sql", "// path: lib/accounting/company-books.ts", "// path: app/(office)/finance/accounting/page.tsx"],
        "verification": "Log test corporate expense; verify corporate P&L report updates with accurate net income."
    },
    {
        "number": "238",
        "title": "Strict RBAC Isolation for Company Accounting Books",
        "phase": "Phase 18: Company Accounting, Office Dashboards & Operations Metrics",
        "objective": "Enforce strict RBAC isolation restricting corporate accounting books strictly to Super Admin, CEO, and Finance Ops.",
        "description": "Per KD Solution IT architectural mandate: the corporate accounting area is accessible strictly to `super_admin`, `ceo`, and `finance_ops`. Sub-merchants, support staff, and bloggers must have 100% zero access to corporate accounting tables, queries, or reports.",
        "substeps": [
            ("238.1", "Install PostgreSQL RLS policy on `company_accounting_entries` denying access to all non-office roles."),
            ("238.2", "Add Next.js middleware guard blocking `/finance/accounting/*` from unauthorized roles."),
            ("238.3", "Ensure sub-merchant API queries never join or expose corporate accounting entries."),
            ("238.4", "Write tests verifying merchant owner attempting to query accounting tables receives RLS denial.")
        ],
        "files": ["// path: db/migrations/081_accounting_rls_lockdown.sql", "// path: tests/auth/accounting-isolation.test.ts"],
        "verification": "Query corporate accounting endpoints as merchant owner; verify request returns 403 Forbidden and zero records."
    },
    {
        "number": "239",
        "title": "Super Admin Global Executive KPI Dashboard",
        "phase": "Phase 18: Company Accounting, Office Dashboards & Operations Metrics",
        "objective": "Build global operations KPI dashboard displaying total processing volume, active merchants, chargeback rate, and revenue.",
        "description": "Construct executive metrics console at `app/(office)/super-admin/metrics/page.tsx`. Aggregate and display real-time platform numbers: total processing volume, active merchant count, overall platform chargeback rate, average settlement hold time, and net platform revenue.",
        "substeps": [
            ("239.1", "Build executive KPI overview in `app/(office)/super-admin/metrics/page.tsx` with high-contrast metric cards."),
            ("239.2", "Implement high-performance aggregation queries using materialized views or indexed summary tables."),
            ("239.3", "Display interactive volume trends, geographic volume distribution, and processor split charts."),
            ("239.4", "Provide date range filters (Today, 7D, 30D, YTD, Custom) with instant recalculation.")
        ],
        "files": ["// path: app/(office)/super-admin/metrics/page.tsx", "// path: lib/metrics/platform-kpis.ts", "// path: components/admin/KpiCard.tsx"],
        "verification": "Access Super Admin metrics page; verify global volume, merchant count, and platform revenue display accurately."
    },
    {
        "number": "240",
        "title": "Sub-Merchant Personal Analytics & Chargeback Dashboard",
        "phase": "Phase 18: Company Accounting, Office Dashboards & Operations Metrics",
        "objective": "Build sub-merchant personal analytics console displaying own processing volume, chargeback rate, holds, and balance.",
        "description": "Construct merchant analytics console at `app/(merchant)/analytics/page.tsx`. Mirror the transparency of executive metrics for the sub-merchant's own business: gross transaction volume, own chargeback rate against 0.3% threshold, held reserve total, and pending settlement.",
        "substeps": [
            ("240.1", "Build merchant analytics overview in `app/(merchant)/analytics/page.tsx`."),
            ("240.2", "Display personal chargeback rate gauge comparing active ratio against card scheme thresholds."),
            ("240.3", "Display settlement schedule chart showing upcoming release dates for held funds."),
            ("240.4", "Ensure queries are strictly tenant-isolated to sub-merchant's authenticated `company_id` via RLS.")
        ],
        "files": ["// path: app/(merchant)/analytics/page.tsx", "// path: lib/metrics/merchant-analytics.ts", "// path: components/merchant/ChargebackGauge.tsx"],
        "verification": "Log in as sub-merchant; verify personal analytics displays own volume, chargeback ratio, and upcoming payout dates."
    },
    {
        "number": "241",
        "title": "Compliance Calendar Expiry Alert Scheduler",
        "phase": "Phase 18: Company Accounting, Office Dashboards & Operations Metrics",
        "objective": "Build background alert scheduler tracking annual compliance calendar renewals and alerting office team.",
        "description": "Implement automated calendar scanner in `lib/compliance/calendar-worker.ts`. Scan compliance calendar daily for upcoming expiration dates (PCI DSS AoC, corporate cyber insurance, penetration tests, acquiring bank licenses). Dispatch notifications at 90d, 60d, 30d, and 7d.",
        "substeps": [
            ("241.1", "Implement background job querying `compliance_calendar` for items expiring in next 90 days."),
            ("241.2", "Dispatch escalation emails to Compliance Officer and Super Admin for pending renewals."),
            ("241.3", "Flag status as `action_required` on CEO and Compliance dashboards when within 30 days."),
            ("241.4", "Add unit tests verifying worker dispatches alerts at correct threshold intervals.")
        ],
        "files": ["// path: lib/compliance/calendar-worker.ts", "// path: tests/compliance/calendar-worker.test.ts"],
        "verification": "Seed calendar item expiring in 25 days; trigger worker; verify status flags urgent and alert email enqueues."
    },
    {
        "number": "242",
        "title": "Sub-Merchant Account Closure & 7-Year Regulatory Retention Engine",
        "phase": "Phase 18: Company Accounting, Office Dashboards & Operations Metrics",
        "objective": "Build merchant account closure workflow holding chargeback liability funds, shredding card tokens, and archiving 7 years.",
        "description": "Implement account closure in `lib/merchant/closure.ts`. When merchant requests closure: hold chargeback liability buffer until 120-day chargeback window closes, disburse remaining balance to bank, instantly delete all saved card tokens, and retain transaction/KYC records for 7 years.",
        "substeps": [
            ("242.1", "Implement `initiateAccountClosure(companyId)` setting status to `closing_pending_chargeback_window`."),
            ("242.2", "Hold reserve buffer covering potential chargeback liabilities until dispute window expires (120 days)."),
            ("242.3", "Instantly delete all stored card tokens associated with departing merchant."),
            ("242.4", "Apply regulatory archival lock preserving all transaction and KYC audit records for mandatory 7-year period.")
        ],
        "files": ["// path: lib/merchant/closure.ts", "// path: db/migrations/082_account_closure.sql", "// path: tests/merchant/closure.test.ts"],
        "verification": "Initiate account closure; verify card tokens delete, chargeback liability holds for 120 days, and data archives for 7 years."
    },

    # Phase 19: Background Jobs Engine, Schedulers & Workers (243 - 247)
    {
        "number": "243",
        "title": "Distributed Background Job Queue Architecture & Task Runner",
        "phase": "Phase 19: Background Jobs Engine, Schedulers & Workers",
        "objective": "Build robust background task runner executing asynchronous jobs with distributed locks and failure monitoring.",
        "description": "Construct central background job engine in `lib/jobs/runner.ts`. Use PostgreSQL or Redis backed queue to orchestrate jobs: sub-merchant provisioning, email dispatch, webhook processing, settlement release, subscription charges, and reconciliation. Support distributed locking and failure alerts.",
        "substeps": [
            ("243.1", "Create `background_jobs` table tracking `job_name`, `payload`, `status`, `scheduled_at`, `locked_until`."),
            ("243.2", "Implement job worker polling loop with advisory lock acquisition to prevent duplicate execution across instances."),
            ("243.3", "Implement retry policy with exponential backoff and dead-letter queue for failed tasks."),
            ("243.4", "Expose job health metrics and alert office team if any background worker stalls or fails.")
        ],
        "files": ["// path: db/migrations/083_background_jobs.sql", "// path: lib/jobs/runner.ts", "// path: tests/jobs/runner.test.ts"],
        "verification": "Enqueue background job; verify worker acquires lock, executes task, and marks job completed."
    },
    {
        "number": "244",
        "title": "Settlement Holding Period Release & Multi-Gate Verification Worker",
        "phase": "Phase 19: Background Jobs Engine, Schedulers & Workers",
        "objective": "Build automated daily settlement release worker evaluating fulfilment and risk gates before releasing held funds.",
        "description": "Implement settlement release worker in `lib/jobs/settlement-release.ts`. Run daily at 01:00 UTC. Scan pending settlements: release funds to Available Balance only if holding period has elapsed AND delivery tracking is verified AND account has zero blocking disputes or reviews.",
        "substeps": [
            ("244.1", "Query pending settlements where `hold_matures_at <= NOW()`."),
            ("244.2", "Verify all fulfilment and risk gates pass via `isSettlementFulfilmentCleared` and `evaluatePayoutEligibility`."),
            ("244.3", "Post double-entry journal moving funds from Account 2100 (Pending Settlement) to Account 2000 (Available Balance)."),
            ("244.4", "Audit log all batch settlement releases and notify merchants with released settlement summary.")
        ],
        "files": ["// path: lib/jobs/settlement-release.ts", "// path: tests/jobs/settlement-release.test.ts"],
        "verification": "Run settlement release worker; verify eligible matured transactions release to available balance and ungated funds remain held."
    },
    {
        "number": "245",
        "title": "Daily Sanctions (OFAC/UN/EU/UK HMT) & PEP Automated Rescreening Worker",
        "phase": "Phase 19: Background Jobs Engine, Schedulers & Workers",
        "objective": "Build automated daily sanctions rescreening worker checking all active merchants and UBOs against latest lists.",
        "description": "Implement daily sanctions screening worker in `lib/jobs/sanctions-rescreen.ts`. Run nightly at 02:00 UTC. Download updated OFAC, UN, EU, and UK HMT lists. Rescreen all active sellers, directors, and UBOs. Detect stale feeds and alert office immediately if screening run is missed.",
        "substeps": [
            ("245.1", "Download and verify latest publication hashes of international sanctions lists."),
            ("245.2", "Execute fuzzy match against all active sub-merchant company names and UBO identities."),
            ("245.3", "If screening feed is stale (>24 hours without update), alert office and block affected activation/payout decisions."),
            ("245.4", "Record screening execution timestamp and matched results in `sanctions_screening_logs`.")
        ],
        "files": ["// path: lib/jobs/sanctions-rescreen.ts", "// path: tests/jobs/sanctions-rescreen.test.ts"],
        "verification": "Trigger daily sanctions worker; verify all active accounts are scanned and screening log timestamp updates."
    },
    {
        "number": "246",
        "title": "Scheduled Re-KYC Evaluator & Sudden Volume Spike Detection Worker",
        "phase": "Phase 19: Background Jobs Engine, Schedulers & Workers",
        "objective": "Build background worker checking annual/biennial Re-KYC schedules and detecting sudden volume anomaly spikes.",
        "description": "Implement Re-KYC and anomaly worker in `lib/jobs/re-kyc-worker.ts`. Check 12-month (Tier 3) and 24-month (Tiers 1/2) Re-KYC deadlines. Detect sudden processing volume spikes (>3x average monthly volume in 48 hours). Flag accounts for compliance review and freeze payouts until cleared.",
        "substeps": [
            ("246.1", "Scan `re_kyc_schedules` table for accounts approaching re-verification due dates."),
            ("246.2", "Calculate 48-hour volume velocity; if velocity exceeds 300% of merchant historical average, flag volume spike."),
            ("246.3", "Restrict payout capabilities and open review ticket in compliance dashboard for flagged accounts."),
            ("246.4", "Dispatch notification email to merchant requesting updated business documents.")
        ],
        "files": ["// path: lib/jobs/re-kyc-worker.ts", "// path: tests/jobs/re-kyc-worker.test.ts"],
        "verification": "Simulate volume spike 4x normal; verify worker flags account, restricts payouts, and creates review ticket."
    },
    {
        "number": "247",
        "title": "Audit Log Hash Chain Verification & Merkle Root Archival Worker",
        "phase": "Phase 19: Background Jobs Engine, Schedulers & Workers",
        "objective": "Build daily audit log integrity worker verifying SHA-256 hash chains, Ed25519 signatures, and anchoring Merkle roots.",
        "description": "Implement audit integrity worker in `lib/jobs/audit-integrity.ts`. Run nightly at 23:59 UTC. Verify unbroken continuity of hash chain across all audit entries created in past 24 hours, validate Ed25519 signatures, compute daily Merkle root, and persist root in `audit_merkle_roots` table.",
        "substeps": [
            ("247.1", "Scan daily batch of `audit_logs` asserting `current_hash = SHA256(prev_hash + sequence + payload)` for every row."),
            ("247.2", "Verify Ed25519 cryptographic signatures for all sampled batch entries."),
            ("247.3", "Calculate 32-byte Merkle root for daily batch and insert into `audit_merkle_roots` table."),
            ("247.4", "Alert office team immediately if any broken hash chain or tampered entry is detected.")
        ],
        "files": ["// path: lib/jobs/audit-integrity.ts", "// path: tests/jobs/audit-integrity.test.ts"],
        "verification": "Run audit integrity worker; verify full 24-hour hash chain validates and daily Merkle root is generated."
    },

    # Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification (248 - 250)
    {
        "number": "248",
        "title": "Full-Stack Performance Audit, Bundle Budgeting & Cache Optimization",
        "phase": "Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification",
        "objective": "Execute performance audit enforcing Server Components, zero N+1 queries, Core Web Vitals, and light runtime load.",
        "description": "Perform comprehensive performance hardening in `docs/performance/AUDIT_REPORT.md`. Enforce Next.js React Server Components by default. Verify pagination on every list, joined single queries, zero queries inside loops, database connection pooling, and sub-500ms cold start budgets on Vercel and Netlify.",
        "substeps": [
            ("248.1", "Execute bundle analyzer; verify client JavaScript bundle size remains under 120KB gzipped for initial load."),
            ("248.2", "Audit database queries across all API routes; verify absence of N+1 query loops and presence of indexes on foreign keys."),
            ("248.3", "Configure Cache-Control headers: public marketing pages cached; merchant dashboards use private short-lived cache."),
            ("248.4", "Verify Google Lighthouse score >= 90 for Performance, Accessibility, Best Practices, and SEO on public pages.")
        ],
        "files": ["// path: docs/performance/AUDIT_REPORT.md", "// path: scripts/audit-performance.ts"],
        "verification": "Run `npm run audit:performance`; verify bundle budgets, zero N+1 queries, and Lighthouse scores pass."
    },
    {
        "number": "249",
        "title": "Disaster Recovery Rehearsal, Backup Restore & Rollback Verification",
        "phase": "Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification",
        "objective": "Execute disaster recovery restore rehearsal on staging, verify point-in-time recovery, and validate migration rollbacks.",
        "description": "Per KD Solution IT launch gates: perform live database restore rehearsal on staging. Validate PostgreSQL Point-In-Time Recovery (PITR). Restore file storage backups. Run complete forward database migration followed by clean backward rollback script to guarantee zero orphaned database state.",
        "substeps": [
            ("249.1", "Execute point-in-time backup restore of Supabase PostgreSQL database on staging environment."),
            ("249.2", "Verify restored database data integrity, hash-chained audit continuity, and zero data corruption."),
            ("249.3", "Execute full forward and backward migration cycle test (`npm run migrate:test-cycle`)."),
            ("249.4", "Record restore rehearsal results and recovery time objective (RTO < 30 mins) in `docs/dr/RESTORE_REHEARSAL.md`.")
        ],
        "files": ["// path: docs/dr/RESTORE_REHEARSAL.md", "// path: scripts/rehearse-dr.ts"],
        "verification": "Run disaster recovery rehearsal script; confirm staging database restores cleanly with verified audit chain continuity."
    },
    {
        "number": "250",
        "title": "Production Go-Live Verification Gates & Final Launch Readiness Sign-Off",
        "phase": "Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification",
        "objective": "Execute comprehensive production launch verification gates, live gateway tests, and CEO/Super Admin sign-off.",
        "description": "Execute final production go-live verification checklist: (1) All 250 steps verified complete; (2) Production environment variables validated; (3) Live gateway keys tested via built-in connection tester; (4) Turnstile verified on production domain; (5) First Super Admin account created with mandatory 2FA; (6) Status page published; (7) Formal sign-off recorded.",
        "substeps": [
            ("250.1", "Run automated production readiness suite `npm run verify:go-live` checking env vars, database, and storage."),
            ("250.2", "Execute live test transaction cycle (sandbox payment, refund, webhook) across all 5 payment processors."),
            ("250.3", "Verify production domain HTTPS enforcement, HSTS, security headers, and Sentry error capture."),
            ("250.4", "Record formal production launch sign-off certificate signed by CEO and Super Admin in `docs/final/GO_LIVE_SIGNOFF.md`.")
        ],
        "files": ["// path: scripts/verify-go-live.ts", "// path: docs/final/GO_LIVE_SIGNOFF.md", "// path: docs/final/HANDOFF.md"],
        "verification": "Execute `npm run verify:go-live`; verify all 250 production gates pass with green status and zero blocking findings."
    }
]

print(f"Group 10 loaded: {len(GROUP_10)} steps.")
