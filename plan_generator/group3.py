# // path: plan_generator/group3.py
# Phase 5 (Steps 061 - 075) and Phase 6 (Steps 076 - 090)

GROUP_3 = [
    # Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains (061 - 075)
    {
        "number": "061",
        "title": "RBAC Permission Matrix & System Role Definitions",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Define exhaustive Role-Based Access Control matrix covering all 8 system roles and granular permissions.",
        "description": "Establish the platform role hierarchy and permission catalog in `lib/auth/roles.ts`. Define exact permissions for: `super_admin`, `ceo`, `compliance_kyc`, `finance_ops`, `support`, `blogger`, `owner` (sub-merchant), and `client` (token-only).",
        "substeps": [
            ("061.1", "Define TypeScript enum `Role` with the 8 platform roles in `lib/auth/roles.ts`."),
            ("061.2", "Define granular permissions (`MANAGE_GATEWAYS`, `APPROVE_KYC`, `MANAGE_PRICING`, `VIEW_LEDGER`, `RESOLVE_TICKETS`, etc.)."),
            ("061.3", "Create static permission mapping table mapping each role to allowed permission set."),
            ("061.4", "Implement `hasPermission(role, permission)` utility function with unit test coverage.")
        ],
        "files": ["// path: lib/auth/roles.ts", "// path: types/permissions.ts", "// path: tests/auth/roles.test.ts"],
        "verification": "Verify `support` role has zero permissions for `MANAGE_GATEWAYS` or `APPROVE_KYC` and `blogger` has zero merchant access."
    },
    {
        "number": "062",
        "title": "RBAC Route Guards & Next.js Edge Middleware",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build edge middleware and server action guards enforcing strict role separation across all dashboard routes.",
        "description": "Configure Next.js middleware in `middleware.ts` routing users strictly according to role: `/super-admin/*` for super_admin, `/ceo/*` for CEO, `/compliance/*` for compliance_kyc, `/finance/*` for finance_ops, `/support/*` for support, `/blogger/*` for blogger, `/dashboard/*` for owners.",
        "substeps": [
            ("062.1", "Implement route matching rules in `middleware.ts` checking session role against route path prefix."),
            ("062.2", "Redirect unauthorized roles immediately to their designated home dashboard or HTTP 403 Forbidden."),
            ("062.3", "Create React Server Component guard `<RequirePermission permission={...}>` for granular page sections."),
            ("062.4", "Add integration tests verifying that `support` cannot load `/super-admin/gateways` or `/compliance/kyc`.")
        ],
        "files": ["// path: middleware.ts", "// path: lib/auth/guard.ts", "// path: tests/auth/middleware.test.ts"],
        "verification": "Authenticate as support user and request `/super-admin/gateways`; verify immediate 403 Forbidden redirect."
    },
    {
        "number": "063",
        "title": "Dual-Control & Four-Eye Review Framework",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build four-eye review framework requiring separate initiator and approver actors for high-risk operations.",
        "description": "Implement dual-control framework in `lib/compliance/four-eye.ts`. Enforce rule: high-risk actions (large merchant KYC approval, fee structure changes, large manual payouts, tier overrides) cannot be finalized by the user who initiated or proposed them.",
        "substeps": [
            ("063.1", "Create `pending_approvals` table storing `action_type`, `proposed_payload`, `initiator_id`, `approver_id`, `status`."),
            ("063.2", "Implement initiator-approver validation: assert `initiator_id !== approver_id`, throwing error if same actor attempts sign-off."),
            ("063.3", "Provide API and UI for reviewing pending proposals with full diff view and approval/rejection notes."),
            ("063.4", "Write tests verifying an administrator cannot approve their own high-risk proposal.")
        ],
        "files": ["// path: db/migrations/019_create_pending_approvals.sql", "// path: lib/compliance/four-eye.ts", "// path: tests/compliance/four-eye.test.ts"],
        "verification": "Initiate tier override proposal; attempt approval with same actor ID and verify system blocks action."
    },
    {
        "number": "064",
        "title": "Office Multi-Level Approval Chain Engine (Requester -> CEO -> Super Admin)",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build sequential approval chain workflow routing large platform actions from Requester to CEO to Super Admin.",
        "description": "Implement enterprise approval chain engine: Requester proposes action -> CEO reviews and signs off -> Super Admin confirms final release. Required for large payout releases, platform fee adjustments, and country availability toggles.",
        "substeps": [
            ("064.1", "Create `approval_chains` table tracking `step_order`, `required_role`, `actor_id`, `status` (pending, approved, rejected)."),
            ("064.2", "Implement workflow state machine advancing proposal only upon sequential signature of each authorized level."),
            ("064.3", "Dispatch internal dashboard notifications and emails to CEO and Super Admin when approvals are awaiting action."),
            ("064.4", "Write integration test exercising full three-step approval cycle and recording all transitions in audit log.")
        ],
        "files": ["// path: db/migrations/020_create_approval_chains.sql", "// path: lib/office/approval-chain.ts", "// path: tests/office/approval-chain.test.ts"],
        "verification": "Submit large payout proposal; verify CEO receives approval request, followed by Super Admin confirmation gate."
    },
    {
        "number": "065",
        "title": "Multi-Tenant Context Resolution & Isolation Middleware",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build tenant context resolver identifying sub-merchant company ID from authenticated session and injecting into database queries.",
        "description": "Create tenant resolution pipeline in `lib/tenant/context.ts`. Extract `company_id` from verified session, attach to request async storage, and inject into database transactions via `set_tenant_context` to guarantee 100% RLS tenant isolation.",
        "substeps": [
            ("065.1", "Implement `resolveTenantContext(req)` retrieving active company ID for sub-merchant owner."),
            ("065.2", "For office roles, allow tenant context switching with explicit audit logging of which company is being viewed."),
            ("065.3", "Create React context `<TenantProvider>` providing current company metadata to sub-merchant dashboard."),
            ("065.4", "Add unit tests verifying missing or tampered company headers fail closed.")
        ],
        "files": ["// path: lib/tenant/context.ts", "// path: components/tenant/TenantProvider.tsx", "// path: tests/tenant/context.test.ts"],
        "verification": "Query sub-merchant dashboard; verify tenant context automatically filters all database queries by `company_id`."
    },
    {
        "number": "066",
        "title": "Super Admin Global Dashboard Architecture",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build Super Admin global management console with platform settings, logo branding, and role delegation.",
        "description": "Construct dashboard routes under `app/(office)/super-admin/`. Provide controls for platform name, logo, contact details, office staff role delegation, global fee percentages, country enable/disable switches, and system gateway management.",
        "substeps": [
            ("066.1", "Create Super Admin layout and navigation bar in `app/(office)/super-admin/layout.tsx`."),
            ("066.2", "Build general platform settings page (`app/(office)/super-admin/settings/page.tsx`) for logo, name, and support contacts."),
            ("066.3", "Build staff role delegation page (`app/(office)/super-admin/staff/page.tsx`) assigning office roles."),
            ("066.4", "Enforce step-up 2FA reauthentication on saving sensitive platform settings.")
        ],
        "files": ["// path: app/(office)/super-admin/layout.tsx", "// path: app/(office)/super-admin/settings/page.tsx", "// path: app/(office)/super-admin/staff/page.tsx"],
        "verification": "Log in as Super Admin; verify platform settings update successfully and require 2FA reauthentication."
    },
    {
        "number": "067",
        "title": "CEO Executive Approval & Oversight Dashboard",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build dedicated CEO executive dashboard for KYC final approvals, large action confirmations, and risk oversight.",
        "description": "Construct CEO workspace under `app/(office)/ceo/`. Provide dedicated approval queues for final merchant KYC onboarding, confirmation of large Super Admin actions (payout releases, platform fee changes), country availability decisions, and risk tier policies.",
        "substeps": [
            ("067.1", "Create CEO layout and executive KPIs in `app/(office)/ceo/layout.tsx` and `app/(office)/ceo/page.tsx`."),
            ("067.2", "Build KYC final approval queue (`app/(office)/ceo/approvals/kyc/page.tsx`) with underwriting summaries."),
            ("067.3", "Build joint governance screen (`app/(office)/ceo/governance/page.tsx`) for country and pricing decisions."),
            ("067.4", "Implement CEO digital sign-off with Ed25519 signature recorded in audit trail.")
        ],
        "files": ["// path: app/(office)/ceo/layout.tsx", "// path: app/(office)/ceo/page.tsx", "// path: app/(office)/ceo/approvals/kyc/page.tsx"],
        "verification": "Review pending KYC packet as CEO; execute final approval and confirm sub-merchant provisioning is unlocked."
    },
    {
        "number": "068",
        "title": "Compliance & KYC Officer Dedicated Dashboard",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build Compliance & KYC dashboard for identity reviews, underwriting, sanctions screening, and SAR cases.",
        "description": "Construct workspace under `app/(office)/compliance/`. Equip compliance officers with tools for: KYC/KYB document verification, UBO inspection, manual payment review (> $5,000), chargeback dispute document review, daily sanctions/PEP alerts, and SAR case preparation.",
        "substeps": [
            ("068.1", "Create compliance layout and review queues in `app/(office)/compliance/layout.tsx` and `page.tsx`."),
            ("068.2", "Build merchant underwriting review queue (`app/(office)/compliance/underwriting/page.tsx`)."),
            ("068.3", "Build manual payment review interface (`app/(office)/compliance/payments/review/page.tsx`) for transactions > $5k or AVS mismatches."),
            ("068.4", "Build confidential SAR case workspace (`app/(office)/compliance/sar/page.tsx`) hidden from other office roles.")
        ],
        "files": ["// path: app/(office)/compliance/layout.tsx", "// path: app/(office)/compliance/underwriting/page.tsx", "// path: app/(office)/compliance/payments/review/page.tsx"],
        "verification": "Access compliance workspace; review sample merchant application and verify document inspection workflow."
    },
    {
        "number": "069",
        "title": "Finance Operations Dedicated Dashboard",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build Finance Operations dashboard for reconciliation mismatch resolution, settlement releases, and payout handling.",
        "description": "Construct workspace under `app/(office)/finance/`. Equip finance operators with tools for: 3-day reconciliation mismatch resolution, failed payout investigation, settlement batch verification, processor monthly bill matching, and company accounting ledger oversight.",
        "substeps": [
            ("069.1", "Create finance ops layout and KPI cards in `app/(office)/finance/layout.tsx` and `page.tsx`."),
            ("069.2", "Build reconciliation mismatch queue (`app/(office)/finance/reconciliation/page.tsx`) with 72-hour SLA countdown."),
            ("069.3", "Build failed payout resolution screen (`app/(office)/finance/payouts/failed/page.tsx`)."),
            ("069.4", "Build processor bill verification tool (`app/(office)/finance/processor-bills/page.tsx`).")
        ],
        "files": ["// path: app/(office)/finance/layout.tsx", "// path: app/(office)/finance/reconciliation/page.tsx", "// path: app/(office)/finance/payouts/failed/page.tsx"],
        "verification": "Inspect reconciliation mismatch queue; verify 3-day SLA tracker displays remaining resolution time."
    },
    {
        "number": "070",
        "title": "Customer Support Portal with Strict Gateway/KYC Isolation",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build Customer Support portal with ticket management while enforcing strict zero-access to gateway keys and KYC approval.",
        "description": "Construct support portal under `app/(office)/support/`. Enable support staff to manage merchant tickets, communicate with users, and view merchant transaction statuses. Enforce strict architectural isolation: support role has zero access to payment gateway keys, KYC approvals, or payout releases.",
        "substeps": [
            ("070.1", "Create support layout and ticketing queue in `app/(office)/support/layout.tsx` and `page.tsx`."),
            ("070.2", "Build ticket management and reply interface (`app/(office)/support/tickets/[id]/page.tsx`)."),
            ("070.3", "Enforce strict database RLS and route guards forbidding support access to `gateway_credentials` and `kyc_decisions`."),
            ("070.4", "Add unit tests verifying support role receives 403 Forbidden when attempting any gateway or KYC approval action.")
        ],
        "files": ["// path: app/(office)/support/layout.tsx", "// path: app/(office)/support/tickets/[id]/page.tsx", "// path: tests/auth/support-isolation.test.ts"],
        "verification": "Log in as support user; verify gateway keys and KYC approval buttons are completely absent and blocked by RLS."
    },
    {
        "number": "071",
        "title": "Blogger Public Content Management Portal",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build Blogger workspace for CMS blog articles and public content with total isolation from merchant and financial data.",
        "description": "Construct content portal under `app/(office)/blogger/`. Allow bloggers to draft, edit, and publish blog articles and public educational content. Enforce strict zero-access isolation: blogger role cannot access any merchant records, payment transactions, KYC files, or financial reports.",
        "substeps": [
            ("071.1", "Create blogger layout and article list in `app/(office)/blogger/layout.tsx` and `page.tsx`."),
            ("071.2", "Build rich Markdown/WYSIWYG article editor (`app/(office)/blogger/articles/[id]/page.tsx`) with image upload."),
            ("071.3", "Enforce database RLS denying blogger role access to companies, payments, ledger, invoices, or tickets."),
            ("071.4", "Add unit tests verifying blogger role cannot query any merchant or financial database table.")
        ],
        "files": ["// path: app/(office)/blogger/layout.tsx", "// path: app/(office)/blogger/articles/[id]/page.tsx", "// path: tests/auth/blogger-isolation.test.ts"],
        "verification": "Log in as blogger; verify article editor functions cleanly and attempts to query merchant data return RLS denial."
    },
    {
        "number": "072",
        "title": "Sub-Merchant Owner Dashboard Architecture",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build Sub-Merchant Owner portal managing business profile, products, clients, invoices, payments, and payouts.",
        "description": "Construct merchant dashboard under `app/(merchant)/dashboard/`. Enable sub-merchants to view business analytics, manage products and clients, issue invoices and payment links, inspect settlement statements, configure payout bank accounts, and view reserve statuses.",
        "substeps": [
            ("072.1", "Create sub-merchant dashboard layout, sidebar navigation, and header in `app/(merchant)/layout.tsx`."),
            ("072.2", "Build main analytics overview page (`app/(merchant)/dashboard/page.tsx`) displaying volume, balance, holds, and chargeback rate."),
            ("072.3", "Enforce single-owner per company rule: one owner manages exactly one business entity."),
            ("072.4", "Ensure all queries are filtered automatically by sub-merchant's authenticated `company_id` via RLS.")
        ],
        "files": ["// path: app/(merchant)/layout.tsx", "// path: app/(merchant)/dashboard/page.tsx", "// path: app/(merchant)/settings/page.tsx"],
        "verification": "Log in as merchant owner; verify dashboard loads only own company metrics and data."
    },
    {
        "number": "073",
        "title": "Tokenized Client Link Portal Architecture (i/[token] & e/[token])",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build tokenized public portal for clients to view and pay invoices (`i/[token]`) and sign estimates (`e/[token]`) without logging in.",
        "description": "Implement zero-friction client portal under `app/(client)/i/[token]/` and `app/(client)/e/[token]/`. Clients access documents exclusively via high-entropy cryptographically signed tokens without requiring an account or password. Once paid, invoice link locks and displays receipt.",
        "substeps": [
            ("073.1", "Create tokenized invoice view route `app/(client)/i/[token]/page.tsx` verifying token and displaying invoice."),
            ("073.2", "Create tokenized estimate view route `app/(client)/e/[token]/page.tsx` displaying quote and digital signature pad."),
            ("073.3", "Enforce read-only state and receipt display once invoice is fully paid."),
            ("073.4", "Add rate limiting on tokenized endpoints to defend against brute force token scanning.")
        ],
        "files": ["// path: app/(client)/i/[token]/page.tsx", "// path: app/(client)/e/[token]/page.tsx", "// path: lib/client-portal/tokens.ts"],
        "verification": "Access sample invoice via token URL; verify invoice displays with payment options without prompting for login."
    },
    {
        "number": "074",
        "title": "Same-Day Staff Offboarding & Automated Revocation Checklist",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build automated staff offboarding checklist revoking all office sessions, roles, and API access on the same day staff leaves.",
        "description": "Implement immediate staff offboarding engine in `lib/office/offboarding.ts`. Invalidate all active sessions, revoke company memberships, disable 2FA, scramble credentials, log offboarding event in audit log, and generate compliance sign-off checklist.",
        "substeps": [
            ("074.1", "Create `POST /api/office/staff/[id]/offboard` endpoint restricted to Super Admin with step-up 2FA."),
            ("074.2", "Execute revocation in transaction: update user status to `offboarded`, revoke all sessions, set roles to none."),
            ("074.3", "Record `STAFF_OFFBOARDED_IMMEDIATELY` in `audit_logs` capturing offboarded staff ID, actor ID, and checklist."),
            ("074.4", "Write tests verifying offboarded staff member's active cookies are invalidated instantly across all services.")
        ],
        "files": ["// path: app/api/office/staff/[id]/offboard/route.ts", "// path: lib/office/offboarding.ts", "// path: tests/office/offboarding.test.ts"],
        "verification": "Offboard test staff user; verify all active sessions terminate immediately and login is permanently disabled."
    },
    {
        "number": "075",
        "title": "Permission Elevation & Delegation Audit Trail",
        "phase": "Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains",
        "objective": "Build comprehensive audit trail logging every permission grant, role change, and privileged action execution.",
        "description": "Ensure zero unmonitored permission changes. Every role grant, permission elevation, or delegation must generate an immutable audit log entry containing: granting actor ID, recipient user ID, previous role, new role, justification, IP address, and timestamp.",
        "substeps": [
            ("075.1", "Implement `logPermissionChange(actorId, targetUserId, oldRole, newRole, reason)` in `lib/audit/rbac.ts`."),
            ("075.2", "Trigger automated security alert to CEO and Super Admin whenever an office role is delegated or elevated."),
            ("075.3", "Create office audit report view (`app/(office)/super-admin/audit/permissions/page.tsx`) listing all role transitions."),
            ("075.4", "Write unit test verifying audit entry generation and alert dispatch upon role modification.")
        ],
        "files": ["// path: lib/audit/rbac.ts", "// path: app/(office)/super-admin/audit/permissions/page.tsx", "// path: tests/audit/rbac.test.ts"],
        "verification": "Promote user to compliance_kyc; verify audit log entry records transition and security notification is generated."
    },

    # Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine (076 - 090)
    {
        "number": "076",
        "title": "Legal Terms Acceptance Engine with Version, IP & Timestamp Audit",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Build tamper-proof legal terms acceptance engine recording policy version, acceptance time, IP address, and document hash.",
        "description": "Implement terms acceptance tracker in `lib/compliance/terms.ts`. Capture immutable acceptance records in `terms_acceptances` table containing user_id, company_id, policy_id, policy_version, accepted_at, ip_address, user_agent, and SHA-256 hash of policy text at time of acceptance.",
        "substeps": [
            ("076.1", "Create SQL migration `021_create_terms_acceptances.sql` with strict foreign keys and audit indexes."),
            ("076.2", "Implement `recordTermsAcceptance(userId, policySlug, ip, userAgent)` helper function."),
            ("076.3", "Create signup and onboarding terms acceptance UI component with scroll-to-bottom and checkbox validation."),
            ("076.4", "Write tests verifying new policy versions require fresh re-acceptance before allowing dashboard access.")
        ],
        "files": ["// path: db/migrations/021_create_terms_acceptances.sql", "// path: lib/compliance/terms.ts", "// path: components/legal/TermsAcceptanceModal.tsx"],
        "verification": "Accept platform terms at signup; verify database record contains exact IP, timestamp, version, and policy text hash."
    },
    {
        "number": "077",
        "title": "Client & Merchant Funds Fiduciary Segregation Architecture",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Establish legal and database segregation keeping client and sub-merchant settlement funds separated from platform operational funds.",
        "description": "Fulfill regulatory payment facilitator fiduciary duties: sub-merchant settlement funds and rolling reserves must be held in segregated fiduciary ledger accounts completely separated from platform corporate revenue and operational expenses.",
        "substeps": [
            ("077.1", "Define dedicated Chart of Accounts structure separating Fiduciary Settlement Assets (Account 1100) from Corporate Cash (Account 1000)."),
            ("077.2", "Enforce ledger posting constraints preventing commingling of platform operational fees with held merchant settlement balances."),
            ("077.3", "Create daily fiduciary segregation audit check verifying Bank Settlement Account balance equals or exceeds total Merchant Liabilities."),
            ("077.4", "Write automated test raising compliance alert if platform funds dip below fiduciary liability coverage.")
        ],
        "files": ["// path: lib/ledger/fiduciary.ts", "// path: tests/ledger/fiduciary-segregation.test.ts"],
        "verification": "Execute daily fiduciary audit script; verify 100% mathematical match between custodial assets and merchant liabilities."
    },
    {
        "number": "078",
        "title": "Designated Compliance Officer Settings & Registry",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Build platform settings registry recording officially appointed Compliance & AML Officer contact and credentials.",
        "description": "Record appointed AML/CFT Compliance Officer in platform settings (`app/(office)/super-admin/compliance-officer/`). Store officer name, official email, regulator registration number, appointment date, and contact phone for regulatory reporting.",
        "substeps": [
            ("078.1", "Create `compliance_officer_settings` table storing officer details, credentials, and appointment history."),
            ("078.2", "Provide Super Admin interface to update appointed officer with CEO confirmation approval step."),
            ("078.3", "Display compliance officer contact details automatically on legal policy pages and public disclosures."),
            ("078.4", "Audit log all changes to compliance officer appointments in `audit_logs`.")
        ],
        "files": ["// path: db/migrations/022_compliance_officer_settings.sql", "// path: app/(office)/super-admin/compliance-officer/page.tsx"],
        "verification": "Update appointed compliance officer; verify CEO confirmation is required and public legal page reflects updated contact."
    },
    {
        "number": "079",
        "title": "Compliance Calendar, Cyber Insurance & PCI Attestation Renewal Tracker",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Build automated compliance calendar tracking annual PCI DSS Attestation, cyber insurance, and licensing renewal deadlines.",
        "description": "Construct calendar engine in `lib/compliance/calendar.ts`. Track expiration dates for: PCI DSS Attestation of Compliance (AoC), corporate cyber insurance policy, annual penetration testing reports, acquiring bank contracts, and regulatory filings. Dispatch automated alerts 90, 60, and 30 days prior.",
        "substeps": [
            ("079.1", "Create SQL migration `023_create_compliance_calendar.sql` tracking `event_name`, `category`, `expiry_date`, `assigned_to`, `status`."),
            ("079.2", "Build office compliance calendar UI (`app/(office)/compliance/calendar/page.tsx`) with deadline countdowns."),
            ("079.3", "Create background notification worker sending escalation emails at 90d, 60d, 30d, and 7d before expiration."),
            ("079.4", "Add unit tests verifying calendar alerts fire accurately based on remaining threshold days.")
        ],
        "files": ["// path: db/migrations/023_create_compliance_calendar.sql", "// path: lib/compliance/calendar.ts", "// path: app/(office)/compliance/calendar/page.tsx"],
        "verification": "Seed expiring PCI AoC date in 45 days; verify background job flags status as urgent and sends office alert."
    },
    {
        "number": "080",
        "title": "Platform Emergency Liquidity Buffer & Company Funds Capitalization",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Build platform liquidity monitoring engine tracking company funds buffer to absorb delayed settlements and chargeback surges.",
        "description": "Per KD Solution IT operational rules: maintain dedicated company liquidity buffer to cover merchant payouts when processor settlement is delayed or unexpected large chargeback arrives. Alert Finance Ops and CEO if buffer dips below minimum threshold.",
        "substeps": [
            ("080.1", "Create `platform_liquidity_buffers` table tracking current company buffer balance, minimum threshold, and reserve allocations."),
            ("080.2", "Implement automated calculation evaluating 30-day peak chargeback exposure and setting minimum liquidity floor."),
            ("080.3", "Build liquidity monitoring widget on CEO and Finance Ops dashboards with real-time health indicator."),
            ("080.4", "Trigger urgent SMS/email alert to CEO and Finance Ops if buffer falls below 120% of minimum threshold.")
        ],
        "files": ["// path: db/migrations/024_platform_liquidity.sql", "// path: lib/finance/liquidity.ts", "// path: components/finance/LiquidityHealthCard.tsx"],
        "verification": "Simulate processor settlement delay; verify liquidity buffer covers merchant settlement and logs event."
    },
    {
        "number": "081",
        "title": "Global Country Enable/Disable Engine with Sanctioned Country Freeze",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Build global country enable/disable engine jointly controlled by Super Admin and CEO, permanently freezing sanctioned nations.",
        "description": "Implement country availability management in `lib/compliance/country-control.ts`. Maintain ISO 3166-1 country list. Allow Super Admin and CEO to enable/disable merchant countries. Hardcode comprehensive OFAC/UN sanctioned countries (e.g. IR, KP, CU, SY) as permanently disabled.",
        "substeps": [
            ("081.1", "Create SQL migration `025_create_country_controls.sql` with `country_code`, `is_enabled`, `is_sanctioned_frozen`, `updated_by`."),
            ("081.2", "Hardcode permanent sanctions freeze in database constraint: `CHECK (NOT (is_sanctioned_frozen = true AND is_enabled = true))`."),
            ("081.3", "Build country management screen (`app/(office)/super-admin/countries/page.tsx`) requiring dual approval from Super Admin and CEO."),
            ("081.4", "Add unit tests verifying any attempt to enable North Korea (KP) or Iran (IR) raises fatal constraint error.")
        ],
        "files": ["// path: db/migrations/025_create_country_controls.sql", "// path: lib/compliance/country-control.ts", "// path: app/(office)/super-admin/countries/page.tsx"],
        "verification": "Attempt to enable sanctioned country in test suite; verify database check constraint permanently blocks operation."
    },
    {
        "number": "082",
        "title": "CMS Editable Legal Policy Architecture",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Build CMS policy architecture allowing Super Admin to edit legal policies with version increments and re-acceptance triggers.",
        "description": "Construct policy content management engine in `lib/cms/policies.ts`. Store versioned markdown policy documents in `policies` table. Provide admin editor (`app/(office)/super-admin/policies/`). When policy content updates, increment version and require re-acceptance.",
        "substeps": [
            ("082.1", "Create SQL migration `026_create_policies_table.sql` with `slug`, `title`, `content_md`, `version INT`, `effective_date`."),
            ("082.2", "Build policy editor UI with rich markdown preview, version comparison diff tool, and publish workflow."),
            ("082.3", "Implement public policy page renderer (`app/(public)/legal/[slug]/page.tsx`) displaying current active version."),
            ("082.4", "Enforce audit logging of every policy edit, capturing old text, new text diff, editor ID, and effective date.")
        ],
        "files": ["// path: db/migrations/026_create_policies_table.sql", "// path: lib/cms/policies.ts", "// path: app/(public)/legal/[slug]/page.tsx"],
        "verification": "Publish new policy version; verify public URL updates immediately and merchants are prompted for re-acceptance."
    },
    {
        "number": "083",
        "title": "KYC and KYB Policy Implementation & Versioned Acceptance",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement comprehensive KYC and KYB Policy page detailing verification requirements, document types, and review standards.",
        "description": "Draft and deploy public policy at `/legal/kyc-kyb-policy`. Detail identity verification standards, business registration requirements, director/UBO identification, proof of address criteria, review timelines, and account capability activation gates.",
        "substeps": [
            ("083.1", "Seed official KYC/KYB Policy text in `db/seeds/policies/kyc-kyb.md` covering sub-merchant requirements."),
            ("083.2", "Integrate mandatory acceptance checkbox during merchant initial registration and onboarding submission."),
            ("083.3", "Provide PDF download option of agreed policy for merchant legal records."),
            ("083.4", "Verify policy page renders responsive typography, clear headings, and active version timestamp.")
        ],
        "files": ["// path: db/seeds/policies/kyc-kyb.md", "// path: app/(public)/legal/kyc-kyb-policy/page.tsx"],
        "verification": "Navigate to `/legal/kyc-kyb-policy`; verify complete policy text renders and matches seeded version."
    },
    {
        "number": "084",
        "title": "Ultimate Beneficial Ownership (UBO >= 25%) Policy Implementation",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement UBO Policy mandating disclosure, identity verification, and sanctions screening for all owners holding 25% or more equity.",
        "description": "Deploy public policy at `/legal/ubo-policy`. Define legal obligation of corporate sub-merchants to identify all individual Ultimate Beneficial Owners holding 25% or more shares or voting rights, including selfie/liveness verification and sanctions screening.",
        "substeps": [
            ("084.1", "Seed official UBO Policy markdown content in `db/seeds/policies/ubo.md`."),
            ("084.2", "Implement onboarding validation rule enforcing disclosure of all individuals with >= 25% equity sum."),
            ("084.3", "Create UBO declaration legal consent certificate generated upon merchant application submission."),
            ("084.4", "Add unit tests verifying onboarding form blocks submission if declared equity does not account for all >= 25% owners.")
        ],
        "files": ["// path: db/seeds/policies/ubo.md", "// path: app/(public)/legal/ubo-policy/page.tsx"],
        "verification": "Inspect `/legal/ubo-policy`; confirm 25% equity threshold rule and director identification mandates are clearly displayed."
    },
    {
        "number": "085",
        "title": "Anti-Money Laundering (AML) & Counter-Terrorist Financing (CFT) Policy",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement AML and CFT Policy detailing transaction monitoring, suspicious activity reporting, and red flag indicators.",
        "description": "Deploy public policy at `/legal/aml-cft-policy`. Outline platform AML risk methodology, transaction velocity limits, unusual payment patterns, mandatory customer identification, cash-equivalent restrictions, and SAR submission protocols.",
        "substeps": [
            ("085.1", "Seed official AML/CFT Policy text in `db/seeds/policies/aml-cft.md` conforming to FATF and regional guidance."),
            ("085.2", "Incorporate red flag behavior catalog informing merchants of prohibited transaction structuring and money transmission."),
            ("085.3", "Implement merchant acknowledgment step during underwriting and profile completion."),
            ("085.4", "Verify policy page meets accessibility standards and includes designated compliance officer contact.")
        ],
        "files": ["// path: db/seeds/policies/aml-cft.md", "// path: app/(public)/legal/aml-cft-policy/page.tsx"],
        "verification": "Verify `/legal/aml-cft-policy` is accessible, indexed in sitemap, and recorded in policy version registry."
    },
    {
        "number": "086",
        "title": "Sanctions (OFAC/UN/EU/UK HMT) & PEP Screening Policy Implementation",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement Sanctions & Politically Exposed Persons (PEP) Screening Policy aligning with international compliance lists.",
        "description": "Deploy public policy at `/legal/sanctions-pep-policy`. Explain daily screening against OFAC, UN Security Council, EU Consolidated, and UK HMT sanctions lists. Detail enhanced due diligence for PEPs and strict prohibition on sanctioned jurisdictions.",
        "substeps": [
            ("086.1", "Seed Sanctions and PEP Policy text in `db/seeds/policies/sanctions-pep.md`."),
            ("086.2", "Document immediate account freeze procedures upon confirmed positive sanctions match."),
            ("086.3", "Detail merchant right to submit evidence of false positive identity disambiguation."),
            ("086.4", "Verify policy page displays correctly on desktop and mobile viewports.")
        ],
        "files": ["// path: db/seeds/policies/sanctions-pep.md", "// path: app/(public)/legal/sanctions-pep-policy/page.tsx"],
        "verification": "Check `/legal/sanctions-pep-policy`; verify list sources (OFAC, UN, EU, UK HMT) and freeze rules are explicitly enumerated."
    },
    {
        "number": "087",
        "title": "Underwriting, Risk Assessment & Prohibited/Restricted Business Policy",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement Underwriting, Merchant Acceptance & Prohibited/Restricted Businesses Policy with clear MCC classifications.",
        "description": "Deploy policy at `/legal/prohibited-businesses`. Enumerate strictly prohibited business models (weapons, illegal narcotics, adult content, gambling, unregulated financial services, deceptive marketing) and restricted models requiring Tier 1 caps and elevated rolling reserves.",
        "substeps": [
            ("087.1", "Seed Prohibited and Restricted Business Policy text in `db/seeds/policies/prohibited-businesses.md`."),
            ("087.2", "Include explicit searchable table of prohibited MCC codes and associated business categories."),
            ("087.3", "Implement automated onboarding check blocking prohibited MCC selections at form submission time."),
            ("087.4", "Verify policy contains clear instructions for merchants operating in restricted categories.")
        ],
        "files": ["// path: db/seeds/policies/prohibited-businesses.md", "// path: app/(public)/legal/prohibited-businesses/page.tsx"],
        "verification": "Verify prohibited businesses page lists all barred categories and MCC codes with clear explanation."
    },
    {
        "number": "088",
        "title": "Chargeback, Dispute, Refund & Settlement Policy Implementation",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement Chargeback, Dispute, Refund & Settlement Policy defining evidence deadlines, reserve terms, and fees.",
        "description": "Deploy policy at `/legal/chargeback-settlement-policy`. Document 24/48-hour dispute response SLAs, rolling reserve percentages, settlement holding periods, platform fee refundability rules, chargeback fee liability, and negative balance recovery.",
        "substeps": [
            ("088.1", "Seed Chargeback and Settlement Policy in `db/seeds/policies/chargeback-settlement.md`."),
            ("088.2", "Explicitly state 10% 90-day reserve for Tier 1 and 5% 60-day reserve for Tier 2 merchants."),
            ("088.3", "Detail merchant obligation to provide evidence packs within 24 hours of dispute notification."),
            ("088.4", "Display clear warning regarding card network chargeback monitoring thresholds (>0.3%).")
        ],
        "files": ["// path: db/seeds/policies/chargeback-settlement.md", "// path: app/(public)/legal/chargeback-settlement-policy/page.tsx"],
        "verification": "Check `/legal/chargeback-settlement-policy`; verify reserve rates, dispute timelines, and fee rules are accurately stated."
    },
    {
        "number": "089",
        "title": "Data Privacy (GDPR, CCPA) & PCI-DSS Compliance Policy Implementation",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement Data Privacy & PCI-DSS Compliance Policy explaining data encryption, retention, and hosted card data isolation.",
        "description": "Deploy policy at `/legal/privacy-pci-policy`. Clarify platform compliance with GDPR, CCPA, and Asian privacy regulations. Affirm strict PCI-DSS SAQ A scope: card numbers and CVV are entered solely in provider-hosted fields and never touch platform servers.",
        "substeps": [
            ("089.1", "Seed Privacy and PCI-DSS Policy in `db/seeds/policies/privacy-pci.md`."),
            ("089.2", "Explain pre-upload AES-256-GCM file encryption and 7-year regulatory retention standards."),
            ("089.3", "Provide data subject request instructions for merchant and client data access or erasure where legally permitted."),
            ("089.4", "Verify policy includes clear contact email for privacy officer inquiries.")
        ],
        "files": ["// path: db/seeds/policies/privacy-pci.md", "// path: app/(public)/legal/privacy-pci-policy/page.tsx"],
        "verification": "Verify `/legal/privacy-pci-policy` accurately documents zero cardholder data storage and encryption standards."
    },
    {
        "number": "090",
        "title": "Automated Decision Review & Human Appeal Rights Policy Implementation",
        "phase": "Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine",
        "objective": "Implement Automated Decision Review Policy establishing merchant right to human review and appeal of risk or KYC decisions.",
        "description": "Deploy policy at `/legal/automated-decisions-appeal`. Mandate that no merchant account is permanently terminated or denied solely by automated algorithms. Guarantee human review by Compliance team and CEO appeal channel for any adverse risk or onboarding decision.",
        "substeps": [
            ("090.1", "Seed Automated Decision Review Policy in `db/seeds/policies/automated-decisions.md`."),
            ("090.2", "Detail step-by-step appeal process: merchant submits appeal form within 14 days of adverse decision."),
            ("090.3", "Establish 5-business-day SLA for Compliance team to re-examine evidence and issue written determination."),
            ("090.4", "Build appeal submission route and form (`app/(public)/legal/appeal/page.tsx`).")
        ],
        "files": ["// path: db/seeds/policies/automated-decisions.md", "// path: app/(public)/legal/automated-decisions-appeal/page.tsx"],
        "verification": "Verify appeal policy page explains human review rights and appeal submission form functions cleanly."
    }
]

print(f"Group 3 loaded: {len(GROUP_3)} steps.")
