# // path: plan_generator/group4.py
# Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters (Steps 091 - 110)

GROUP_4 = [
    {
        "number": "091",
        "title": "One Person, One Account Multi-Signal Duplicate Detection Engine",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build multi-signal duplicate account detection engine preventing individuals from creating multiple sub-merchant businesses.",
        "description": "Enforce strict KD Solution IT rule: one person holds exactly one account; one owner holds exactly one business. Check 6 signals: email, phone number, identity document number blind hash, tax ID, bank account fingerprint, and normalized legal name with date of birth. Match blocks account and sends case to compliance review.",
        "substeps": [
            ("091.1", "Implement `checkDuplicateSignals(profile)` in `lib/compliance/dedup.ts` scanning against existing active/closed accounts."),
            ("091.2", "Compute blind index hashes for national ID, passport, tax number, and bank account routing/account pair."),
            ("091.3", "If match found, immediately block automated account creation, flag application `duplicate_review`, and alert compliance officer."),
            ("091.4", "Inform applicant with generic message: 'An account associated with these details already exists. Please contact support.'")
        ],
        "files": ["// path: lib/compliance/dedup.ts", "// path: db/migrations/027_duplicate_signals.sql", "// path: tests/compliance/dedup.test.ts"],
        "verification": "Attempt signup with duplicate national ID hash; verify system halts creation and creates compliance review ticket."
    },
    {
        "number": "092",
        "title": "Dynamic Processor-Driven Business Profile Form Engine",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build dynamic business profile form that renders fields dynamically based on connected payment processor requirements.",
        "description": "Construct flexible onboarding form in `app/(merchant)/onboarding/business-profile/`. Adapt field requirements dynamically according to which payment processor (NMI, Stripe Connect, Rainforest, Airwallex) will underwrite the merchant, collecting all processor-required fields without redundant re-entry.",
        "substeps": [
            ("092.1", "Define processor-specific field schemas in `lib/kyb/schemas/` (NMI, Stripe, Rainforest, Airwallex)."),
            ("092.2", "Create unified client form component rendering required fields: legal name, trade name, address, tax ID, formation date."),
            ("092.3", "Store merchant answers in canonical platform structure mapped to each processor's API schema."),
            ("092.4", "Add unit tests verifying schema validation adapts cleanly when switching target processor.")
        ],
        "files": ["// path: app/(merchant)/onboarding/business-profile/page.tsx", "// path: lib/kyb/schemas/index.ts", "// path: tests/kyb/schemas.test.ts"],
        "verification": "Fill business profile form for Stripe vs NMI; verify form prompts for exact required processor fields."
    },
    {
        "number": "093",
        "title": "Merchant Category Code (MCC) Registry & Risk Classifier",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build standard MCC code registry mapping merchant industries to risk tiers, reserve rates, and prohibited status.",
        "description": "Implement ISO 18245 MCC catalog in `lib/constants/mcc.ts`. Provide searchable dropdown in onboarding. Automatically classify selected MCC into Risk Tier 1, Restricted Tier, or Prohibited. Assign baseline rolling reserve percentage and hold days accordingly.",
        "substeps": [
            ("093.1", "Seed ISO 18245 MCC catalog in `lib/constants/mcc.ts` with code, description, risk level, and prohibited flag."),
            ("093.2", "Build searchable MCC combobox UI component `<MccSelector value={mcc} onChange={setMcc} />`."),
            ("093.3", "Implement automated risk classifier assigning starting reserve (10% standard, higher for elevated risk MCCs)."),
            ("093.4", "Add unit tests verifying high-risk MCCs (e.g. software subscriptions vs travel) receive proper risk classifications.")
        ],
        "files": ["// path: lib/constants/mcc.ts", "// path: components/onboarding/MccSelector.tsx", "// path: tests/compliance/mcc.test.ts"],
        "verification": "Select high-risk MCC in onboarding; verify system applies appropriate elevated risk tier and reserve rule."
    },
    {
        "number": "094",
        "title": "Merchant Website & Storefront Authenticity Verification Engine",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build automated and manual website verification pipeline validating business authenticity, terms display, and product listings.",
        "description": "Implement website review workflow in `lib/compliance/website-verify.ts`. Automated crawler checks: domain age, SSL certificate, live HTTP 200 status, presence of Terms of Service, Refund Policy, Contact info, and pricing in USD. Compliance officer performs visual inspection.",
        "substeps": [
            ("094.1", "Create `merchant_websites` table tracking `url`, `crawl_status`, `ssl_valid`, `terms_found`, `refund_policy_found`, `reviewed_by`."),
            ("094.2", "Implement automated URL crawler inspecting homepage and footer links for mandatory legal disclosures."),
            ("094.3", "Build website review panel in compliance officer dashboard displaying embedded preview and inspection checklist."),
            ("094.4", "Block merchant activation until website verification status transitions to `verified`.")
        ],
        "files": ["// path: lib/compliance/website-verify.ts", "// path: db/migrations/028_merchant_websites.sql", "// path: app/(office)/compliance/websites/page.tsx"],
        "verification": "Submit merchant store URL; verify automated crawler inspects SSL and legal pages, flagging for compliance sign-off."
    },
    {
        "number": "095",
        "title": "Unified Processor KYB Document Packet Generator",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build KYB document packet aggregator packaging trade licenses, registry lookups, and tax certificates for processors.",
        "description": "Construct KYB document bundle generator in `lib/kyb/packet.ts`. Assemble: business registration certificate/trade license, registered address proof (<= 90 days), corporate registry lookup result, ownership structure chart, and company tax ID certificate.",
        "substeps": [
            ("095.1", "Define `KybDocumentPacket` data structure encapsulating verified documents, company metadata, and hashes."),
            ("095.2", "Implement secure pre-upload AES-256-GCM encryption for all business registration documents."),
            ("095.3", "Create automated packet validator verifying all mandatory processor KYB items are present before submission."),
            ("095.4", "Write tests asserting packet completeness for corporations, partnerships, and sole proprietors.")
        ],
        "files": ["// path: lib/kyb/packet.ts", "// path: types/kyb.ts", "// path: tests/kyb/packet.test.ts"],
        "verification": "Generate KYB packet for corporate merchant; verify all mandatory documents and metadata are assembled without omissions."
    },
    {
        "number": "096",
        "title": "Director & UBO Identity Collection & Liveness Verification Pipeline",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build director and UBO onboarding workflow collecting government IDs, proof of address, and liveness checks for all owners >= 25%.",
        "description": "Construct UBO collection pipeline in `app/(merchant)/onboarding/beneficial-owners/`. Capture legal name, date of birth, residential address, nationality, national ID/passport upload, and selfie/liveness verification status for every director and UBO at or above 25% ownership.",
        "substeps": [
            ("096.1", "Create `company_beneficial_owners` table with `company_id`, `full_name`, `dob`, `equity_percentage`, `id_doc_id`, `status`."),
            ("096.2", "Enforce business logic constraint: sum of declared beneficial ownership must account for all owners holding >= 25%."),
            ("096.3", "Integrate file upload with AES-256-GCM encryption for passports and national ID cards."),
            ("096.4", "Add unit tests verifying application is rejected if any >=25% owner lacks identity document upload.")
        ],
        "files": ["// path: db/migrations/029_beneficial_owners.sql", "// path: app/(merchant)/onboarding/beneficial-owners/page.tsx", "// path: lib/kyb/ubo.ts"],
        "verification": "Add two 50% shareholders; verify system mandates identity document and address proof for both individuals."
    },
    {
        "number": "097",
        "title": "Proof of Address & Payout Bank Verification Engine",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build address and payout bank account verification pipeline enforcing 90-day utility bill and registered business name match.",
        "description": "Implement proof of address and bank verification in `lib/kyb/bank-address.ts`. Verify address proof issued within 90 days (utility bill, bank statement). Verify payout bank account is registered strictly in legal business name; reject personal accounts for corporate merchants.",
        "substeps": [
            ("097.1", "Implement document issue date validator: verify utility bill or bank statement timestamp is within past 90 days."),
            ("097.2", "Implement legal name fuzzy matching comparing bank account holder name with corporate registration name."),
            ("097.3", "If name mismatch detected, block auto-pass and route case to compliance officer for manual review."),
            ("097.4", "Write tests verifying rejection of utility bills older than 90 days and mismatched bank beneficiary names.")
        ],
        "files": ["// path: lib/kyb/bank-address.ts", "// path: tests/kyb/bank-address.test.ts"],
        "verification": "Submit utility bill dated 120 days ago; verify system rejects document and requests fresh proof within 90 days."
    },
    {
        "number": "098",
        "title": "Supplementary IDV Adapter Common Interface Specification",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Define standard TypeScript interface for supplementary identity verification (IDV) vendors (Jumio, Didit, Sumsub).",
        "description": "Create adapter specification in `lib/idv/types.ts`. Define methods: `initiateVerificationSession`, `checkVerificationStatus`, `verifyWebhookSignature`, and `parseVerificationResult`. Allow Super Admin to activate at most one supplementary IDV vendor at a time.",
        "substeps": [
            ("098.1", "Define `IdvAdapter` interface in `lib/idv/types.ts` with standard session and webhook contracts."),
            ("098.2", "Define `IdvVerificationResult` with normalized fields: `idNumber`, `idType`, `dob`, `livenessPassed`, `confidenceScore`."),
            ("098.3", "Enforce fail-closed policy: if vendor check fails or is unavailable, route case to manual review; never auto-pass."),
            ("098.4", "Create mock IDV adapter for local testing and CI test suites.")
        ],
        "files": ["// path: lib/idv/types.ts", "// path: lib/idv/mock.ts", "// path: tests/idv/adapter-interface.test.ts"],
        "verification": "Verify TypeScript compiles mock adapter fulfilling all interface methods without type errors."
    },
    {
        "number": "099",
        "title": "Jumio Netverify Identity Verification Adapter Implementation",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build Jumio Netverify adapter implementing document verification, biometric selfie, and liveness detection.",
        "description": "Implement Jumio Netverify integration in `lib/idv/jumio.ts`. Support API session creation, redirect/iframe WebSDK integration, signature-verified webhook callback ingestion, and normalized identity result extraction.",
        "substeps": [
            ("099.1", "Implement `JumioAdapter` class handling authentication, API tokens, and session initiation."),
            ("099.2", "Implement webhook callback handler verifying Jumio HMAC signature and extracting verification decision."),
            ("099.3", "Map Jumio status codes (PASSED, FAILED, WARNING) to platform standard verification states."),
            ("099.4", "Add unit tests with sample Jumio webhook payloads asserting accurate status mapping.")
        ],
        "files": ["// path: lib/idv/jumio.ts", "// path: app/api/webhooks/idv/jumio/route.ts", "// path: tests/idv/jumio.test.ts"],
        "verification": "Simulate Jumio webhook with valid HMAC; verify merchant KYC record updates with Jumio verification result."
    },
    {
        "number": "100",
        "title": "Didit Identity & Liveness Verification Adapter Implementation",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build Didit identity verification adapter implementing automated document reading and biometric liveness checks.",
        "description": "Implement Didit adapter in `lib/idv/didit.ts`. Communicate with Didit REST API, initiate verification sessions, process webhook callbacks with cryptographic signature verification, and persist authoritative liveness and OCR results.",
        "substeps": [
            ("100.1", "Implement `DiditAdapter` class creating verification sessions via Didit API client."),
            ("100.2", "Implement Didit webhook verification validating API secret and event timestamp."),
            ("100.3", "Extract OCR extracted document numbers and liveness status into platform KYC data model."),
            ("100.4", "Write tests validating Didit payload parsing and error handling on network timeouts.")
        ],
        "files": ["// path: lib/idv/didit.ts", "// path: app/api/webhooks/idv/didit/route.ts", "// path: tests/idv/didit.test.ts"],
        "verification": "Trigger Didit test verification; verify session token returns and webhook updates verification state."
    },
    {
        "number": "101",
        "title": "Sumsub WebSDK Identity Verification Adapter Implementation",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build Sumsub WebSDK identity verification adapter implementing applicant creation and inspection review webhooks.",
        "description": "Implement Sumsub adapter in `lib/idv/sumsub.ts`. Generate Sumsub WebSDK access tokens, handle applicant level verification (identity, selfie, address), verify Sumsub HMAC-SHA256 webhook signatures, and ingest inspection review outcomes.",
        "substeps": [
            ("101.1", "Implement `SumsubAdapter` class generating SDK access tokens for frontend embedding."),
            ("101.2", "Implement webhook handler in `app/api/webhooks/idv/sumsub/route.ts` checking `x-payload-digest` HMAC header."),
            ("101.3", "Normalize Sumsub reviewAnswer (GREEN, RED) to platform status and persist raw inspection metadata."),
            ("101.4", "Add unit tests verifying rejection of tampered Sumsub webhook digests.")
        ],
        "files": ["// path: lib/idv/sumsub.ts", "// path: app/api/webhooks/idv/sumsub/route.ts", "// path: tests/idv/sumsub.test.ts"],
        "verification": "Generate Sumsub SDK token; verify token is valid and webhook signature verification accepts genuine payload."
    },
    {
        "number": "102",
        "title": "IDV Vendor Registry & Single-Active-Provider Super Admin Switch",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build Super Admin control panel allowing activation of at most one supplementary IDV vendor with fail-closed manual fallback.",
        "description": "Implement IDV registry in `lib/idv/registry.ts`. Allow Super Admin to configure and activate exactly one IDV vendor (Jumio, Didit, or Sumsub) or none. If no vendor is active or check fails, automatically route applications to manual compliance review.",
        "substeps": [
            ("102.1", "Create `idv_settings` table storing `active_vendor` ('none' | 'jumio' | 'didit' | 'sumsub'), credentials, and updated_at."),
            ("102.2", "Build Super Admin IDV settings page (`app/(office)/super-admin/idv/page.tsx`) with 2FA step-up confirmation."),
            ("102.3", "Enforce business rule: vendor result never overrides payment processor KYB rejection or restriction."),
            ("102.4", "Write tests verifying seamless fallback to manual compliance queue when no IDV adapter is active.")
        ],
        "files": ["// path: lib/idv/registry.ts", "// path: app/(office)/super-admin/idv/page.tsx", "// path: tests/idv/registry.test.ts"],
        "verification": "Switch active IDV vendor to 'none'; submit KYC application and verify it routes cleanly to manual compliance review."
    },
    {
        "number": "103",
        "title": "Automated Daily Sanctions Screening Engine (OFAC, UN, EU, UK HMT)",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build automated daily sanctions screening engine checking merchants, directors, and UBOs against international lists.",
        "description": "Implement sanctions screening in `lib/compliance/sanctions.ts`. Ingest official OFAC SDN, UN Consolidated, EU Financial Sanctions, and UK HMT lists. Execute Jaro-Winkler/Levenshtein fuzzy matching against seller legal names, director names, and UBOs at onboarding and daily.",
        "substeps": [
            ("103.1", "Create `sanctions_lists` table storing entity names, aliases, list source, publication date, and hash."),
            ("103.2", "Implement fuzzy matching algorithm with configurable similarity threshold (default 85%)."),
            ("103.3", "If potential match found, block automated activation/payout and open compliance investigation case."),
            ("103.4", "Record list update timestamp and screening execution time in `sanctions_screening_logs`.")
        ],
        "files": ["// path: lib/compliance/sanctions.ts", "// path: db/migrations/030_sanctions_screening.sql", "// path: tests/compliance/sanctions.test.ts"],
        "verification": "Screen applicant with name matching OFAC SDN entry; verify engine flags potential match and blocks activation."
    },
    {
        "number": "104",
        "title": "PEP & Adverse Media Screening Engine with Enhanced Due Diligence",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build Politically Exposed Persons (PEP) and adverse media screening engine triggering Enhanced Due Diligence (EDD).",
        "description": "Implement PEP and adverse media screening in `lib/compliance/pep.ts`. Flag applicants holding senior public positions, military leadership, or associated with financial crime adverse media. Require documented EDD and CEO/Super Admin management sign-off.",
        "substeps": [
            ("104.1", "Create `pep_screening_cases` table tracking `company_id`, `individual_name`, `pep_tier`, `adverse_media_flag`, `status`."),
            ("104.2", "Build compliance officer EDD workspace with fields for Source of Wealth, Source of Funds, and risk rationale."),
            ("104.3", "Enforce dual sign-off: PEP approval requires compliance officer recommendation plus CEO executive approval."),
            ("104.4", "Write tests verifying potential PEP matches cannot be auto-cleared without formal review resolution.")
        ],
        "files": ["// path: lib/compliance/pep.ts", "// path: app/(office)/compliance/pep/page.tsx", "// path: tests/compliance/pep.test.ts"],
        "verification": "Flag sample applicant as PEP; verify activation remains blocked until Compliance and CEO complete EDD approval."
    },
    {
        "number": "105",
        "title": "Risk-Based Underwriting & Starting Limit Assignment Calculator",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build underwriting calculator establishing initial monthly transaction volume limits and risk tier assignments.",
        "description": "Implement underwriting engine in `lib/compliance/underwriting.ts`. Evaluate MCC code, business age, bank statement cash flow, and website risk. Assign new merchants strictly to Tier 1: maximum USD $500 per transaction and USD $2,500 per month, with 10% 90-day reserve.",
        "substeps": [
            ("105.1", "Implement `calculateUnderwritingTiers(companyData)` returning initial tier, transaction cap, and monthly volume limit."),
            ("105.2", "Enforce Tier 1 default: USD $500 max single charge, USD $2,500 monthly limit, 10% rolling reserve for 90 days."),
            ("105.3", "Store approved underwriting parameters in `company_risk_profiles` table with version and reviewer references."),
            ("105.4", "Add unit tests verifying all new approved sellers initialize strictly in Tier 1 regardless of requested volume.")
        ],
        "files": ["// path: lib/compliance/underwriting.ts", "// path: db/migrations/031_company_risk_profiles.sql", "// path: tests/compliance/underwriting.test.ts"],
        "verification": "Underwrite new merchant; verify risk profile initializes with Tier 1 caps ($500/tx, $2,500/mo, 10% reserve)."
    },
    {
        "number": "106",
        "title": "Four-Eye Compliance Review Queue for Merchant Applications",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build four-eye compliance review queue requiring two distinct compliance reviewers for large or high-risk merchants.",
        "description": "Construct review queue under `app/(office)/compliance/queue/`. Standard merchants require one compliance review; merchants in high-risk MCCs or requesting elevated volumes require dual compliance review (first reviewer and second reviewer) before CEO approval.",
        "substeps": [
            ("106.1", "Create `kyc_reviews` table storing `company_id`, `first_reviewer_id`, `second_reviewer_id`, `decision`, `notes`."),
            ("106.2", "Enforce business logic rule: `first_reviewer_id !== second_reviewer_id`."),
            ("106.3", "Build reviewer interface displaying KYB document packet, website inspection results, and sanctions check logs."),
            ("106.4", "Advance application to CEO queue only after all required compliance review signatures are recorded.")
        ],
        "files": ["// path: app/(office)/compliance/queue/page.tsx", "// path: app/(office)/compliance/queue/[id]/page.tsx", "// path: lib/compliance/review.ts"],
        "verification": "Review high-risk application; verify first reviewer approval leaves case in queue awaiting second reviewer sign-off."
    },
    {
        "number": "107",
        "title": "CEO Final KYC Approval & Super Admin Provisioning Authorization Gate",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build final executive sign-off gate requiring CEO approval and Super Admin authority before sub-merchant creation.",
        "description": "Implement executive onboarding sign-off in `app/(office)/ceo/kyc-approvals/`. Following compliance review and payment processor authoritative KYB verification, CEO provides final executive approval, triggering automatic sub-merchant gateway provisioning.",
        "substeps": [
            ("107.1", "Create CEO approval route `POST /api/office/ceo/kyc-approvals/[id]/approve` requiring step-up reauthentication."),
            ("107.2", "Verify processor-side authoritative KYB status is `verified` before permitting platform approval."),
            ("107.3", "Trigger sub-merchant provisioning job upon successful CEO sign-off."),
            ("107.4", "Audit log final approval event in `audit_logs` with CEO actor ID, policy version, and timestamp.")
        ],
        "files": ["// path: app/(office)/ceo/kyc-approvals/page.tsx", "// path: app/api/office/ceo/kyc-approvals/[id]/approve/route.ts", "// path: lib/compliance/ceo-approval.ts"],
        "verification": "Execute CEO final approval; verify merchant status updates to `approved` and provisioning job enqueues."
    },
    {
        "number": "108",
        "title": "Suspicious Activity Report (SAR) Case Management Subsystem",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build confidential Suspicious Activity Report (SAR) workspace strictly restricted to Compliance and Super Admin roles.",
        "description": "Construct confidential SAR management system in `lib/compliance/sar.ts`. System prepares internal case file, document pack, and transaction timeline. Strictly hide SAR data from merchant owner and support staff (tipping-off prevention).",
        "substeps": [
            ("108.1", "Create `sar_cases` table storing `case_number`, `company_id`, `narrative`, `suspect_details`, `status` (draft, filed, closed)."),
            ("108.2", "Install database RLS and route guards restricting SAR table access strictly to `compliance_kyc` and `super_admin`."),
            ("108.3", "Assemble automated evidence document pack: transaction logs, IP addresses, device fingerprints, and KYC documents."),
            ("108.4", "Add unit tests verifying sub-merchant or support role queries to SAR endpoints receive 403 Forbidden.")
        ],
        "files": ["// path: db/migrations/032_sar_cases.sql", "// path: lib/compliance/sar.ts", "// path: app/(office)/compliance/sar/[id]/page.tsx"],
        "verification": "Query SAR endpoints as sub-merchant or support; verify zero records returned and access logged as unauthorized attempt."
    },
    {
        "number": "109",
        "title": "Periodic Re-KYC Scheduling & Event-Triggered Review Engine",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build Re-KYC engine scheduling reviews every 12 months (Tier 3) or 24 months (Tiers 1/2) and triggering on bank/volume spikes.",
        "description": "Construct re-verification scheduler in `lib/compliance/re-kyc.ts`. Enforce 12-month re-KYC for Tier 3 and 24-month for Tiers 1 and 2. Automatically trigger immediate re-KYC upon bank account change, corporate ownership change, or sudden 3x volume spike.",
        "substeps": [
            ("109.1", "Create `re_kyc_schedules` table tracking `company_id`, `due_date`, `trigger_reason`, `status` (scheduled, in_progress, cleared)."),
            ("109.2", "Implement event triggers hooking into bank update, UBO equity modification, and volume anomaly detection."),
            ("109.3", "If re-KYC overdue or unresolved, restrict merchant payout and offer creation capabilities under approved policy."),
            ("109.4", "Write tests verifying re-KYC trigger fires automatically when sub-merchant updates payout bank account.")
        ],
        "files": ["// path: lib/compliance/re-kyc.ts", "// path: db/migrations/033_re_kyc_schedules.sql", "// path: tests/compliance/re-kyc.test.ts"],
        "verification": "Mutate merchant bank account; verify system schedules immediate event-triggered re-KYC and freezes payouts."
    },
    {
        "number": "110",
        "title": "Sub-Merchant Auto-Provisioning Pipeline & Multi-Gateway Sync",
        "phase": "Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters",
        "objective": "Build asynchronous sub-merchant provisioning worker syncing provider submerchant IDs, capabilities, and webhook listeners.",
        "description": "Implement automated provisioning worker in `lib/processors/provisioning.ts`. Upon CEO approval, create sub-merchant accounts across connected payment gateways (NMI, Stripe, Rainforest, Airwallex). Persist provider submerchant IDs and sync capabilities via webhooks.",
        "substeps": [
            ("110.1", "Create `submerchant_accounts` table storing `company_id`, `provider_name`, `provider_submerchant_id`, `status`, `capabilities`."),
            ("110.2", "Implement background job calling provider sub-merchant provisioning APIs with idempotent retry logic."),
            ("110.3", "If no master platform gateway account is connected, queue provisioning and raise urgent alert to office team."),
            ("110.4", "Enable product listings, payments, and payouts only after both processor verification and platform risk checks pass.")
        ],
        "files": ["// path: lib/processors/provisioning.ts", "// path: db/migrations/034_submerchant_accounts.sql", "// path: tests/processors/provisioning.test.ts"],
        "verification": "Trigger provisioning worker for approved merchant; verify provider sub-merchant IDs are generated and stored in database."
    }
]

print(f"Group 4 loaded: {len(GROUP_4)} steps.")
