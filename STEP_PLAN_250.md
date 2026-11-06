// path: docs/final/STEP_PLAN_250.md
# KD SOLUTION IT - 250-Step Production Implementation Guide & Execution Plan

> **Authoritative Engineering Guide & Flawless Execution Architecture**  
> **Platform:** Multi-Tenant SaaS Payment Facilitator Platform for Asian Market with Worldwide Merchant Country Control  
> **Total Steps:** Exactly 250 Granular Sequential Steps Across 20 Execution Phases  
> **Specification Alignment:** 100% Comprehensive Coverage of `FEATURE_LIST.md` (Sections 1 through 34) With Zero Omissions

---

## Executive Architecture & Core Platform Foundations

KD SOLUTION IT is an enterprise-grade multi-tenant SaaS payment facilitator (PayFac) platform engineered for Asian sub-merchants with worldwide buyer acceptance and strict jurisdiction controls. Every step in this plan is designed for zero-defect production readiness, high-concurrency resilience, and mathematical precision.

### Core Architectural Non-Negotiables
1. **English-Only Standardization:** All user interfaces, code, comments, seeds, templates, email notifications, and documentation are strictly in English. All UI strings reside in `lib/i18n/strings/en.ts` with zero hardcoded literals.
2. **Currency & Money Precision:** All amounts across the platform are strictly in **USD**. Money is stored in PostgreSQL as `numeric(18,4)`. Floating point arithmetic is strictly banned; all financial math uses fixed-precision Decimal libraries with Banker's rounding (HALF_EVEN).
3. **Base Table Schema Standard:** Every single table across the database contains: `id UUIDv7`, `company_id UUIDv7`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`, and `version INT` for optimistic concurrency locking.
4. **Row Level Security (RLS) Default-Deny:** PostgreSQL Row Level Security is enabled and forced on every table with default-deny policies isolating tenant data by `company_id`.
5. **Cryptographic Audit Trail:** Every mutation generates an append-only, hash-chained audit log entry (`prev_hash` -> `current_hash`) signed with Ed25519 and aggregated into daily Merkle tree roots for external verification.
6. **Double-Entry Financial Ledger:** Every monetary movement writes balancing debits and credits constrained by a database zero-balance trigger (`SUM(debits) - SUM(credits) = 0`). The ledger is strictly immutable; corrections are written solely as compensating reversals.
7. **CDE Complete Card Data Isolation (PCI-DSS SAQ A):** Card number, CVV, and expiration date are entered exclusively inside provider-hosted secure iframes (NMI Collect.js and Stripe Elements). Platform servers and databases never read, transmit, store, or log cardholder data.
8. **Five Payment Processors:**
   - **NMI:** Primary gateway integration via official NMI Direct Post / REST API and Collect.js hosted tokenization (`https://secure.nmi.com/token/Collect.js`).
   - **Payoneer:** Automated sub-merchant payout bank account synchronization and mass payout disbursement.
   - **Rainforest (rainforestpay.com):** Embedded payment acceptance and sub-merchant account onboarding.
   - **Stripe Connect:** Custom and Express connected sub-merchant accounts, charges, and payouts.
   - **Airwallex (airwallex.com):** Connected accounts, global/Asian local payment methods, and cross-border payouts.
9. **Merchant Risk Tiers & Fulfilment Gates:**
   - **Tier 1 (New):** USD $500/transaction cap, USD $2,500/month cap, 10% rolling reserve held 90 days, payout eligibility >= 7 days post-verified delivery.
   - **Tier 2:** Requires >= 60 active days, 20 orders, chargeback rate < 0.3%; USD $2,500/tx cap, USD $15,000/month cap, 5% reserve held 60 days, payout >= 3 days post-delivery.
   - **Tier 3:** Requires >= 180 active days, 100 orders, chargeback rate < 0.3%, cleared re-KYC; USD $10,000/tx cap, USD $50,000/month cap, 0–5% reserve, payout >= 2 days post-delivery.
   - **USD $5,000+ Manual Review:** Any transaction exceeding USD $5,000 requires documented manual compliance review before capture, regardless of tier. Capture remains blocked until approval.
10. **LR-022 Session & Authentication Security:** Session-bound cookies (`HttpOnly`, `Secure`, `SameSite=Strict`), per-device proof keys, rotating session tokens, family invalidation on token replay detection, mandatory TOTP 2FA, and strict 2-hour account lockout after exactly 2 consecutive failed password or 2FA attempts.
11. **First-Line Path Comment Rule:** Line 1 of every source file must contain `// path: relative/path/to/file` enforced by automated linter.

---

## Master Phase Directory (250 Steps)

| Phase | Domain & Coverage | Step Range | Total Steps |
|---|---|---|---|
| **Phase 1** | Project Setup, Tooling & Platform Architecture | Steps 001 - 015 | 15 Steps |
| **Phase 2** | Database Schema Foundations, UUIDv7 & Security Baselines | Steps 016 - 030 | 15 Steps |
| **Phase 3** | Cryptography, Key Management & Secure Storage Layer | Steps 031 - 045 | 15 Steps |
| **Phase 4** | Authentication, LR-022 Session Engine & 2FA / Turnstile | Steps 046 - 060 | 15 Steps |
| **Phase 5** | RBAC Engine, Multi-Tenant Isolation & Approval Chains | Steps 061 - 075 | 15 Steps |
| **Phase 6** | Compliance Framework, Legal Policies & CMS Policy Engine | Steps 076 - 090 | 15 Steps |
| **Phase 7** | Merchant Onboarding, KYB/KYC & IDV Verification Adapters | Steps 091 - 110 | 20 Steps |
| **Phase 8** | Payment Processor Adapters & Gateway Architecture | Steps 111 - 130 | 20 Steps |
| **Phase 9** | Payment Engine, Hosted Fields, 3DS & Card Security | Steps 131 - 145 | 15 Steps |
| **Phase 10** | Double-Entry Ledger, Balance Engine & Reconciliation | Steps 146 - 160 | 15 Steps |
| **Phase 11** | Merchant Risk Tiers, Screening, Limits & Fulfilment Gates | Steps 161 - 175 | 15 Steps |
| **Phase 12** | Sales Tax Calculation (TaxCloud) & Billing Engine | Steps 176 - 185 | 10 Steps |
| **Phase 13** | Invoicing, Estimates, Recurring Billing & Payment Links | Steps 186 - 200 | 15 Steps |
| **Phase 14** | Refunds, Chargebacks, Disputes & Evidence Pack Engine | Steps 201 - 210 | 10 Steps |
| **Phase 15** | Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce) | Steps 211 - 220 | 10 Steps |
| **Phase 16** | Email System, Notifications & Template Engine | Steps 221 - 228 | 8 Steps |
| **Phase 17** | Support Ticketing, Announcements, Status Page & Public CMS/Blog | Steps 229 - 236 | 8 Steps |
| **Phase 18** | Company Accounting, Office Dashboards & Operations Metrics | Steps 237 - 242 | 6 Steps |
| **Phase 19** | Background Jobs Engine, Schedulers & Workers | Steps 243 - 247 | 5 Steps |
| **Phase 20** | Performance, Observability, Disaster Recovery & Go-Live Verification | Steps 248 - 250 | 3 Steps |
| **TOTAL** | **Full Production Scope (FEATURE_LIST.md Sections 1-34)** | **Steps 001 - 250** | **250 Steps** |

---

## Phase 1: Project Setup, Tooling & Platform Architecture

### Step 001: Next.js 14/15 App Router & Strict TypeScript Setup
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Initialize the enterprise Next.js App Router repository with TypeScript configured in maximum strict mode, absolute path aliases, and baseline directory structure.  

**Technical Architecture & Specification:**  
Establish the foundational runtime and build environment using Next.js with React Server Components (RSC) enabled by default. Enforce TypeScript strictness with noImplicitAny, strictNullChecks, and exactOptionalPropertyTypes to guarantee compile-time type safety across all platform modules.

**Granular Sub-Steps:**
- **Step 001.1:** Initialize Next.js project with App Router, TypeScript, and ESLint in root directory.
- **Step 001.2:** Configure `tsconfig.json` with strict mode, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`, and path aliases (`@/*` mapping to `./*`).
- **Step 001.3:** Create standard project directories: `app/`, `components/`, `lib/`, `db/`, `types/`, `docs/`, and `tests/`.
- **Step 001.4:** Configure package scripts for `dev`, `build`, `start`, `lint`, and `typecheck`.

**Primary Files & Required Path Comments:**
- `// path: tsconfig.json`
- `// path: package.json`
- `// path: next.config.js`

**Verification & Quality Gate:**  
Run `npm run typecheck` and `npm run build` to ensure clean zero-error compilation with zero implicit any types.

---

### Step 002: Tailwind CSS, Design System Primitives & UI Component Library
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Set up Tailwind CSS, Radix UI headless primitives, Lucide icons, and accessible responsive design tokens tailored for Asian and global merchant workflows.  

**Technical Architecture & Specification:**  
Establish a consistent, high-performance UI foundation using Tailwind CSS and Radix UI. Ensure lightweight bundle sizes, zero runtime CSS-in-JS overhead, WCAG AA compliance, responsive mobile/desktop layouts, and light/dark theme contrast tokens.

**Granular Sub-Steps:**
- **Step 002.1:** Install and configure Tailwind CSS, PostCSS, Autoprefixer, and `@tailwindcss/forms`.
- **Step 002.2:** Define enterprise color palette, typography, borders, and spacing tokens in `tailwind.config.ts`.
- **Step 002.3:** Install Radix UI primitives for dialogs, dropdowns, tooltips, popovers, and accordions.
- **Step 002.4:** Create reusable atomic UI components in `components/ui/` (Button, Input, Select, Badge, Card, Modal, Table).

**Primary Files & Required Path Comments:**
- `// path: tailwind.config.ts`
- `// path: app/globals.css`
- `// path: components/ui/Button.tsx`
- `// path: components/ui/Input.tsx`

**Verification & Quality Gate:**  
Verify all UI primitives render correctly in responsive viewports with zero console warnings and pass accessibility linter.

---

### Step 003: English-Only Centralized String Dictionary & i18n Guard
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Enforce strict English-only platform standard with all user-facing strings centralized in `lib/i18n/strings/en.ts` and automated static analysis guards.  

**Technical Architecture & Specification:**  
Per KD Solution IT platform rules, all UI copy, error messages, seed data, notifications, and code comments must be strictly in English. Centralize all string keys in a strongly typed dictionary to prevent untranslated strings, typos, and hardcoded literals.

**Granular Sub-Steps:**
- **Step 003.1:** Create `lib/i18n/strings/en.ts` with structured namespaces for auth, billing, compliance, kyc, checkout, and admin.
- **Step 003.2:** Implement typed string lookup utility `t(key, params)` with compile-time key validation.
- **Step 003.3:** Develop an ESLint rule or pre-commit AST scanner forbidding hardcoded English/non-English text literals in JSX/TSX.
- **Step 003.4:** Add unit tests verifying string completeness, placeholder substitution, and missing key detection.

**Primary Files & Required Path Comments:**
- `// path: lib/i18n/strings/en.ts`
- `// path: lib/i18n/index.ts`
- `// path: tests/i18n/strings.test.ts`

**Verification & Quality Gate:**  
Run AST scanner script to confirm no raw string literals exist outside the centralized dictionary and tests pass.

---

### Step 004: Decimal Money Math & Fixed Precision (numeric(18,4)) Engine
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Build a zero-floating-point-error financial calculation library using fixed decimal precision and standard USD formatting.  

**Technical Architecture & Specification:**  
Implement a financial math engine built on `decimal.js` or `bignumber.js` enforcing PostgreSQL `numeric(18,4)` compliance. Ban JavaScript native floating point math for all money calculations (fees, taxes, reserves, splits, refunds, and ledger debits/credits).

**Granular Sub-Steps:**
- **Step 004.1:** Install `decimal.js` and configure global precision to 18 digits with 4 decimal places rounding (HALF_EVEN/Banker's rounding).
- **Step 004.2:** Create `lib/money/money.ts` with immutable methods: `add`, `sub`, `mul`, `div`, `round`, `compare`, and `allocate`.
- **Step 004.3:** Implement USD currency formatter `formatUSD(amount)` producing standard currency representations.
- **Step 004.4:** Write comprehensive unit test suite covering rounding edge cases, fractional cents, and multi-party fee splits.

**Primary Files & Required Path Comments:**
- `// path: lib/money/money.ts`
- `// path: lib/money/types.ts`
- `// path: tests/money/money.test.ts`

**Verification & Quality Gate:**  
Run unit tests verifying 100% precision on splitting $100 across 3 parties with exact penny conservation and zero precision loss.

---

### Step 005: Multi-Vector Input Sanitization Pipeline
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Construct a universal sanitization engine defending against XSS, SQLi, CSRF, SSRF, header injection, null bytes, path traversal, and Unicode homograph exploits.  

**Technical Architecture & Specification:**  
Create a unified security middleware and utility layer that sanitizes all incoming payloads before reaching validation and database queries. Normalize Unicode using NFC, strip null bytes (`\0`), remove path traversal markers (`../`), and sanitize HTML using DOMPurify.

**Granular Sub-Steps:**
- **Step 005.1:** Implement `sanitizeString(input)` handling null bytes, Unicode NFC normalization, and control characters.
- **Step 005.2:** Implement HTML sanitization using `isomorphic-dompurify` with strict attribute allowlists.
- **Step 005.3:** Create SSRF protection utility validating outbound HTTP URLs against private IP ranges (RFC 1918, loopbacks, link-local, cloud metadata).
- **Step 005.4:** Create request pipeline wrapper in `lib/security/sanitize.ts` with deep object recursive sanitization.

**Primary Files & Required Path Comments:**
- `// path: lib/security/sanitize.ts`
- `// path: lib/security/ssrf.ts`
- `// path: tests/security/sanitize.test.ts`

**Verification & Quality Gate:**  
Execute security test suite verifying rejection of XSS vectors, null byte truncation, AWS metadata URLs (169.254.169.254), and directory traversal attempts.

---

### Step 006: Zod Validation Framework for Client & Server APIs
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Establish unified Zod schema definitions with automatic client-side and server-side request/response validation.  

**Technical Architecture & Specification:**  
Standardize all data ingestion across HTTP endpoints, server actions, webhooks, and forms using Zod. Create reusable primitives for UUIDv7, email, phone (E.164), monetary strings, country codes (ISO 3166-1 alpha-2), and MCC codes.

**Granular Sub-Steps:**
- **Step 006.1:** Define core Zod schema primitives in `lib/validation/primitives.ts` (UUIDv7, MoneyString, CountryCode, CurrencyCode, SafeText).
- **Step 006.2:** Create server request validator middleware `validateRequest(schema)` returning standard RFC 7807 error responses.
- **Step 006.3:** Implement React Hook Form resolver integration using `@hookform/resolvers/zod`.
- **Step 006.4:** Write schema validation unit tests verifying boundary values, invalid types, and error message formatting.

**Primary Files & Required Path Comments:**
- `// path: lib/validation/primitives.ts`
- `// path: lib/validation/middleware.ts`
- `// path: tests/validation/primitives.test.ts`

**Verification & Quality Gate:**  
Ensure invalid payloads return structured HTTP 422 errors with precise field path pointers and clean error messages.

---

### Step 007: Structured Logging & Correlation ID Tracing
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Build high-performance JSON structured logger attaching correlation IDs, tenant IDs, actor IDs, and Sentry context to all events.  

**Technical Architecture & Specification:**  
Implement enterprise structured logging using Pino or Winston formatting to stdout in JSON. Enforce automatic correlation tracing with `x-correlation-id` headers across API boundaries, server actions, database queries, and background tasks.

**Granular Sub-Steps:**
- **Step 007.1:** Create `lib/logger/logger.ts` configuring JSON output, timestamping, log levels (debug, info, warn, error, fatal).
- **Step 007.2:** Implement correlation ID middleware generating UUIDv7 trace IDs and attaching them to request async local storage.
- **Step 007.3:** Ensure sensitive fields (passwords, card tokens, API secrets, Tax IDs) are automatically redacted in log serializes.
- **Step 007.4:** Integrate log handler with Sentry breadcrumbs for error tracking.

**Primary Files & Required Path Comments:**
- `// path: lib/logger/logger.ts`
- `// path: lib/logger/context.ts`
- `// path: lib/logger/redact.ts`

**Verification & Quality Gate:**  
Trigger test requests and verify JSON log output includes correlationId, companyId, and confirms full masking of sensitive keys.

---

### Step 008: Error Handling Framework & Custom Error Hierarchy
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Develop a centralized application error hierarchy mapping internal exceptions to secure, sanitized client responses.  

**Technical Architecture & Specification:**  
Create a robust error architecture subclassing standard Error into AppError, ValidationError, AuthenticationError, AuthorizationError, ConcurrencyError, LedgerError, and GatewayError. Prevent internal stack trace leakage to external callers.

**Granular Sub-Steps:**
- **Step 008.1:** Define custom error classes in `lib/errors/index.ts` with HTTP status codes, error codes, and operational flags.
- **Step 008.2:** Implement global error boundary component in Next.js App Router (`app/error.tsx`, `app/global-error.tsx`).
- **Step 008.3:** Create API error response formatter transforming exceptions into RFC 7807 Problem Details JSON format.
- **Step 008.4:** Configure automated Sentry capture for non-operational or unexpected 500 errors.

**Primary Files & Required Path Comments:**
- `// path: lib/errors/index.ts`
- `// path: app/error.tsx`
- `// path: lib/errors/handler.ts`

**Verification & Quality Gate:**  
Simulate validation, authentication, and database failure scenarios; verify clean client JSON response without stack traces.

---

### Step 009: Payment Idempotency Engine & Distributed Locking
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Implement an idempotency key engine for payment operations to prevent duplicate charges, concurrent race conditions, and double-settlement.  

**Technical Architecture & Specification:**  
Require `Idempotency-Key` headers on all mutating payment, refund, and payout APIs. Use Redis or database advisory locks to ensure concurrent identical requests await the primary execution and receive cached identical responses.

**Granular Sub-Steps:**
- **Step 009.1:** Create `idempotency_keys` table tracking key, company_id, request_hash, response_payload, status, and expires_at.
- **Step 009.2:** Implement `withIdempotency(key, handler)` middleware managing locking (PENDING, COMPLETED, FAILED).
- **Step 009.3:** Hash incoming request body and verify payload matches original request when reusing key; reject mismatches with HTTP 422.
- **Step 009.4:** Add unit tests simulating simultaneous concurrent requests with identical keys verifying exactly one execution.

**Primary Files & Required Path Comments:**
- `// path: lib/idempotency/index.ts`
- `// path: db/migrations/001_idempotency.sql`
- `// path: tests/idempotency/idempotency.test.ts`

**Verification & Quality Gate:**  
Run concurrent race test with 10 threads; verify only 1 charge executes and 9 receive cached response with HTTP 200/201.

---

### Step 010: Optimistic Concurrency Control Engine
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Implement optimistic locking across all editable records using version columns to eliminate lost update anomalies.  

**Technical Architecture & Specification:**  
Ensure every editable entity (merchant profiles, invoices, gateway configs, risk tiers, and ledger accounts) increments a `version` column on update. Detect conflicting concurrent mutations and return explicit HTTP 409 Conflict errors.

**Granular Sub-Steps:**
- **Step 010.1:** Define standard TypeScript entity interface with `version: number`.
- **Step 010.2:** Create `executeOptimisticUpdate(table, id, expectedVersion, data)` database utility function.
- **Step 010.3:** Implement conflict detection logic: if rows updated equals 0, throw ConcurrencyError(HTTP 409).
- **Step 010.4:** Add client-side UX feedback pattern notifying user of stale data and offering safe reload/merge.

**Primary Files & Required Path Comments:**
- `// path: lib/db/concurrency.ts`
- `// path: tests/db/concurrency.test.ts`

**Verification & Quality Gate:**  
Test concurrent edits to same invoice; verify first write succeeds (version 1->2) and second write raises HTTP 409.

---

### Step 011: Multi-Environment Configuration & .env.example Validation
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Enforce strict runtime environment variable validation with complete `.env.example` template and zero hardcoded secrets.  

**Technical Architecture & Specification:**  
Create strict Zod environment schema in `lib/config/env.ts` verifying all required secrets, API keys, database URLs, and feature flags on startup. Crash immediately with descriptive errors if any production variable is missing or malformed.

**Granular Sub-Steps:**
- **Step 011.1:** Define comprehensive environment Zod schema in `lib/config/env.ts` separating server and public variables.
- **Step 011.2:** Create `.env.example` documenting every required variable with descriptive placeholders and zero sensitive values.
- **Step 011.3:** Implement startup validation hook in `next.config.js` and server initialization to prevent running with invalid config.
- **Step 011.4:** Add environment variable presence check script for CI/CD pipelines.

**Primary Files & Required Path Comments:**
- `// path: lib/config/env.ts`
- `// path: .env.example`
- `// path: scripts/validate-env.ts`

**Verification & Quality Gate:**  
Run `npm run build` with missing required environment variables; verify build fails immediately with explicit list of missing keys.

---

### Step 012: Sentry Error Monitoring & Performance Tracing Setup
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Configure Sentry SDK for client, server, and edge runtimes with PII scrubbing, release tracking, and performance budgets.  

**Technical Architecture & Specification:**  
Integrate `@sentry/nextjs` for real-time exception tracking across Vercel and Netlify deployments. Configure `beforeSend` hooks to redact credit card tokens, bank account numbers, passwords, and KYC personal data.

**Granular Sub-Steps:**
- **Step 012.1:** Install `@sentry/nextjs` and configure `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`.
- **Step 012.2:** Implement PII scrubbing sanitizers in `beforeSend` removing authorization headers, card tokens, and email bodies.
- **Step 012.3:** Configure release tagging matching Git commit SHA and environment (development, staging, production).
- **Step 012.4:** Set up sample rates: 1.0 for errors, 0.1 for performance transactions to maintain light runtime overhead.

**Primary Files & Required Path Comments:**
- `// path: sentry.client.config.ts`
- `// path: sentry.server.config.ts`
- `// path: sentry.edge.config.ts`

**Verification & Quality Gate:**  
Trigger test exception; verify Sentry receives event with correlationId and verified zero sensitive PII in breadcrumbs.

---

### Step 013: Cloudflare Turnstile Anti-Bot Verification Engine
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Build invisible Cloudflare Turnstile CAPTCHA integration protecting public signup, login, password reset, and contact forms.  

**Technical Architecture & Specification:**  
Implement privacy-preserving bot detection using Cloudflare Turnstile. Create reusable client component and server verification helper verifying tokens against Cloudflare API with client IP validation and fail-closed logic.

**Granular Sub-Steps:**
- **Step 013.1:** Create `components/security/TurnstileWidget.tsx` client component handling token acquisition and refresh.
- **Step 013.2:** Implement `verifyTurnstileToken(token, clientIp)` in `lib/security/turnstile.ts` with timeout and retry.
- **Step 013.3:** Create server action/route middleware rejecting requests missing valid Turnstile verification.
- **Step 013.4:** Add mock Turnstile bypass strictly in local development/test mode with explicit environment flag.

**Primary Files & Required Path Comments:**
- `// path: components/security/TurnstileWidget.tsx`
- `// path: lib/security/turnstile.ts`
- `// path: tests/security/turnstile.test.ts`

**Verification & Quality Gate:**  
Test public signup endpoint; verify missing/invalid Turnstile token is rejected with HTTP 403 Forbidden.

---

### Step 014: Light Runtime Deployment Configuration for Vercel and Netlify
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Configure deployment manifests for Vercel and Netlify ensuring identical runtime behavior, security headers, and light edge compute load.  

**Technical Architecture & Specification:**  
Set up dual deployment configurations (`vercel.json` and `netlify.toml`). Enforce strict Content Security Policy (CSP), HSTS, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy. Offload heavy PDF/email rendering to background workers.

**Granular Sub-Steps:**
- **Step 014.1:** Create `vercel.json` with memory limits, function regions (Singapore/Tokyo for Asian latency), and security headers.
- **Step 014.2:** Create `netlify.toml` with build settings, headers, redirects, and environment variable bindings.
- **Step 014.3:** Implement Content Security Policy (CSP) header generator in `middleware.ts` supporting Collect.js and Stripe iframes.
- **Step 014.4:** Configure bundle analyzer and build budgets to guarantee serverless cold starts remain under 500ms.

**Primary Files & Required Path Comments:**
- `// path: vercel.json`
- `// path: netlify.toml`
- `// path: middleware.ts`

**Verification & Quality Gate:**  
Inspect HTTP response headers on preview server; verify CSP, HSTS, and X-Frame-Options: DENY are present and valid.

---

### Step 015: First-Line Path Comment Linter & Automated Tooling Pipeline
**Phase:** Phase 1: Project Setup, Tooling & Platform Architecture  
**Objective:** Establish automated linter enforcing repository standard requiring `// path: relative/path/to/file` on line 1 of every file.  

**Technical Architecture & Specification:**  
Create a custom linter and pre-commit hook that verifies every source file (.ts, .tsx, .js, .sql, .md, .css) begins with an accurate relative path comment. Ensure full compliance with KD Solution IT documentation standards.

**Granular Sub-Steps:**
- **Step 015.1:** Create Node.js script `scripts/lint-path-comments.ts` scanning repository files for correct line 1 path comments.
- **Step 015.2:** Implement auto-fix mode (`--fix`) to automatically insert or update path comments based on file path.
- **Step 015.3:** Configure Husky pre-commit hook and npm script `npm run lint:paths`.
- **Step 015.4:** Add GitHub Actions CI check step verifying 100% path comment coverage.

**Primary Files & Required Path Comments:**
- `// path: scripts/lint-path-comments.ts`
- `// path: .husky/pre-commit`
- `// path: package.json`

**Verification & Quality Gate:**  
Run `npm run lint:paths`; verify all repository files pass with zero path mismatch errors.

---

## Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines

### Step 016: Supabase PostgreSQL Setup & Connection Pool Configuration
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Configure Supabase PostgreSQL database connection pooling using PgBouncer/Supabase pooler for transaction and session modes.  

**Technical Architecture & Specification:**  
Establish reliable, low-latency database connectivity supporting high-concurrency serverless execution. Configure transaction-mode pooling for standard mutations and session-mode pooling for prepared statements and listen/notify channels.

**Granular Sub-Steps:**
- **Step 016.1:** Create `lib/db/client.ts` initializing Supabase client and direct PostgreSQL connection pool via `postgres` or `pg`.
- **Step 016.2:** Configure connection limits, idle timeouts, and retry logic for serverless execution environments.
- **Step 016.3:** Implement database health check utility `checkDbHealth()` verifying connectivity and pool latency.
- **Step 016.4:** Add connection error interceptor logging telemetry and reporting pool exhaustion to Sentry.

**Primary Files & Required Path Comments:**
- `// path: lib/db/client.ts`
- `// path: lib/db/health.ts`
- `// path: tests/db/client.test.ts`

**Verification & Quality Gate:**  
Run health check query; verify response under 50ms and seamless reconnect on dropped connections.

---

### Step 017: PostgreSQL UUIDv7 Extension & Generator Functions
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Deploy time-ordered UUIDv7 generation function in PostgreSQL and TypeScript for high-performance B-tree index locality.  

**Technical Architecture & Specification:**  
Implement UUID version 7 as the mandatory primary key type for all database tables. Combine 48-bit UNIX millisecond timestamp with 74 bits of cryptographically strong randomness to ensure temporal clustering and zero B-tree fragmentation.

**Granular Sub-Steps:**
- **Step 017.1:** Create SQL migration `002_uuidv7_function.sql` defining PostgreSQL function `generate_uuid_v7()`.
- **Step 017.2:** Create TypeScript client library `lib/db/uuidv7.ts` generating identical UUIDv7 strings application-side.
- **Step 017.3:** Implement UUIDv7 extractor utility retrieving timestamp from any valid UUIDv7 identifier.
- **Step 017.4:** Add unit tests verifying monotonic ordering and collision resistance across 100,000 rapid iterations.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/002_uuidv7_function.sql`
- `// path: lib/db/uuidv7.ts`
- `// path: tests/db/uuidv7.test.ts`

**Verification & Quality Gate:**  
Generate 1,000 UUIDs and verify exact chronological sort order and compliance with RFC 9562.

---

### Step 018: Base Table Standard Columns & Timestamp Triggers Migration
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Establish mandatory base columns and automated updated_at timestamp triggers across all database tables.  

**Technical Architecture & Specification:**  
Per KD Solution IT architectural mandate, every table must contain: `id UUIDv7`, `company_id UUIDv7`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`, and `version INT`. Create reusable database functions and triggers.

**Granular Sub-Steps:**
- **Step 018.1:** Create SQL migration `003_base_columns_and_triggers.sql` defining reusable updated_at timestamp trigger function.
- **Step 018.2:** Create SQL helper function enforcing standard column constraints on table creation.
- **Step 018.3:** Define TypeScript `BaseEntity` interface and abstract repository base class reflecting standard columns.
- **Step 018.4:** Write database test verifying automatic update of `updated_at` on row mutation.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/003_base_columns_and_triggers.sql`
- `// path: types/entity.ts`
- `// path: lib/db/repository.ts`

**Verification & Quality Gate:**  
Mutate sample row; confirm `updated_at` updates automatically and `version` is properly initialized to 1.

---

### Step 019: Row Level Security (RLS) Default-Deny Policy Setup
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Enable Row Level Security on all PostgreSQL tables with an ironclad default-deny policy preventing cross-tenant data leaks.  

**Technical Architecture & Specification:**  
Activate PostgreSQL RLS (`ENABLE ROW LEVEL SECURITY`) and enforce default denial (`FORCE ROW LEVEL SECURITY`) across all existing and future tables. Require explicit policy grant rules for every query operation.

**Granular Sub-Steps:**
- **Step 019.1:** Create SQL migration `004_enable_rls_default_deny.sql` applying `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- **Step 019.2:** Apply `ALTER TABLE ... FORCE ROW LEVEL SECURITY` ensuring table owners and superusers cannot bypass policies by mistake.
- **Step 019.3:** Create automated database migration linter script verifying every new migration explicitly enables RLS.
- **Step 019.4:** Write integration test attempting unauthenticated query; verify zero rows returned (default deny).

**Primary Files & Required Path Comments:**
- `// path: db/migrations/004_enable_rls_default_deny.sql`
- `// path: scripts/lint-rls.ts`
- `// path: tests/db/rls.test.ts`

**Verification & Quality Gate:**  
Run query without tenant session headers; verify database returns empty result set or access denied.

---

### Step 020: PostgreSQL Tenant Session Variable Infrastructure
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Build session context injector setting `app.current_company_id` and `app.current_user_id` inside PostgreSQL transaction blocks.  

**Technical Architecture & Specification:**  
Implement parameterized session variable setter executing `SET LOCAL app.current_company_id = '...'` at the start of each transaction. Base all tenant-isolated RLS policies on `current_setting('app.current_company_id', true)`.

**Granular Sub-Steps:**
- **Step 020.1:** Create SQL helper functions `set_tenant_context(company_id, user_id)` and `clear_tenant_context()` in PostgreSQL.
- **Step 020.2:** Implement transactional database wrapper `withTenantContext(companyId, userId, fn)` in `lib/db/tenant.ts`.
- **Step 020.3:** Create global RLS policy template checking `company_id = current_setting('app.current_company_id')::uuid`.
- **Step 020.4:** Write tests verifying complete isolation between tenant A and tenant B inside identical connection pool connections.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/005_tenant_session_functions.sql`
- `// path: lib/db/tenant.ts`
- `// path: tests/db/tenant-isolation.test.ts`

**Verification & Quality Gate:**  
Execute concurrent queries for Company 1 and Company 2; verify neither can access rows belonging to the other.

---

### Step 021: Companies & Sub-Merchant Tenant Schema Migration
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Create core `companies` table modeling sub-merchant tenants with legal attributes, country controls, and risk tiers.  

**Technical Architecture & Specification:**  
Design and migrate the central tenant table storing sub-merchant identity: legal business name, trade name, business type, registration number, country of incorporation, operating address, MCC code, platform fee overrides, and risk tier (1, 2, or 3).

**Granular Sub-Steps:**
- **Step 021.1:** Create SQL migration `006_create_companies_table.sql` with full standard base columns and indexes.
- **Step 021.2:** Add fields: `legal_name`, `dba_name`, `country`, `mcc`, `risk_tier`, `status` (draft, under_review, active, suspended, closed).
- **Step 021.3:** Add financial settings fields: `custom_fee_percent`, `custom_hold_days`, `reserve_percent`, `reserve_hold_days`.
- **Step 021.4:** Create RLS policy permitting sub-merchants to view own company and office roles to view across tenants.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/006_create_companies_table.sql`
- `// path: types/company.ts`
- `// path: lib/db/companies.ts`

**Verification & Quality Gate:**  
Verify table schema, constraints, indexes, and successful RLS isolation on company record queries.

---

### Step 022: Users & Staff Identities Schema Migration
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Create `users` table supporting merchant owners and office staff with lockout counters, status, and security metadata.  

**Technical Architecture & Specification:**  
Establish the global user identities table storing email, password hash, phone hash, full legal name, failed login attempt counters, locked_until timestamp, 2FA secret reference, is_staff flag, and status (pending_verification, active, locked, suspended).

**Granular Sub-Steps:**
- **Step 022.1:** Create SQL migration `007_create_users_table.sql` with UUIDv7 primary keys and standard base columns.
- **Step 022.2:** Add indexes on `email` (lowercase unique), `phone_hash`, and `status`.
- **Step 022.3:** Include security columns: `failed_attempts INT DEFAULT 0`, `locked_until TIMESTAMPTZ`, `password_changed_at TIMESTAMPTZ`.
- **Step 022.4:** Implement RLS policies allowing users to read/update only their own identity record.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/007_create_users_table.sql`
- `// path: types/user.ts`
- `// path: lib/db/users.ts`

**Verification & Quality Gate:**  
Verify unique constraints on email, default zero failed attempts, and RLS enforcement.

---

### Step 023: Company Memberships & Multi-Tenant Linkage Schema
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Create `company_members` join table establishing role assignments, permissions, and tenant associations.  

**Technical Architecture & Specification:**  
Model the relationship between users and companies. Support single-owner sub-merchant accounts and office staff assignments with explicit roles (super_admin, ceo, compliance_kyc, finance_ops, support, blogger, owner).

**Granular Sub-Steps:**
- **Step 023.1:** Create SQL migration `008_create_company_members_table.sql` with foreign keys to users and companies.
- **Step 023.2:** Add columns: `user_id`, `company_id`, `role`, `status` (active, invited, revoked), `invited_at`, `accepted_at`.
- **Step 023.3:** Enforce unique constraint on `(user_id, company_id)` and one-owner-per-company business rule.
- **Step 023.4:** Write database helper querying all active memberships and permissions for an authenticated user.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/008_create_company_members_table.sql`
- `// path: types/membership.ts`
- `// path: lib/db/memberships.ts`

**Verification & Quality Gate:**  
Insert membership record; verify foreign key constraints and query membership by user ID.

---

### Step 024: Hash-Chained Append-Only Audit Log Schema Migration
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Design and migrate the cryptographic hash-chained audit log table capturing every mutation across the platform.  

**Technical Architecture & Specification:**  
Construct an append-only audit log table where each entry computes a SHA-256 hash chaining back to the previous entry's hash (`prev_hash`). Record sequence_id, company_id, actor_id, action, entity_type, entity_id, diff_payload, IP address, user agent, and cryptographic signature.

**Granular Sub-Steps:**
- **Step 024.1:** Create SQL migration `009_create_audit_logs_table.sql` with BIGSERIAL sequence_id and UUIDv7 primary key.
- **Step 024.2:** Add columns: `prev_hash VARCHAR(64)`, `current_hash VARCHAR(64)`, `signature VARCHAR(128)`, `actor_id UUID`, `action VARCHAR(100)`, `payload JSONB`.
- **Step 024.3:** Add indexes on `company_id`, `action`, `entity_type`, `created_at`, and `sequence_id`.
- **Step 024.4:** Define TypeScript interfaces for structured audit log payloads and event categories.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/009_create_audit_logs_table.sql`
- `// path: types/audit.ts`
- `// path: lib/audit/types.ts`

**Verification & Quality Gate:**  
Verify table schema, indexing, and JSONB payload storage capability.

---

### Step 025: Audit Log Tamper-Proofing Database Rules & Triggers
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Install PostgreSQL rules and triggers strictly forbidding UPDATE, DELETE, and TRUNCATE operations on `audit_logs`.  

**Technical Architecture & Specification:**  
Ensure physical immutability of audit records at the database engine level. Create PostgreSQL rules raising fatal exceptions on any attempt to modify or truncate the audit log, preventing even malicious database administrators from tampering with history.

**Granular Sub-Steps:**
- **Step 025.1:** Create SQL migration `010_audit_log_tamper_protection.sql` installing `BEFORE UPDATE` trigger raising exception.
- **Step 025.2:** Install `BEFORE DELETE` trigger raising exception on any deletion attempt.
- **Step 025.3:** Revoke TRUNCATE privileges on `audit_logs` table from all application and migration roles.
- **Step 025.4:** Write database integration test attempting UPDATE and DELETE; verify PostgreSQL raises fatal constraint error.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/010_audit_log_tamper_protection.sql`
- `// path: tests/db/audit-tamper.test.ts`

**Verification & Quality Gate:**  
Execute `DELETE FROM audit_logs`; verify operation fails with error `Audit logs are strictly append-only`.

---

### Step 026: Ed25519 Cryptographic Audit Log Signing Engine
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Implement an Ed25519 asymmetric signing utility signing each audit log entry hash with platform private key.  

**Technical Architecture & Specification:**  
Enhance audit log non-repudiation by signing each audit entry's SHA-256 hash using an Ed25519 private key stored in environment variables. Store the base64-encoded signature on the row to guarantee provenance and integrity.

**Granular Sub-Steps:**
- **Step 026.1:** Implement `signAuditEntry(entryHash)` using Node.js `crypto.sign` with Ed25519 algorithm in `lib/security/audit-signer.ts`.
- **Step 026.2:** Implement `verifyAuditSignature(entryHash, signature, publicKey)` verification utility.
- **Step 026.3:** Create automated audit entry factory computing `current_hash = SHA256(prev_hash + sequence + payload)` and generating signature.
- **Step 026.4:** Write unit test verifying signature generation and rejection of tampered payload.

**Primary Files & Required Path Comments:**
- `// path: lib/security/audit-signer.ts`
- `// path: lib/audit/signer.ts`
- `// path: tests/audit/signer.test.ts`

**Verification & Quality Gate:**  
Sign test audit payload; modify payload by 1 character and verify `verifyAuditSignature` returns false.

---

### Step 027: Merkle Tree Audit Batch Aggregation Engine
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Build Merkle tree aggregation engine grouping daily audit logs into cryptographic Merkle roots for external anchoring.  

**Technical Architecture & Specification:**  
Construct binary Merkle tree engine taking daily batch of audit log hashes as leaves, recursively hashing pairs using SHA-256, and calculating a single 32-byte Merkle root. Enable cryptographic proof-of-inclusion generation for any single log entry.

**Granular Sub-Steps:**
- **Step 027.1:** Create `lib/security/merkle.ts` implementing `calculateMerkleRoot(leaves)` and `generateProof(leaves, index)`.
- **Step 027.2:** Implement `verifyMerkleProof(root, leaf, proof)` verification algorithm.
- **Step 027.3:** Create `audit_merkle_roots` table storing `batch_date`, `merkle_root`, `entry_count`, `first_sequence_id`, `last_sequence_id`.
- **Step 027.4:** Write unit tests validating Merkle proof generation and verification across varying leaf counts (odd, even, single).

**Primary Files & Required Path Comments:**
- `// path: lib/security/merkle.ts`
- `// path: db/migrations/011_audit_merkle_roots.sql`
- `// path: tests/security/merkle.test.ts`

**Verification & Quality Gate:**  
Generate Merkle tree for 1,000 sample audit logs; verify valid proof accepts and altered leaf rejects.

---

### Step 028: Audit Log Merkle Root Export & Cryptographic Verification API
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Build secure API and verification endpoint allowing compliance auditors to export and verify Merkle roots and audit proofs.  

**Technical Architecture & Specification:**  
Expose authenticated office endpoints and public verification endpoint (`GET /api/compliance/audit/verify`) allowing independent verification of audit chain continuity, Ed25519 signatures, and Merkle root anchoring without disclosing underlying tenant PII.

**Granular Sub-Steps:**
- **Step 028.1:** Create `app/api/compliance/audit/export/route.ts` exporting Merkle roots and signed batch manifests.
- **Step 028.2:** Create `app/api/compliance/audit/verify/route.ts` validating individual audit entry proof against published Merkle root.
- **Step 028.3:** Implement CLI verification tool `scripts/verify-audit-chain.ts` scanning entire database table for hash chain breaks.
- **Step 028.4:** Add audit log export permissions guard restricting detailed exports to compliance_kyc and super_admin roles.

**Primary Files & Required Path Comments:**
- `// path: app/api/compliance/audit/export/route.ts`
- `// path: app/api/compliance/audit/verify/route.ts`
- `// path: scripts/verify-audit-chain.ts`

**Verification & Quality Gate:**  
Run `scripts/verify-audit-chain.ts` against seeded database; verify 100% hash chain continuity.

---

### Step 029: Database Migration Runner & Forward/Rollback Testing Harness
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Build automated database migration runner verifying both forward migration and backward rollback on staging before deployment.  

**Technical Architecture & Specification:**  
Per KD Solution IT release rules, every schema change requires a clean forward migration and an idempotent rollback script tested in sequence. Implement runner script executing up/down cycles and verifying database state cleanliness.

**Granular Sub-Steps:**
- **Step 029.1:** Create migration runner `scripts/migrate.ts` supporting `--up`, `--down`, and `--test-cycle` flags.
- **Step 029.2:** Maintain `_schema_migrations` tracking table recording migration name, checksum, applied_at, and execution_time_ms.
- **Step 029.3:** Pair every `.up.sql` migration with a matching `.down.sql` rollback migration.
- **Step 029.4:** Configure CI test running full forward migration from scratch followed by full rollback to ensure zero orphaned objects.

**Primary Files & Required Path Comments:**
- `// path: scripts/migrate.ts`
- `// path: db/migrations/README.md`
- `// path: tests/db/migration-cycle.test.ts`

**Verification & Quality Gate:**  
Execute `npm run migrate:test-cycle`; verify all migrations run up and down cleanly with exit code 0.

---

### Step 030: Database Seed Engine & Super Admin Initial Provisioning Script
**Phase:** Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines  
**Objective:** Create idempotent seed runner generating system parameters, country controls, default policies, and initial super_admin credentials.  

**Technical Architecture & Specification:**  
Develop seed script initializing essential platform parameters. Provision the first super_admin account with mandatory 2FA setup flag, default system company tenant, global country availability flags, and baseline risk tier configurations.

**Granular Sub-Steps:**
- **Step 030.1:** Create `db/seeds/index.ts` orchestrating seed execution in proper foreign key order.
- **Step 030.2:** Implement `seedCountries()` loading ISO 3166-1 country catalog with sanctioned countries disabled by default.
- **Step 030.3:** Implement `seedSuperAdmin()` creating system super_admin from environment variables with temporary password requiring reset.
- **Step 030.4:** Add seed audit logging recording initial provisioning in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: db/seeds/index.ts`
- `// path: db/seeds/countries.ts`
- `// path: db/seeds/super-admin.ts`

**Verification & Quality Gate:**  
Run `npm run db:seed`; verify super_admin user created, countries catalog populated, and audit log records created.

---

## Phase 3: Cryptography, Key Management & Secure Storage Layer

### Step 031: CEO Master Key Custodianship & Environment Secrets Protocol
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Establish CEO cryptographic master key custodianship protocol, key derivation framework, and environment variable guards.  

**Technical Architecture & Specification:**  
Implement platform key custody architecture where the CEO is the designated custodian of the master encryption key (`MASTER_ENCRYPTION_KEY`). Ensure key material resides strictly in server environment variables and is never persisted in plaintext.

**Granular Sub-Steps:**
- **Step 031.1:** Create `lib/crypto/keys.ts` with HKDF (HMAC-based Key Derivation Function) deriving domain-specific subkeys for gateways, files, and PII.
- **Step 031.2:** Implement key validity and entropy verification checking key length (minimum 256 bits) on startup.
- **Step 031.3:** Create secure memory-scrubbing buffer wrapper clearing key material after cryptographic operations where possible.
- **Step 031.4:** Document key custody and emergency recovery protocol in `docs/security/KEY_CUSTODIANSHIP.md`.

**Primary Files & Required Path Comments:**
- `// path: lib/crypto/keys.ts`
- `// path: docs/security/KEY_CUSTODIANSHIP.md`
- `// path: tests/crypto/keys.test.ts`

**Verification & Quality Gate:**  
Verify subkey derivation produces stable, cryptographically isolated keys for distinct domains and fails if master key is invalid.

---

### Step 032: AES-256-GCM Envelope Encryption & Decryption Engine
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build authenticated symmetric encryption engine using AES-256-GCM with unique 96-bit IVs and authentication tags.  

**Technical Architecture & Specification:**  
Construct high-performance encryption utilities in `lib/crypto/aes.ts`. Encrypt sensitive secrets (gateway API keys, webhook secrets, TaxCloud credentials, email secrets, stored card tokens) using AES-256-GCM, producing ciphertext containing IV, auth tag, and payload.

**Granular Sub-Steps:**
- **Step 032.1:** Implement `encryptAesGcm(plaintext, key)` generating unique 12-byte IV and returning serialized `iv:authTag:ciphertext`.
- **Step 032.2:** Implement `decryptAesGcm(encryptedPayload, key)` verifying 16-byte authentication tag before returning plaintext.
- **Step 032.3:** Enforce strict error handling throwing DecryptionError without leaking plaintext or key details on auth tag mismatch.
- **Step 032.4:** Write unit test verifying round-trip encryption/decryption and detection of single-bit ciphertext tampering.

**Primary Files & Required Path Comments:**
- `// path: lib/crypto/aes.ts`
- `// path: tests/crypto/aes.test.ts`

**Verification & Quality Gate:**  
Encrypt string, modify 1 byte of ciphertext or auth tag; verify decryption immediately throws authentication error.

---

### Step 033: Masked Display & Sensitive Value Formatting Utility
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build universal masking utility displaying only last 4 characters and last updated timestamp for all secrets.  

**Technical Architecture & Specification:**  
Enforce platform security rule: after initial saving, a secret or gateway key is never shown again in full. Create masking utilities displaying strings like `••••••••••••••••3a9f` and recording `updated_at` time for admin verification.

**Granular Sub-Steps:**
- **Step 033.1:** Create `lib/crypto/mask.ts` implementing `maskSecret(value, visibleSuffixLength = 4)`.
- **Step 033.2:** Implement card number mask `maskCardNumber(last4, brand)` and bank account mask `maskBankAccount(last4)`.
- **Step 033.3:** Create React UI component `<MaskedSecretDisplay value={maskedValue} lastUpdated={timestamp} />`.
- **Step 033.4:** Add unit tests verifying input strings shorter than visible suffix length are safely redacted without leaks.

**Primary Files & Required Path Comments:**
- `// path: lib/crypto/mask.ts`
- `// path: components/security/MaskedSecretDisplay.tsx`
- `// path: tests/crypto/mask.test.ts`

**Verification & Quality Gate:**  
Pass API key `sk_live_9876543210abcdef` to maskSecret; verify output is `••••••••••••cdef` and never reveals prefix or body.

---

### Step 034: Automated Key Rotation Pipeline for Stored Credentials
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Implement credential rotation procedure allowing re-encryption of gateway keys and credentials under a new master key.  

**Technical Architecture & Specification:**  
Build rotation utility in `lib/crypto/rotate.ts` supporting key rollover. Allow adding a new key version, testing active connection, re-encrypting all database records with new key, and removing old key version with full audit logging.

**Granular Sub-Steps:**
- **Step 034.1:** Design encrypted payload envelope supporting key version header (`v1:iv:tag:cipher`, `v2:iv:tag:cipher`).
- **Step 034.2:** Implement batch re-encryption script scanning encrypted columns and updating to latest key version in transaction.
- **Step 034.3:** Integrate pre-rotation connection test ensuring new keys are valid before committing database updates.
- **Step 034.4:** Record key rotation event in `audit_logs` including actor ID, key version transition, and affected record count.

**Primary Files & Required Path Comments:**
- `// path: lib/crypto/rotate.ts`
- `// path: scripts/rotate-keys.ts`
- `// path: tests/crypto/rotate.test.ts`

**Verification & Quality Gate:**  
Execute test rotation from Key V1 to Key V2 on sample gateway credentials; verify clean decryption under V2 and audit log entry.

---

### Step 035: PII HMAC-SHA256 Blind Indexing & Document Hashing Utilities
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build blind indexing utilities hashing identity document numbers, tax IDs, and bank account fingerprints for duplicate detection.  

**Technical Architecture & Specification:**  
Enable duplicate detection without storing or querying plaintext PII. Implement HMAC-SHA256 blind indexing with a dedicated secret key to generate deterministic fingerprints for passport numbers, national IDs, tax numbers, and bank account details.

**Granular Sub-Steps:**
- **Step 035.1:** Create `lib/crypto/hash.ts` implementing `generateBlindIndex(normalizedValue, domainKey)` using HMAC-SHA256.
- **Step 035.2:** Implement normalization helpers stripping spaces, hyphens, and converting to uppercase before hashing.
- **Step 035.3:** Implement bank account fingerprinting combining routing/SWIFT code and normalized account number.
- **Step 035.4:** Add unit tests verifying identical values produce matching blind hashes and different values produce distinct hashes.

**Primary Files & Required Path Comments:**
- `// path: lib/crypto/hash.ts`
- `// path: tests/crypto/hash.test.ts`

**Verification & Quality Gate:**  
Hash various formatted SSNs and passports; verify identical normalized IDs produce identical blind index hashes.

---

### Step 036: Unified Object Storage Adapter Interface Specification
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Define standard TypeScript interface for cloud storage adapters with tenant-separated paths and signed URL capabilities.  

**Technical Architecture & Specification:**  
Specify the contract in `lib/storage/types.ts` for cloud object storage. Ensure identical API signatures across Supabase Storage and Amazon S3, supporting encrypted upload, stream download, signed URL generation, and deletion.

**Granular Sub-Steps:**
- **Step 036.1:** Define `StorageAdapter` interface with methods: `uploadFile`, `getSignedUrl`, `deleteFile`, and `checkHealth`.
- **Step 036.2:** Define `StorageUploadOptions` with `companyId`, `category` (kyc, invoices, disputes, logos), and `encryption` options.
- **Step 036.3:** Define strict path conventions: `companies/{companyId}/{category}/{fileId}_{filename}` to guarantee tenant isolation.
- **Step 036.4:** Create mock storage adapter implementation for local testing and CI pipelines.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/types.ts`
- `// path: lib/storage/mock.ts`

**Verification & Quality Gate:**  
Verify TypeScript compiles mock adapter fulfilling all interface methods without type errors.

---

### Step 037: Supabase Storage Adapter Implementation
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build production Supabase Storage adapter fulfilling `StorageAdapter` interface with tenant path segregation.  

**Technical Architecture & Specification:**  
Implement Supabase Storage client in `lib/storage/supabase.ts` using `@supabase/supabase-js`. Support private bucket operations, pre-encrypted stream uploads, short-lived signed URLs, and file deletion.

**Granular Sub-Steps:**
- **Step 037.1:** Implement `SupabaseStorageAdapter` class connecting to Supabase private storage bucket.
- **Step 037.2:** Implement `uploadFile` handling buffer/stream uploads with tenant-isolated path generation.
- **Step 037.3:** Implement `getSignedUrl` generating signed download URLs with configurable expiration (default 15 minutes).
- **Step 037.4:** Add error handling mapping Supabase storage errors to standard `StorageError` classes.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/supabase.ts`
- `// path: tests/storage/supabase.test.ts`

**Verification & Quality Gate:**  
Upload sample test file via Supabase adapter; verify file resides in private bucket and signed URL downloads successfully.

---

### Step 038: Amazon S3 Storage Adapter Implementation
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build Amazon S3 storage adapter fulfilling `StorageAdapter` interface using AWS SDK v3 with signed URL generation.  

**Technical Architecture & Specification:**  
Implement Amazon S3 client in `lib/storage/s3.ts` using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Support private bucket uploads, multipart large file uploads, server-side encryption headers, and presigned GET URLs.

**Granular Sub-Steps:**
- **Step 038.1:** Implement `S3StorageAdapter` class initializing S3Client with credentials from environment variables.
- **Step 038.2:** Implement `uploadFile` using PutObjectCommand with ContentType and tenant-isolated S3 key path.
- **Step 038.3:** Implement `getSignedUrl` using `getSignedUrl` helper with GetObjectCommand and 15-minute expiration.
- **Step 038.4:** Implement `deleteFile` using DeleteObjectCommand and verify idempotency.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/s3.ts`
- `// path: tests/storage/s3.test.ts`

**Verification & Quality Gate:**  
Upload file using S3 adapter; verify presigned URL retrieves file and expires after configured interval.

---

### Step 039: Zero-Core-Rewrite Storage Provider Factory
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Implement dynamic storage provider factory selecting active adapter via `STORAGE_PROVIDER` environment variable.  

**Technical Architecture & Specification:**  
Create storage provider factory in `lib/storage/index.ts`. Switch seamlessly between Supabase Storage and Amazon S3 based on configuration (`STORAGE_PROVIDER=supabase` vs `STORAGE_PROVIDER=s3`), enabling deployment on Vercel, Netlify, or AWS without changing application code.

**Granular Sub-Steps:**
- **Step 039.1:** Create `getStorageAdapter()` singleton factory resolving active adapter from environment.
- **Step 039.2:** Validate storage credentials for selected provider on startup and fail immediately if misconfigured.
- **Step 039.3:** Enforce ban on server-local disk storage (`/tmp` or local filesystem) across all deployment targets.
- **Step 039.4:** Add unit test verifying factory instantiates correct adapter class based on environment flag.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/index.ts`
- `// path: tests/storage/factory.test.ts`

**Verification & Quality Gate:**  
Toggle `STORAGE_PROVIDER` between 'supabase' and 's3'; verify factory loads correct adapter without code changes.

---

### Step 040: File Upload Validation, Magic Byte Sniffing & Size Guards
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build strict file upload validator checking file size limits, MIME types, and verifying true file types via magic bytes.  

**Technical Architecture & Specification:**  
Prevent malicious file uploads (executables, PHP scripts, SVGs with embedded scripts) by inspecting actual file binary headers (magic bytes) using `file-type`. Enforce strict size limits (10MB for KYC docs, 2MB for logos, 20MB for dispute packs).

**Granular Sub-Steps:**
- **Step 040.1:** Create `lib/storage/validator.ts` inspecting buffer magic bytes with `file-type` library.
- **Step 040.2:** Define strict allowed MIME types per category: KYC (PDF, PNG, JPEG), Logos (PNG, JPEG, WEBP), Disputes (PDF, ZIP, PNG, JPEG).
- **Step 040.3:** Validate file size against configured category limits and reject oversized uploads with HTTP 413.
- **Step 040.4:** Add unit tests verifying rejection of renamed `.exe` files disguised as `.pdf` or `.jpg`.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/validator.ts`
- `// path: tests/storage/validator.test.ts`

**Verification & Quality Gate:**  
Attempt upload of fake PDF containing executable binary header; verify validator rejects upload with HTTP 422.

---

### Step 041: Pre-Upload File Encryption Pipeline (AES-256-GCM)
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build client/server pre-upload encryption pipeline encrypting all file payloads with AES-256-GCM before object storage transfer.  

**Technical Architecture & Specification:**  
Per KD Solution IT security policy, every uploaded file (KYC identity documents, trade licenses, utility bills, dispute evidence) must be AES-256-GCM encrypted prior to transmission to cloud storage. Ensure zero unencrypted files exist in cloud buckets.

**Granular Sub-Steps:**
- **Step 041.1:** Implement `encryptFileBuffer(fileBuffer, companyKey)` producing encrypted binary stream and metadata header.
- **Step 041.2:** Implement `decryptFileBuffer(encryptedBuffer, companyKey)` decrypting on retrieval during authorized access.
- **Step 041.3:** Compute SHA-256 integrity hash of original unencrypted file for tamper detection and audit logs.
- **Step 041.4:** Write tests verifying round-trip file buffer encryption/decryption preserving byte-for-byte fidelity.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/file-encryption.ts`
- `// path: tests/storage/file-encryption.test.ts`

**Verification & Quality Gate:**  
Upload sample PDF; download raw object from cloud storage bucket and verify it is completely unreadable ciphertext.

---

### Step 042: File Metadata Schema & Company Isolation Migration
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Create `files` metadata table tracking storage provider, file hash, size, MIME type, company_id, and encryption parameters.  

**Technical Architecture & Specification:**  
Migrate database table `files` cataloging all uploaded assets with standard UUIDv7 primary keys, `company_id`, `storage_provider`, `storage_path`, `file_hash`, `size_bytes`, `mime_type`, `category`, and strict RLS tenant isolation policies.

**Granular Sub-Steps:**
- **Step 042.1:** Create SQL migration `012_create_files_table.sql` with foreign key to companies and standard base columns.
- **Step 042.2:** Add columns: `storage_provider VARCHAR(20)`, `storage_path TEXT`, `file_hash VARCHAR(64)`, `size_bytes BIGINT`, `mime_type VARCHAR(100)`.
- **Step 042.3:** Install RLS policies preventing sub-merchants from accessing files belonging to other companies.
- **Step 042.4:** Create database access helpers in `lib/db/files.ts`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/012_create_files_table.sql`
- `// path: types/file.ts`
- `// path: lib/db/files.ts`

**Verification & Quality Gate:**  
Verify table structure, constraints, and verify tenant A cannot query file metadata belonging to tenant B.

---

### Step 043: Short-Lived Signed Download URL Generator & Access Logger
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build secure file download handler issuing 15-minute signed URLs with mandatory audit log tracking on every access.  

**Technical Architecture & Specification:**  
Implement file download endpoint (`GET /api/files/[id]/download`). Verify requester role and tenant membership, generate a 15-minute expiring signed URL, decrypt on the fly if needed, and write an immutable entry into `audit_logs`.

**Granular Sub-Steps:**
- **Step 043.1:** Implement `generateSecureDownloadUrl(fileId, userId)` in `lib/storage/signed-url.ts`.
- **Step 043.2:** Enforce tenant and role check: verify user owns file or holds compliance_kyc / super_admin role.
- **Step 043.3:** Record `FILE_ACCESSED` event in `audit_logs` capturing fileId, actorId, ipAddress, and timestamp.
- **Step 043.4:** Add unit tests verifying expired signed URLs cannot be reused after 15 minutes.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/signed-url.ts`
- `// path: app/api/files/[id]/download/route.ts`
- `// path: tests/storage/download.test.ts`

**Verification & Quality Gate:**  
Request download URL for sensitive KYC doc; verify signed URL generated and audit log entry created.

---

### Step 044: Secure File Deletion, Crypto-Shredding & Retention Pipeline
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Implement secure deletion and crypto-shredding engine complying with 7-year regulatory retention mandates.  

**Technical Architecture & Specification:**  
Construct file lifecycle management engine in `lib/storage/retention.ts`. Enforce 7-year retention for KYC, transaction, and dispute documents. For expired or legally deleted files, delete object from storage and crypto-shred metadata and encryption keys.

**Granular Sub-Steps:**
- **Step 044.1:** Create `softDeleteFile(fileId, actorId)` marking `deleted_at` timestamp without immediate physical removal.
- **Step 044.2:** Implement regulatory retention checker blocking deletion of records younger than 7 years.
- **Step 044.3:** Implement `cryptoShredFile(fileId)` destroying document key material and overwriting metadata on approved disposal.
- **Step 044.4:** Write tests verifying retention guard prevents deletion of active merchant KYC documents.

**Primary Files & Required Path Comments:**
- `// path: lib/storage/retention.ts`
- `// path: tests/storage/retention.test.ts`

**Verification & Quality Gate:**  
Attempt deletion of 1-year-old KYC file; verify system rejects deletion due to 7-year retention rule.

---

### Step 045: Storage Integrity Scanner & Health Checker Utility
**Phase:** Phase 3: Cryptography, Key Management & Secure Storage Layer  
**Objective:** Build automated integrity scanner verifying cloud storage objects match database checksums and detecting bit rot.  

**Technical Architecture & Specification:**  
Create automated maintenance scanner in `scripts/check-storage.ts`. Compute SHA-256 hashes of stored files, compare against database `file_hash`, and alert office team immediately on missing objects or checksum mismatches.

**Granular Sub-Steps:**
- **Step 045.1:** Implement batch scanner iterating file metadata records and verifying cloud object existence.
- **Step 045.2:** Download and calculate checksums for sampled records, asserting equality with database `file_hash`.
- **Step 045.3:** Generate health report detailing total stored gigabytes, missing objects, and verification status.
- **Step 045.4:** Configure automated weekly scheduled job triggering storage integrity scan.

**Primary Files & Required Path Comments:**
- `// path: scripts/check-storage.ts`
- `// path: lib/storage/health.ts`

**Verification & Quality Gate:**  
Run `npm run storage:check`; verify scanner processes all records and outputs clean verification report.

---

## Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile

### Step 046: Merchant & Staff Registration Endpoint with Turnstile Guard
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build merchant registration API protected by Cloudflare Turnstile, email normalization, and rate limiting.  

**Technical Architecture & Specification:**  
Create `POST /api/auth/register` validating incoming merchant signup data. Enforce Turnstile bot verification, normalize email (lowercase, trim), check password breach database, create user record, and dispatch verification email.

**Granular Sub-Steps:**
- **Step 046.1:** Define registration Zod schema in `lib/validation/auth.ts` requiring email, password, full legal name, and Turnstile token.
- **Step 046.2:** Implement route handler `app/api/auth/register/route.ts` validating Turnstile token via `verifyTurnstileToken`.
- **Step 046.3:** Enforce strict IP rate limiting (maximum 5 registration attempts per hour per IP) via Upstash/memory store.
- **Step 046.4:** Write integration test verifying successful registration and rejection of invalid Turnstile tokens.

**Primary Files & Required Path Comments:**
- `// path: app/api/auth/register/route.ts`
- `// path: lib/validation/auth.ts`
- `// path: tests/auth/register.test.ts`

**Verification & Quality Gate:**  
Submit registration with valid Turnstile token; verify user created with status `pending_verification`.

---

### Step 047: Argon2id Password Hashing & HaveIBeenPwned Breach Checker
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Implement Argon2id password hashing and HaveIBeenPwned k-Anonymity API breach detection.  

**Technical Architecture & Specification:**  
Enforce high-strength password policy (minimum 12 characters, uppercase, lowercase, numbers, symbols, zxcvbn score >= 3). Hash passwords using Argon2id. Check candidate passwords against HaveIBeenPwned API using SHA-1 k-Anonymity to reject breached credentials.

**Granular Sub-Steps:**
- **Step 047.1:** Implement `hashPassword(password)` and `verifyPassword(password, hash)` using `argon2` (Argon2id profile).
- **Step 047.2:** Implement `checkBreachedPassword(password)` in `lib/auth/pwned.ts` querying HIBP k-Anonymity range API.
- **Step 047.3:** Integrate zxcvbn complexity scoring requiring minimum score of 3 for merchant/staff passwords.
- **Step 047.4:** Add unit tests verifying rejection of common breached passwords (e.g. 'P@ssword1234!').

**Primary Files & Required Path Comments:**
- `// path: lib/auth/password.ts`
- `// path: lib/auth/pwned.ts`
- `// path: tests/auth/password.test.ts`

**Verification & Quality Gate:**  
Attempt registration with known breached password; verify system rejects with error `Password has been compromised in public breaches`.

---

### Step 048: Cryptographic Email Verification Token Engine
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build secure email verification engine using high-entropy random tokens with 24-hour expiration.  

**Technical Architecture & Specification:**  
Create email verification system in `lib/auth/email-verify.ts`. Generate cryptographically secure 256-bit random tokens, store SHA-256 token hash in `email_verification_tokens` table, and send verification link. Verify tokens and activate account upon consumption.

**Granular Sub-Steps:**
- **Step 048.1:** Create SQL migration `013_create_email_verification_tokens.sql` storing `user_id`, `token_hash`, `expires_at`, `used_at`.
- **Step 048.2:** Implement `generateEmailVerificationToken(userId)` returning one-time URL token.
- **Step 048.3:** Create route `GET /api/auth/verify-email?token=...` verifying token hash, activating user, and marking token used.
- **Step 048.4:** Add unit tests verifying expired or previously used tokens cannot activate an account.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/013_create_email_verification_tokens.sql`
- `// path: lib/auth/email-verify.ts`
- `// path: app/api/auth/verify-email/route.ts`

**Verification & Quality Gate:**  
Generate token, visit verification endpoint; confirm user status transitions to `active`.

---

### Step 049: Anti-Enumeration Login API with Strict Rate Limiting
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build secure login endpoint with anti-account-enumeration defenses and IP/account rate limits.  

**Technical Architecture & Specification:**  
Implement `POST /api/auth/login`. Defend against account enumeration attacks: return identical generic error messages (`Invalid credentials`) and run dummy password hash comparisons when an email does not exist to ensure constant-time response latency.

**Granular Sub-Steps:**
- **Step 049.1:** Create login handler in `app/api/auth/login/route.ts` validating Turnstile token and credentials.
- **Step 049.2:** Implement constant-time authentication flow executing dummy Argon2id verification if user record not found.
- **Step 049.3:** Enforce IP rate limit (maximum 10 attempts per minute per IP) and audit log all failed attempts.
- **Step 049.4:** Write tests measuring timing differences between existing and non-existing email logins to ensure <20ms variance.

**Primary Files & Required Path Comments:**
- `// path: app/api/auth/login/route.ts`
- `// path: lib/auth/login.ts`
- `// path: tests/auth/login-timing.test.ts`

**Verification & Quality Gate:**  
Test login with valid vs non-existent email; verify identical error message and indistinguishable response duration.

---

### Step 050: Persistent 2-Hour Account Lockout on 2 Consecutive Failed Attempts
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Implement database-persisted account lockout locking accounts for 2 hours after exactly 2 consecutive failed attempts.  

**Technical Architecture & Specification:**  
Enforce KD Solution IT authentication rule: 2 consecutive failed password or 2FA attempts immediately lock the account for 2 hours. Store failed counter and `locked_until` in the database so locks survive server restarts. Block password resets during active lock.

**Granular Sub-Steps:**
- **Step 050.1:** Implement `recordFailedLoginAttempt(userId)` incrementing `failed_attempts` in `users` table.
- **Step 050.2:** If `failed_attempts >= 2`, set `locked_until = NOW() + INTERVAL '2 hours'` and dispatch lockout security email.
- **Step 050.3:** Enforce lockout guard: reject authentication attempts while `locked_until > NOW()` even with correct password.
- **Step 050.4:** Block password reset initiation and forbid clearing lock by changing password while locked.

**Primary Files & Required Path Comments:**
- `// path: lib/auth/lockout.ts`
- `// path: tests/auth/lockout.test.ts`

**Verification & Quality Gate:**  
Enter 2 incorrect passwords; verify account locks for 2 hours, correct password is rejected, and lockout email is dispatched.

---

### Step 051: Office Unlock Workflow with Mandatory Email Verification
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build administrative unlock workflow requiring office authorization and confirmed email contact with account owner.  

**Technical Architecture & Specification:**  
Implement office account unlock mechanism in `lib/office/unlock.ts`. Allow authorized staff (compliance_kyc or super_admin) to unlock a locked account only after confirming contact with the owner by email. Reset counter, clear lock, and audit log.

**Granular Sub-Steps:**
- **Step 051.1:** Create `POST /api/office/users/[id]/unlock` endpoint requiring step-up reauthentication from staff.
- **Step 051.2:** Require mandatory confirmation checkbox: 'I confirm direct contact with account owner has been verified'.
- **Step 051.3:** Reset `failed_attempts = 0` and `locked_until = NULL` in database transaction.
- **Step 051.4:** Write `USER_UNLOCKED_BY_OFFICE` entry to `audit_logs` capturing staff actorId, target userId, and reason.

**Primary Files & Required Path Comments:**
- `// path: app/api/office/users/[id]/unlock/route.ts`
- `// path: lib/office/unlock.ts`
- `// path: tests/office/unlock.test.ts`

**Verification & Quality Gate:**  
Unlock locked account from office dashboard; verify user can log in immediately and audit log records action.

---

### Step 052: Mandatory 2FA TOTP Enrollment & QR Code Generator
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Implement mandatory Time-based One-Time Password (TOTP) two-factor authentication for all account roles.  

**Technical Architecture & Specification:**  
Enforce mandatory 2FA enrollment across all users (merchants and staff). Generate standard RFC 6238 TOTP secrets, provide authenticator QR codes, verify enrollment code before activating 2FA, and encrypt TOTP secrets at rest using AES-256-GCM.

**Granular Sub-Steps:**
- **Step 052.1:** Install `otplib` and `qrcode` libraries in `lib/auth/totp.ts`.
- **Step 052.2:** Implement `generateTotpSecret(userId)` generating 20-byte base32 secret and encrypted storage.
- **Step 052.3:** Create `POST /api/auth/2fa/verify-enrollment` validating user's first 6-digit code before enabling 2FA.
- **Step 052.4:** Create middleware interceptor redirecting non-2FA-enrolled users to mandatory 2FA setup page on login.

**Primary Files & Required Path Comments:**
- `// path: lib/auth/totp.ts`
- `// path: app/api/auth/2fa/setup/route.ts`
- `// path: components/auth/TotpEnrollment.tsx`

**Verification & Quality Gate:**  
Enroll test user with Google Authenticator/Authy; verify valid 6-digit TOTP code completes setup.

---

### Step 053: Encrypted Backup Codes Generation & Single-Use Consumption
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build single-use backup recovery codes generator allowing merchants to access accounts if TOTP device is lost.  

**Technical Architecture & Specification:**  
Generate 10 cryptographically random 8-character alphanumeric backup codes during 2FA enrollment. Store argon2id/bcrypt hashes of backup codes in `user_backup_codes` table. Allow merchants to regenerate fresh codes in advance from security settings.

**Granular Sub-Steps:**
- **Step 053.1:** Create SQL migration `014_create_backup_codes_table.sql` with `user_id`, `code_hash`, `used_at`, `created_at`.
- **Step 053.2:** Implement `generateBackupCodes(userId)` returning 10 plain codes to user while storing hashes in database.
- **Step 053.3:** Implement backup code consumption logic during login: verify code hash, mark used, and prevent replay.
- **Step 053.4:** Provide settings button allowing merchants to regenerate 10 fresh codes, invalidating all old codes.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/014_create_backup_codes_table.sql`
- `// path: lib/auth/backup-codes.ts`
- `// path: tests/auth/backup-codes.test.ts`

**Verification & Quality Gate:**  
Use backup code during login; verify code works once and is immediately marked used and cannot be re-used.

---

### Step 054: Office 2FA Reset Workflow for Lost Credentials
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Implement formal office 2FA reset procedure when merchant exhausts or loses all backup codes and authenticator device.  

**Technical Architecture & Specification:**  
Per KD Solution IT protocol: when backup codes are lost, merchant contacts support by email and submits identity documents for manual verification. Upon approval by office staff, reset 2FA and force fresh TOTP setup on next login.

**Granular Sub-Steps:**
- **Step 054.1:** Create `office_2fa_reset_requests` table tracking ticket_id, user_id, verification_docs, reviewed_by, status.
- **Step 054.2:** Implement office approval action clearing existing TOTP secret and backup codes.
- **Step 054.3:** Flag user record with `must_setup_2fa = true` forcing mandatory 2FA enrollment on immediate next login.
- **Step 054.4:** Log `2FA_RESET_BY_OFFICE` in `audit_logs` with reviewer ID, verification document references, and timestamp.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/015_office_2fa_resets.sql`
- `// path: lib/office/2fa-reset.ts`
- `// path: app/(office)/compliance/2fa-resets/page.tsx`

**Verification & Quality Gate:**  
Execute office 2FA reset; verify user can log in with password and is immediately forced into fresh 2FA setup.

---

### Step 055: LR-022 Session Engine with HttpOnly Secure SameSite=Strict Cookies
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build session management engine enforcing LR-022 protocol with HttpOnly, Secure, and SameSite=Strict cookies.  

**Technical Architecture & Specification:**  
Implement high-security session management in `lib/auth/session.ts`. Store session state in `sessions` table. Issue session-bound cookies configured strictly as `HttpOnly`, `Secure`, `SameSite=Strict`, and path `/`. Bind every cookie strictly to its internal session record.

**Granular Sub-Steps:**
- **Step 055.1:** Create SQL migration `016_create_sessions_table.sql` with `session_id UUIDv7`, `user_id`, `token_hash`, `device_id`, `expires_at`.
- **Step 055.2:** Implement `createSession(userId, deviceContext)` setting encrypted session cookie.
- **Step 055.3:** Implement session validator extracting and verifying session cookie on every request in Next.js middleware.
- **Step 055.4:** Write tests verifying cookie attributes comply with HttpOnly, Secure, and SameSite=Strict.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/016_create_sessions_table.sql`
- `// path: lib/auth/session.ts`
- `// path: tests/auth/session.test.ts`

**Verification & Quality Gate:**  
Inspect Set-Cookie header on login; verify presence of HttpOnly, Secure, and SameSite=Strict flags.

---

### Step 056: Per-Device Proof Key & Hardware Fingerprinting Engine
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Implement client-side device proof key and browser fingerprinting detecting unrecognized devices.  

**Technical Architecture & Specification:**  
Generate unique device fingerprint and client proof key on device initialization. Track recognized devices in `user_devices` table. Detect logins from new devices, require step-up verification, and dispatch instant security email alerts.

**Granular Sub-Steps:**
- **Step 056.1:** Create `user_devices` table storing `user_id`, `device_fingerprint`, `proof_key`, `first_seen_at`, `last_ip`.
- **Step 056.2:** Implement device recognition utility comparing incoming device fingerprint and IP against known devices.
- **Step 056.3:** If new device detected, dispatch `NEW_DEVICE_LOGIN_ALERT` email and require email confirmation code.
- **Step 056.4:** Add unit tests verifying device fingerprint matching and new device alert triggering.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/017_create_user_devices.sql`
- `// path: lib/auth/device.ts`
- `// path: tests/auth/device.test.ts`

**Verification & Quality Gate:**  
Simulate login from new user agent and IP; verify device flagged as new and alert email dispatched.

---

### Step 057: Rotating Session Tokens & Family Invalidation on Replay Detection
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build rotating session token mechanism that invalidates entire session family immediately if a replayed token is detected.  

**Technical Architecture & Specification:**  
Implement token rotation on sensitive operations or periodic intervals. Maintain parent-child session lineage (`session_family_id`). If an old already-consumed session token is presented (indicating cookie theft/replay), immediately revoke all sessions in that family.

**Granular Sub-Steps:**
- **Step 057.1:** Add `session_family_id` and `is_revoked` columns to `sessions` table.
- **Step 057.2:** Implement `rotateSession(currentSessionId)` generating new token and marking previous token consumed.
- **Step 057.3:** Implement replay detection: if a consumed token is presented, mark entire `session_family_id` revoked immediately.
- **Step 057.4:** Write integration test simulating stolen cookie replay; verify all related sessions terminated instantly.

**Primary Files & Required Path Comments:**
- `// path: lib/auth/rotation.ts`
- `// path: tests/auth/token-replay.test.ts`

**Verification & Quality Gate:**  
Replay an expired rotated session cookie; verify all sessions for that user family are revoked and user is logged out.

---

### Step 058: Step-Up Reauthentication Engine for Sensitive Office Operations
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Enforce step-up reauthentication requiring fresh password or 2FA verification for high-privilege operations.  

**Technical Architecture & Specification:**  
Require fresh reauthentication (within previous 5 minutes) before permitting: gateway API key changes, payout approvals, KYC final approvals, and account unlocks. Track `last_reauth_at` timestamp in session and challenge user when expired.

**Granular Sub-Steps:**
- **Step 058.1:** Implement `requireStepUpAuth(session, maxAgeSeconds = 300)` guard middleware.
- **Step 058.2:** Create modal UI component `<StepUpAuthModal onVerified={callback} />` prompting for password or 2FA.
- **Step 058.3:** Create `POST /api/auth/step-up` validating fresh credentials and updating `last_reauth_at`.
- **Step 058.4:** Write tests verifying sensitive gateway management endpoints reject requests with stale reauthentication.

**Primary Files & Required Path Comments:**
- `// path: lib/auth/step-up.ts`
- `// path: components/auth/StepUpAuthModal.tsx`
- `// path: tests/auth/step-up.test.ts`

**Verification & Quality Gate:**  
Attempt to reveal or edit gateway keys after 10 minutes of inactivity; verify step-up challenge is displayed.

---

### Step 059: Instant Session Invalidation API & Global Kill-Switch
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build single-session logout and global account session revocation API terminating all active logins immediately.  

**Technical Architecture & Specification:**  
Create session revocation endpoints in `app/api/auth/logout/route.ts` and `app/api/auth/revoke-all/route.ts`. Invalidate session records in PostgreSQL and clear client cookies. Terminate all active logins instantly on password change or security alert.

**Granular Sub-Steps:**
- **Step 059.1:** Implement `logout(sessionId)` deleting session record and expiring client cookie.
- **Step 059.2:** Implement `revokeAllSessions(userId)` revoking all active sessions across all devices for that user.
- **Step 059.3:** Trigger `revokeAllSessions` automatically upon password change or office security intervention.
- **Step 059.4:** Write test verifying user with 3 active browser sessions is terminated across all browsers upon calling `revokeAllSessions`.

**Primary Files & Required Path Comments:**
- `// path: app/api/auth/logout/route.ts`
- `// path: app/api/auth/revoke-all/route.ts`
- `// path: lib/auth/session-kill.ts`

**Verification & Quality Gate:**  
Invoke `revoke-all`; verify subsequent requests from any active browser are immediately redirected to login.

---

### Step 060: Password Reset Flow with Turnstile & Lockout Immunity Guard
**Phase:** Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile  
**Objective:** Build secure password reset flow protected by Turnstile, time-limited reset tokens, and locked-account immunity guards.  

**Technical Architecture & Specification:**  
Implement password recovery workflow (`/forgot-password` and `/reset-password`). Verify Turnstile, generate 1-hour secure reset token, dispatch email link, enforce strong password policy on update, and guarantee that locked accounts cannot bypass 2-hour locks via reset.

**Granular Sub-Steps:**
- **Step 060.1:** Create `password_reset_tokens` table tracking `user_id`, `token_hash`, `expires_at`, `used_at`.
- **Step 060.2:** Implement `POST /api/auth/forgot-password` generating token and sending email with generic success response.
- **Step 060.3:** Enforce lockout guard: if account currently locked (`locked_until > NOW()`), refuse token creation or consumption.
- **Step 060.4:** Implement `POST /api/auth/reset-password` updating password hash, revoking all sessions, and invalidating token.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/018_create_password_reset_tokens.sql`
- `// path: app/api/auth/forgot-password/route.ts`
- `// path: app/api/auth/reset-password/route.ts`

**Verification & Quality Gate:**  
Request password reset; verify token works once within 1 hour and is rejected if account is in 2-hour lockout.

---

## Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains

### Step 061: RBAC Permission Matrix & System Role Definitions
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Define exhaustive Role-Based Access Control matrix covering all 8 system roles and granular permissions.  

**Technical Architecture & Specification:**  
Establish the platform role hierarchy and permission catalog in `lib/auth/roles.ts`. Define exact permissions for: `super_admin`, `ceo`, `compliance_kyc`, `finance_ops`, `support`, `blogger`, `owner` (sub-merchant), and `client` (token-only).

**Granular Sub-Steps:**
- **Step 061.1:** Define TypeScript enum `Role` with the 8 platform roles in `lib/auth/roles.ts`.
- **Step 061.2:** Define granular permissions (`MANAGE_GATEWAYS`, `APPROVE_KYC`, `MANAGE_PRICING`, `VIEW_LEDGER`, `RESOLVE_TICKETS`, etc.).
- **Step 061.3:** Create static permission mapping table mapping each role to allowed permission set.
- **Step 061.4:** Implement `hasPermission(role, permission)` utility function with unit test coverage.

**Primary Files & Required Path Comments:**
- `// path: lib/auth/roles.ts`
- `// path: types/permissions.ts`
- `// path: tests/auth/roles.test.ts`

**Verification & Quality Gate:**  
Verify `support` role has zero permissions for `MANAGE_GATEWAYS` or `APPROVE_KYC` and `blogger` has zero merchant access.

---

### Step 062: RBAC Route Guards & Next.js Edge Middleware
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build edge middleware and server action guards enforcing strict role separation across all dashboard routes.  

**Technical Architecture & Specification:**  
Configure Next.js middleware in `middleware.ts` routing users strictly according to role: `/super-admin/*` for super_admin, `/ceo/*` for CEO, `/compliance/*` for compliance_kyc, `/finance/*` for finance_ops, `/support/*` for support, `/blogger/*` for blogger, `/dashboard/*` for owners.

**Granular Sub-Steps:**
- **Step 062.1:** Implement route matching rules in `middleware.ts` checking session role against route path prefix.
- **Step 062.2:** Redirect unauthorized roles immediately to their designated home dashboard or HTTP 403 Forbidden.
- **Step 062.3:** Create React Server Component guard `<RequirePermission permission={...}>` for granular page sections.
- **Step 062.4:** Add integration tests verifying that `support` cannot load `/super-admin/gateways` or `/compliance/kyc`.

**Primary Files & Required Path Comments:**
- `// path: middleware.ts`
- `// path: lib/auth/guard.ts`
- `// path: tests/auth/middleware.test.ts`

**Verification & Quality Gate:**  
Authenticate as support user and request `/super-admin/gateways`; verify immediate 403 Forbidden redirect.

---

### Step 063: Dual-Control & Four-Eye Review Framework
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build four-eye review framework requiring separate initiator and approver actors for high-risk operations.  

**Technical Architecture & Specification:**  
Implement dual-control framework in `lib/compliance/four-eye.ts`. Enforce rule: high-risk actions (large merchant KYC approval, fee structure changes, large manual payouts, tier overrides) cannot be finalized by the user who initiated or proposed them.

**Granular Sub-Steps:**
- **Step 063.1:** Create `pending_approvals` table storing `action_type`, `proposed_payload`, `initiator_id`, `approver_id`, `status`.
- **Step 063.2:** Implement initiator-approver validation: assert `initiator_id !== approver_id`, throwing error if same actor attempts sign-off.
- **Step 063.3:** Provide API and UI for reviewing pending proposals with full diff view and approval/rejection notes.
- **Step 063.4:** Write tests verifying an administrator cannot approve their own high-risk proposal.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/019_create_pending_approvals.sql`
- `// path: lib/compliance/four-eye.ts`
- `// path: tests/compliance/four-eye.test.ts`

**Verification & Quality Gate:**  
Initiate tier override proposal; attempt approval with same actor ID and verify system blocks action.

---

### Step 064: Office Multi-Level Approval Chain Engine (Requester -> CEO -> Super Admin)
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build sequential approval chain workflow routing large platform actions from Requester to CEO to Super Admin.  

**Technical Architecture & Specification:**  
Implement enterprise approval chain engine: Requester proposes action -> CEO reviews and signs off -> Super Admin confirms final release. Required for large payout releases, platform fee adjustments, and country availability toggles.

**Granular Sub-Steps:**
- **Step 064.1:** Create `approval_chains` table tracking `step_order`, `required_role`, `actor_id`, `status` (pending, approved, rejected).
- **Step 064.2:** Implement workflow state machine advancing proposal only upon sequential signature of each authorized level.
- **Step 064.3:** Dispatch internal dashboard notifications and emails to CEO and Super Admin when approvals are awaiting action.
- **Step 064.4:** Write integration test exercising full three-step approval cycle and recording all transitions in audit log.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/020_create_approval_chains.sql`
- `// path: lib/office/approval-chain.ts`
- `// path: tests/office/approval-chain.test.ts`

**Verification & Quality Gate:**  
Submit large payout proposal; verify CEO receives approval request, followed by Super Admin confirmation gate.

---

### Step 065: Multi-Tenant Context Resolution & Isolation Middleware
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build tenant context resolver identifying sub-merchant company ID from authenticated session and injecting into database queries.  

**Technical Architecture & Specification:**  
Create tenant resolution pipeline in `lib/tenant/context.ts`. Extract `company_id` from verified session, attach to request async storage, and inject into database transactions via `set_tenant_context` to guarantee 100% RLS tenant isolation.

**Granular Sub-Steps:**
- **Step 065.1:** Implement `resolveTenantContext(req)` retrieving active company ID for sub-merchant owner.
- **Step 065.2:** For office roles, allow tenant context switching with explicit audit logging of which company is being viewed.
- **Step 065.3:** Create React context `<TenantProvider>` providing current company metadata to sub-merchant dashboard.
- **Step 065.4:** Add unit tests verifying missing or tampered company headers fail closed.

**Primary Files & Required Path Comments:**
- `// path: lib/tenant/context.ts`
- `// path: components/tenant/TenantProvider.tsx`
- `// path: tests/tenant/context.test.ts`

**Verification & Quality Gate:**  
Query sub-merchant dashboard; verify tenant context automatically filters all database queries by `company_id`.

---

### Step 066: Super Admin Global Dashboard Architecture
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build Super Admin global management console with platform settings, logo branding, and role delegation.  

**Technical Architecture & Specification:**  
Construct dashboard routes under `app/(office)/super-admin/`. Provide controls for platform name, logo, contact details, office staff role delegation, global fee percentages, country enable/disable switches, and system gateway management.

**Granular Sub-Steps:**
- **Step 066.1:** Create Super Admin layout and navigation bar in `app/(office)/super-admin/layout.tsx`.
- **Step 066.2:** Build general platform settings page (`app/(office)/super-admin/settings/page.tsx`) for logo, name, and support contacts.
- **Step 066.3:** Build staff role delegation page (`app/(office)/super-admin/staff/page.tsx`) assigning office roles.
- **Step 066.4:** Enforce step-up 2FA reauthentication on saving sensitive platform settings.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/super-admin/layout.tsx`
- `// path: app/(office)/super-admin/settings/page.tsx`
- `// path: app/(office)/super-admin/staff/page.tsx`

**Verification & Quality Gate:**  
Log in as Super Admin; verify platform settings update successfully and require 2FA reauthentication.

---

### Step 067: CEO Executive Approval & Oversight Dashboard
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build dedicated CEO executive dashboard for KYC final approvals, large action confirmations, and risk oversight.  

**Technical Architecture & Specification:**  
Construct CEO workspace under `app/(office)/ceo/`. Provide dedicated approval queues for final merchant KYC onboarding, confirmation of large Super Admin actions (payout releases, platform fee changes), country availability decisions, and risk tier policies.

**Granular Sub-Steps:**
- **Step 067.1:** Create CEO layout and executive KPIs in `app/(office)/ceo/layout.tsx` and `app/(office)/ceo/page.tsx`.
- **Step 067.2:** Build KYC final approval queue (`app/(office)/ceo/approvals/kyc/page.tsx`) with underwriting summaries.
- **Step 067.3:** Build joint governance screen (`app/(office)/ceo/governance/page.tsx`) for country and pricing decisions.
- **Step 067.4:** Implement CEO digital sign-off with Ed25519 signature recorded in audit trail.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/ceo/layout.tsx`
- `// path: app/(office)/ceo/page.tsx`
- `// path: app/(office)/ceo/approvals/kyc/page.tsx`

**Verification & Quality Gate:**  
Review pending KYC packet as CEO; execute final approval and confirm sub-merchant provisioning is unlocked.

---

### Step 068: Compliance & KYC Officer Dedicated Dashboard
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build Compliance & KYC dashboard for identity reviews, underwriting, sanctions screening, and SAR cases.  

**Technical Architecture & Specification:**  
Construct workspace under `app/(office)/compliance/`. Equip compliance officers with tools for: KYC/KYB document verification, UBO inspection, manual payment review (> $5,000), chargeback dispute document review, daily sanctions/PEP alerts, and SAR case preparation.

**Granular Sub-Steps:**
- **Step 068.1:** Create compliance layout and review queues in `app/(office)/compliance/layout.tsx` and `page.tsx`.
- **Step 068.2:** Build merchant underwriting review queue (`app/(office)/compliance/underwriting/page.tsx`).
- **Step 068.3:** Build manual payment review interface (`app/(office)/compliance/payments/review/page.tsx`) for transactions > $5k or AVS mismatches.
- **Step 068.4:** Build confidential SAR case workspace (`app/(office)/compliance/sar/page.tsx`) hidden from other office roles.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/compliance/layout.tsx`
- `// path: app/(office)/compliance/underwriting/page.tsx`
- `// path: app/(office)/compliance/payments/review/page.tsx`

**Verification & Quality Gate:**  
Access compliance workspace; review sample merchant application and verify document inspection workflow.

---

### Step 069: Finance Operations Dedicated Dashboard
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build Finance Operations dashboard for reconciliation mismatch resolution, settlement releases, and payout handling.  

**Technical Architecture & Specification:**  
Construct workspace under `app/(office)/finance/`. Equip finance operators with tools for: 3-day reconciliation mismatch resolution, failed payout investigation, settlement batch verification, processor monthly bill matching, and company accounting ledger oversight.

**Granular Sub-Steps:**
- **Step 069.1:** Create finance ops layout and KPI cards in `app/(office)/finance/layout.tsx` and `page.tsx`.
- **Step 069.2:** Build reconciliation mismatch queue (`app/(office)/finance/reconciliation/page.tsx`) with 72-hour SLA countdown.
- **Step 069.3:** Build failed payout resolution screen (`app/(office)/finance/payouts/failed/page.tsx`).
- **Step 069.4:** Build processor bill verification tool (`app/(office)/finance/processor-bills/page.tsx`).

**Primary Files & Required Path Comments:**
- `// path: app/(office)/finance/layout.tsx`
- `// path: app/(office)/finance/reconciliation/page.tsx`
- `// path: app/(office)/finance/payouts/failed/page.tsx`

**Verification & Quality Gate:**  
Inspect reconciliation mismatch queue; verify 3-day SLA tracker displays remaining resolution time.

---

### Step 070: Customer Support Portal with Strict Gateway/KYC Isolation
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build Customer Support portal with ticket management while enforcing strict zero-access to gateway keys and KYC approval.  

**Technical Architecture & Specification:**  
Construct support portal under `app/(office)/support/`. Enable support staff to manage merchant tickets, communicate with users, and view merchant transaction statuses. Enforce strict architectural isolation: support role has zero access to payment gateway keys, KYC approvals, or payout releases.

**Granular Sub-Steps:**
- **Step 070.1:** Create support layout and ticketing queue in `app/(office)/support/layout.tsx` and `page.tsx`.
- **Step 070.2:** Build ticket management and reply interface (`app/(office)/support/tickets/[id]/page.tsx`).
- **Step 070.3:** Enforce strict database RLS and route guards forbidding support access to `gateway_credentials` and `kyc_decisions`.
- **Step 070.4:** Add unit tests verifying support role receives 403 Forbidden when attempting any gateway or KYC approval action.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/support/layout.tsx`
- `// path: app/(office)/support/tickets/[id]/page.tsx`
- `// path: tests/auth/support-isolation.test.ts`

**Verification & Quality Gate:**  
Log in as support user; verify gateway keys and KYC approval buttons are completely absent and blocked by RLS.

---

### Step 071: Blogger Public Content Management Portal
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build Blogger workspace for CMS blog articles and public content with total isolation from merchant and financial data.  

**Technical Architecture & Specification:**  
Construct content portal under `app/(office)/blogger/`. Allow bloggers to draft, edit, and publish blog articles and public educational content. Enforce strict zero-access isolation: blogger role cannot access any merchant records, payment transactions, KYC files, or financial reports.

**Granular Sub-Steps:**
- **Step 071.1:** Create blogger layout and article list in `app/(office)/blogger/layout.tsx` and `page.tsx`.
- **Step 071.2:** Build rich Markdown/WYSIWYG article editor (`app/(office)/blogger/articles/[id]/page.tsx`) with image upload.
- **Step 071.3:** Enforce database RLS denying blogger role access to companies, payments, ledger, invoices, or tickets.
- **Step 071.4:** Add unit tests verifying blogger role cannot query any merchant or financial database table.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/blogger/layout.tsx`
- `// path: app/(office)/blogger/articles/[id]/page.tsx`
- `// path: tests/auth/blogger-isolation.test.ts`

**Verification & Quality Gate:**  
Log in as blogger; verify article editor functions cleanly and attempts to query merchant data return RLS denial.

---

### Step 072: Sub-Merchant Owner Dashboard Architecture
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build Sub-Merchant Owner portal managing business profile, products, clients, invoices, payments, and payouts.  

**Technical Architecture & Specification:**  
Construct merchant dashboard under `app/(merchant)/dashboard/`. Enable sub-merchants to view business analytics, manage products and clients, issue invoices and payment links, inspect settlement statements, configure payout bank accounts, and view reserve statuses.

**Granular Sub-Steps:**
- **Step 072.1:** Create sub-merchant dashboard layout, sidebar navigation, and header in `app/(merchant)/layout.tsx`.
- **Step 072.2:** Build main analytics overview page (`app/(merchant)/dashboard/page.tsx`) displaying volume, balance, holds, and chargeback rate.
- **Step 072.3:** Enforce single-owner per company rule: one owner manages exactly one business entity.
- **Step 072.4:** Ensure all queries are filtered automatically by sub-merchant's authenticated `company_id` via RLS.

**Primary Files & Required Path Comments:**
- `// path: app/(merchant)/layout.tsx`
- `// path: app/(merchant)/dashboard/page.tsx`
- `// path: app/(merchant)/settings/page.tsx`

**Verification & Quality Gate:**  
Log in as merchant owner; verify dashboard loads only own company metrics and data.

---

### Step 073: Tokenized Client Link Portal Architecture (i/[token] & e/[token])
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build tokenized public portal for clients to view and pay invoices (`i/[token]`) and sign estimates (`e/[token]`) without logging in.  

**Technical Architecture & Specification:**  
Implement zero-friction client portal under `app/(client)/i/[token]/` and `app/(client)/e/[token]/`. Clients access documents exclusively via high-entropy cryptographically signed tokens without requiring an account or password. Once paid, invoice link locks and displays receipt.

**Granular Sub-Steps:**
- **Step 073.1:** Create tokenized invoice view route `app/(client)/i/[token]/page.tsx` verifying token and displaying invoice.
- **Step 073.2:** Create tokenized estimate view route `app/(client)/e/[token]/page.tsx` displaying quote and digital signature pad.
- **Step 073.3:** Enforce read-only state and receipt display once invoice is fully paid.
- **Step 073.4:** Add rate limiting on tokenized endpoints to defend against brute force token scanning.

**Primary Files & Required Path Comments:**
- `// path: app/(client)/i/[token]/page.tsx`
- `// path: app/(client)/e/[token]/page.tsx`
- `// path: lib/client-portal/tokens.ts`

**Verification & Quality Gate:**  
Access sample invoice via token URL; verify invoice displays with payment options without prompting for login.

---

### Step 074: Same-Day Staff Offboarding & Automated Revocation Checklist
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build automated staff offboarding checklist revoking all office sessions, roles, and API access on the same day staff leaves.  

**Technical Architecture & Specification:**  
Implement immediate staff offboarding engine in `lib/office/offboarding.ts`. Invalidate all active sessions, revoke company memberships, disable 2FA, scramble credentials, log offboarding event in audit log, and generate compliance sign-off checklist.

**Granular Sub-Steps:**
- **Step 074.1:** Create `POST /api/office/staff/[id]/offboard` endpoint restricted to Super Admin with step-up 2FA.
- **Step 074.2:** Execute revocation in transaction: update user status to `offboarded`, revoke all sessions, set roles to none.
- **Step 074.3:** Record `STAFF_OFFBOARDED_IMMEDIATELY` in `audit_logs` capturing offboarded staff ID, actor ID, and checklist.
- **Step 074.4:** Write tests verifying offboarded staff member's active cookies are invalidated instantly across all services.

**Primary Files & Required Path Comments:**
- `// path: app/api/office/staff/[id]/offboard/route.ts`
- `// path: lib/office/offboarding.ts`
- `// path: tests/office/offboarding.test.ts`

**Verification & Quality Gate:**  
Offboard test staff user; verify all active sessions terminate immediately and login is permanently disabled.

---

### Step 075: Permission Elevation & Delegation Audit Trail
**Phase:** Phase 5: RBAC Engine, Multi-Tenant Isolation & Approval Chains  
**Objective:** Build comprehensive audit trail logging every permission grant, role change, and privileged action execution.  

**Technical Architecture & Specification:**  
Ensure zero unmonitored permission changes. Every role grant, permission elevation, or delegation must generate an immutable audit log entry containing: granting actor ID, recipient user ID, previous role, new role, justification, IP address, and timestamp.

**Granular Sub-Steps:**
- **Step 075.1:** Implement `logPermissionChange(actorId, targetUserId, oldRole, newRole, reason)` in `lib/audit/rbac.ts`.
- **Step 075.2:** Trigger automated security alert to CEO and Super Admin whenever an office role is delegated or elevated.
- **Step 075.3:** Create office audit report view (`app/(office)/super-admin/audit/permissions/page.tsx`) listing all role transitions.
- **Step 075.4:** Write unit test verifying audit entry generation and alert dispatch upon role modification.

**Primary Files & Required Path Comments:**
- `// path: lib/audit/rbac.ts`
- `// path: app/(office)/super-admin/audit/permissions/page.tsx`
- `// path: tests/audit/rbac.test.ts`

**Verification & Quality Gate:**  
Promote user to compliance_kyc; verify audit log entry records transition and security notification is generated.

---

## Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine

### Step 076: Legal Terms Acceptance Engine with Version, IP & Timestamp Audit
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Build tamper-proof legal terms acceptance engine recording policy version, acceptance time, IP address, and document hash.  

**Technical Architecture & Specification:**  
Implement terms acceptance tracker in `lib/compliance/terms.ts`. Capture immutable acceptance records in `terms_acceptances` table containing user_id, company_id, policy_id, policy_version, accepted_at, ip_address, user_agent, and SHA-256 hash of policy text at time of acceptance.

**Granular Sub-Steps:**
- **Step 076.1:** Create SQL migration `021_create_terms_acceptances.sql` with strict foreign keys and audit indexes.
- **Step 076.2:** Implement `recordTermsAcceptance(userId, policySlug, ip, userAgent)` helper function.
- **Step 076.3:** Create signup and onboarding terms acceptance UI component with scroll-to-bottom and checkbox validation.
- **Step 076.4:** Write tests verifying new policy versions require fresh re-acceptance before allowing dashboard access.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/021_create_terms_acceptances.sql`
- `// path: lib/compliance/terms.ts`
- `// path: components/legal/TermsAcceptanceModal.tsx`

**Verification & Quality Gate:**  
Accept platform terms at signup; verify database record contains exact IP, timestamp, version, and policy text hash.

---

### Step 077: Client & Merchant Funds Fiduciary Segregation Architecture
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Establish legal and database segregation keeping client and sub-merchant settlement funds separated from platform operational funds.  

**Technical Architecture & Specification:**  
Fulfill regulatory payment facilitator fiduciary duties: sub-merchant settlement funds and rolling reserves must be held in segregated fiduciary ledger accounts completely separated from platform corporate revenue and operational expenses.

**Granular Sub-Steps:**
- **Step 077.1:** Define dedicated Chart of Accounts structure separating Fiduciary Settlement Assets (Account 1100) from Corporate Cash (Account 1000).
- **Step 077.2:** Enforce ledger posting constraints preventing commingling of platform operational fees with held merchant settlement balances.
- **Step 077.3:** Create daily fiduciary segregation audit check verifying Bank Settlement Account balance equals or exceeds total Merchant Liabilities.
- **Step 077.4:** Write automated test raising compliance alert if platform funds dip below fiduciary liability coverage.

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/fiduciary.ts`
- `// path: tests/ledger/fiduciary-segregation.test.ts`

**Verification & Quality Gate:**  
Execute daily fiduciary audit script; verify 100% mathematical match between custodial assets and merchant liabilities.

---

### Step 078: Designated Compliance Officer Settings & Registry
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Build platform settings registry recording officially appointed Compliance & AML Officer contact and credentials.  

**Technical Architecture & Specification:**  
Record appointed AML/CFT Compliance Officer in platform settings (`app/(office)/super-admin/compliance-officer/`). Store officer name, official email, regulator registration number, appointment date, and contact phone for regulatory reporting.

**Granular Sub-Steps:**
- **Step 078.1:** Create `compliance_officer_settings` table storing officer details, credentials, and appointment history.
- **Step 078.2:** Provide Super Admin interface to update appointed officer with CEO confirmation approval step.
- **Step 078.3:** Display compliance officer contact details automatically on legal policy pages and public disclosures.
- **Step 078.4:** Audit log all changes to compliance officer appointments in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/022_compliance_officer_settings.sql`
- `// path: app/(office)/super-admin/compliance-officer/page.tsx`

**Verification & Quality Gate:**  
Update appointed compliance officer; verify CEO confirmation is required and public legal page reflects updated contact.

---

### Step 079: Compliance Calendar, Cyber Insurance & PCI Attestation Renewal Tracker
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Build automated compliance calendar tracking annual PCI DSS Attestation, cyber insurance, and licensing renewal deadlines.  

**Technical Architecture & Specification:**  
Construct calendar engine in `lib/compliance/calendar.ts`. Track expiration dates for: PCI DSS Attestation of Compliance (AoC), corporate cyber insurance policy, annual penetration testing reports, acquiring bank contracts, and regulatory filings. Dispatch automated alerts 90, 60, and 30 days prior.

**Granular Sub-Steps:**
- **Step 079.1:** Create SQL migration `023_create_compliance_calendar.sql` tracking `event_name`, `category`, `expiry_date`, `assigned_to`, `status`.
- **Step 079.2:** Build office compliance calendar UI (`app/(office)/compliance/calendar/page.tsx`) with deadline countdowns.
- **Step 079.3:** Create background notification worker sending escalation emails at 90d, 60d, 30d, and 7d before expiration.
- **Step 079.4:** Add unit tests verifying calendar alerts fire accurately based on remaining threshold days.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/023_create_compliance_calendar.sql`
- `// path: lib/compliance/calendar.ts`
- `// path: app/(office)/compliance/calendar/page.tsx`

**Verification & Quality Gate:**  
Seed expiring PCI AoC date in 45 days; verify background job flags status as urgent and sends office alert.

---

### Step 080: Platform Emergency Liquidity Buffer & Company Funds Capitalization
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Build platform liquidity monitoring engine tracking company funds buffer to absorb delayed settlements and chargeback surges.  

**Technical Architecture & Specification:**  
Per KD Solution IT operational rules: maintain dedicated company liquidity buffer to cover merchant payouts when processor settlement is delayed or unexpected large chargeback arrives. Alert Finance Ops and CEO if buffer dips below minimum threshold.

**Granular Sub-Steps:**
- **Step 080.1:** Create `platform_liquidity_buffers` table tracking current company buffer balance, minimum threshold, and reserve allocations.
- **Step 080.2:** Implement automated calculation evaluating 30-day peak chargeback exposure and setting minimum liquidity floor.
- **Step 080.3:** Build liquidity monitoring widget on CEO and Finance Ops dashboards with real-time health indicator.
- **Step 080.4:** Trigger urgent SMS/email alert to CEO and Finance Ops if buffer falls below 120% of minimum threshold.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/024_platform_liquidity.sql`
- `// path: lib/finance/liquidity.ts`
- `// path: components/finance/LiquidityHealthCard.tsx`

**Verification & Quality Gate:**  
Simulate processor settlement delay; verify liquidity buffer covers merchant settlement and logs event.

---

### Step 081: Global Country Enable/Disable Engine with Sanctioned Country Freeze
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Build global country enable/disable engine jointly controlled by Super Admin and CEO, permanently freezing sanctioned nations.  

**Technical Architecture & Specification:**  
Implement country availability management in `lib/compliance/country-control.ts`. Maintain ISO 3166-1 country list. Allow Super Admin and CEO to enable/disable merchant countries. Hardcode comprehensive OFAC/UN sanctioned countries (e.g. IR, KP, CU, SY) as permanently disabled.

**Granular Sub-Steps:**
- **Step 081.1:** Create SQL migration `025_create_country_controls.sql` with `country_code`, `is_enabled`, `is_sanctioned_frozen`, `updated_by`.
- **Step 081.2:** Hardcode permanent sanctions freeze in database constraint: `CHECK (NOT (is_sanctioned_frozen = true AND is_enabled = true))`.
- **Step 081.3:** Build country management screen (`app/(office)/super-admin/countries/page.tsx`) requiring dual approval from Super Admin and CEO.
- **Step 081.4:** Add unit tests verifying any attempt to enable North Korea (KP) or Iran (IR) raises fatal constraint error.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/025_create_country_controls.sql`
- `// path: lib/compliance/country-control.ts`
- `// path: app/(office)/super-admin/countries/page.tsx`

**Verification & Quality Gate:**  
Attempt to enable sanctioned country in test suite; verify database check constraint permanently blocks operation.

---

### Step 082: CMS Editable Legal Policy Architecture
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Build CMS policy architecture allowing Super Admin to edit legal policies with version increments and re-acceptance triggers.  

**Technical Architecture & Specification:**  
Construct policy content management engine in `lib/cms/policies.ts`. Store versioned markdown policy documents in `policies` table. Provide admin editor (`app/(office)/super-admin/policies/`). When policy content updates, increment version and require re-acceptance.

**Granular Sub-Steps:**
- **Step 082.1:** Create SQL migration `026_create_policies_table.sql` with `slug`, `title`, `content_md`, `version INT`, `effective_date`.
- **Step 082.2:** Build policy editor UI with rich markdown preview, version comparison diff tool, and publish workflow.
- **Step 082.3:** Implement public policy page renderer (`app/(public)/legal/[slug]/page.tsx`) displaying current active version.
- **Step 082.4:** Enforce audit logging of every policy edit, capturing old text, new text diff, editor ID, and effective date.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/026_create_policies_table.sql`
- `// path: lib/cms/policies.ts`
- `// path: app/(public)/legal/[slug]/page.tsx`

**Verification & Quality Gate:**  
Publish new policy version; verify public URL updates immediately and merchants are prompted for re-acceptance.

---

### Step 083: KYC and KYB Policy Implementation & Versioned Acceptance
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement comprehensive KYC and KYB Policy page detailing verification requirements, document types, and review standards.  

**Technical Architecture & Specification:**  
Draft and deploy public policy at `/legal/kyc-kyb-policy`. Detail identity verification standards, business registration requirements, director/UBO identification, proof of address criteria, review timelines, and account capability activation gates.

**Granular Sub-Steps:**
- **Step 083.1:** Seed official KYC/KYB Policy text in `db/seeds/policies/kyc-kyb.md` covering sub-merchant requirements.
- **Step 083.2:** Integrate mandatory acceptance checkbox during merchant initial registration and onboarding submission.
- **Step 083.3:** Provide PDF download option of agreed policy for merchant legal records.
- **Step 083.4:** Verify policy page renders responsive typography, clear headings, and active version timestamp.

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/kyc-kyb.md`
- `// path: app/(public)/legal/kyc-kyb-policy/page.tsx`

**Verification & Quality Gate:**  
Navigate to `/legal/kyc-kyb-policy`; verify complete policy text renders and matches seeded version.

---

### Step 084: Ultimate Beneficial Ownership (UBO >= 25%) Policy Implementation
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement UBO Policy mandating disclosure, identity verification, and sanctions screening for all owners holding 25% or more equity.  

**Technical Architecture & Specification:**  
Deploy public policy at `/legal/ubo-policy`. Define legal obligation of corporate sub-merchants to identify all individual Ultimate Beneficial Owners holding 25% or more shares or voting rights, including selfie/liveness verification and sanctions screening.

**Granular Sub-Steps:**
- **Step 084.1:** Seed official UBO Policy markdown content in `db/seeds/policies/ubo.md`.
- **Step 084.2:** Implement onboarding validation rule enforcing disclosure of all individuals with >= 25% equity sum.
- **Step 084.3:** Create UBO declaration legal consent certificate generated upon merchant application submission.
- **Step 084.4:** Add unit tests verifying onboarding form blocks submission if declared equity does not account for all >= 25% owners.

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/ubo.md`
- `// path: app/(public)/legal/ubo-policy/page.tsx`

**Verification & Quality Gate:**  
Inspect `/legal/ubo-policy`; confirm 25% equity threshold rule and director identification mandates are clearly displayed.

---

### Step 085: Anti-Money Laundering (AML) & Counter-Terrorist Financing (CFT) Policy
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement AML and CFT Policy detailing transaction monitoring, suspicious activity reporting, and red flag indicators.  

**Technical Architecture & Specification:**  
Deploy public policy at `/legal/aml-cft-policy`. Outline platform AML risk methodology, transaction velocity limits, unusual payment patterns, mandatory customer identification, cash-equivalent restrictions, and SAR submission protocols.

**Granular Sub-Steps:**
- **Step 085.1:** Seed official AML/CFT Policy text in `db/seeds/policies/aml-cft.md` conforming to FATF and regional guidance.
- **Step 085.2:** Incorporate red flag behavior catalog informing merchants of prohibited transaction structuring and money transmission.
- **Step 085.3:** Implement merchant acknowledgment step during underwriting and profile completion.
- **Step 085.4:** Verify policy page meets accessibility standards and includes designated compliance officer contact.

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/aml-cft.md`
- `// path: app/(public)/legal/aml-cft-policy/page.tsx`

**Verification & Quality Gate:**  
Verify `/legal/aml-cft-policy` is accessible, indexed in sitemap, and recorded in policy version registry.

---

### Step 086: Sanctions (OFAC/UN/EU/UK HMT) & PEP Screening Policy Implementation
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement Sanctions & Politically Exposed Persons (PEP) Screening Policy aligning with international compliance lists.  

**Technical Architecture & Specification:**  
Deploy public policy at `/legal/sanctions-pep-policy`. Explain daily screening against OFAC, UN Security Council, EU Consolidated, and UK HMT sanctions lists. Detail enhanced due diligence for PEPs and strict prohibition on sanctioned jurisdictions.

**Granular Sub-Steps:**
- **Step 086.1:** Seed Sanctions and PEP Policy text in `db/seeds/policies/sanctions-pep.md`.
- **Step 086.2:** Document immediate account freeze procedures upon confirmed positive sanctions match.
- **Step 086.3:** Detail merchant right to submit evidence of false positive identity disambiguation.
- **Step 086.4:** Verify policy page displays correctly on desktop and mobile viewports.

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/sanctions-pep.md`
- `// path: app/(public)/legal/sanctions-pep-policy/page.tsx`

**Verification & Quality Gate:**  
Check `/legal/sanctions-pep-policy`; verify list sources (OFAC, UN, EU, UK HMT) and freeze rules are explicitly enumerated.

---

### Step 087: Underwriting, Risk Assessment & Prohibited/Restricted Business Policy
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement Underwriting, Merchant Acceptance & Prohibited/Restricted Businesses Policy with clear MCC classifications.  

**Technical Architecture & Specification:**  
Deploy policy at `/legal/prohibited-businesses`. Enumerate strictly prohibited business models (weapons, illegal narcotics, adult content, gambling, unregulated financial services, deceptive marketing) and restricted models requiring Tier 1 caps and elevated rolling reserves.

**Granular Sub-Steps:**
- **Step 087.1:** Seed Prohibited and Restricted Business Policy text in `db/seeds/policies/prohibited-businesses.md`.
- **Step 087.2:** Include explicit searchable table of prohibited MCC codes and associated business categories.
- **Step 087.3:** Implement automated onboarding check blocking prohibited MCC selections at form submission time.
- **Step 087.4:** Verify policy contains clear instructions for merchants operating in restricted categories.

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/prohibited-businesses.md`
- `// path: app/(public)/legal/prohibited-businesses/page.tsx`

**Verification & Quality Gate:**  
Verify prohibited businesses page lists all barred categories and MCC codes with clear explanation.

---

### Step 088: Chargeback, Dispute, Refund & Settlement Policy Implementation
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement Chargeback, Dispute, Refund & Settlement Policy defining evidence deadlines, reserve terms, and fees.  

**Technical Architecture & Specification:**  
Deploy policy at `/legal/chargeback-settlement-policy`. Document 24/48-hour dispute response SLAs, rolling reserve percentages, settlement holding periods, platform fee refundability rules, chargeback fee liability, and negative balance recovery.

**Granular Sub-Steps:**
- **Step 088.1:** Seed Chargeback and Settlement Policy in `db/seeds/policies/chargeback-settlement.md`.
- **Step 088.2:** Explicitly state 10% 90-day reserve for Tier 1 and 5% 60-day reserve for Tier 2 merchants.
- **Step 088.3:** Detail merchant obligation to provide evidence packs within 24 hours of dispute notification.
- **Step 088.4:** Display clear warning regarding card network chargeback monitoring thresholds (>0.3%).

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/chargeback-settlement.md`
- `// path: app/(public)/legal/chargeback-settlement-policy/page.tsx`

**Verification & Quality Gate:**  
Check `/legal/chargeback-settlement-policy`; verify reserve rates, dispute timelines, and fee rules are accurately stated.

---

### Step 089: Data Privacy (GDPR, CCPA) & PCI-DSS Compliance Policy Implementation
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement Data Privacy & PCI-DSS Compliance Policy explaining data encryption, retention, and hosted card data isolation.  

**Technical Architecture & Specification:**  
Deploy policy at `/legal/privacy-pci-policy`. Clarify platform compliance with GDPR, CCPA, and Asian privacy regulations. Affirm strict PCI-DSS SAQ A scope: card numbers and CVV are entered solely in provider-hosted fields and never touch platform servers.

**Granular Sub-Steps:**
- **Step 089.1:** Seed Privacy and PCI-DSS Policy in `db/seeds/policies/privacy-pci.md`.
- **Step 089.2:** Explain pre-upload AES-256-GCM file encryption and 7-year regulatory retention standards.
- **Step 089.3:** Provide data subject request instructions for merchant and client data access or erasure where legally permitted.
- **Step 089.4:** Verify policy includes clear contact email for privacy officer inquiries.

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/privacy-pci.md`
- `// path: app/(public)/legal/privacy-pci-policy/page.tsx`

**Verification & Quality Gate:**  
Verify `/legal/privacy-pci-policy` accurately documents zero cardholder data storage and encryption standards.

---

### Step 090: Automated Decision Review & Human Appeal Rights Policy Implementation
**Phase:** Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine  
**Objective:** Implement Automated Decision Review Policy establishing merchant right to human review and appeal of risk or KYC decisions.  

**Technical Architecture & Specification:**  
Deploy policy at `/legal/automated-decisions-appeal`. Mandate that no merchant account is permanently terminated or denied solely by automated algorithms. Guarantee human review by Compliance team and CEO appeal channel for any adverse risk or onboarding decision.

**Granular Sub-Steps:**
- **Step 090.1:** Seed Automated Decision Review Policy in `db/seeds/policies/automated-decisions.md`.
- **Step 090.2:** Detail step-by-step appeal process: merchant submits appeal form within 14 days of adverse decision.
- **Step 090.3:** Establish 5-business-day SLA for Compliance team to re-examine evidence and issue written determination.
- **Step 090.4:** Build appeal submission route and form (`app/(public)/legal/appeal/page.tsx`).

**Primary Files & Required Path Comments:**
- `// path: db/seeds/policies/automated-decisions.md`
- `// path: app/(public)/legal/automated-decisions-appeal/page.tsx`

**Verification & Quality Gate:**  
Verify appeal policy page explains human review rights and appeal submission form functions cleanly.

---

## Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters

### Step 091: One Person, One Account Multi-Signal Duplicate Detection Engine
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build multi-signal duplicate account detection engine preventing individuals from creating multiple sub-merchant businesses.  

**Technical Architecture & Specification:**  
Enforce strict KD Solution IT rule: one person holds exactly one account; one owner holds exactly one business. Check 6 signals: email, phone number, identity document number blind hash, tax ID, bank account fingerprint, and normalized legal name with date of birth. Match blocks account and sends case to compliance review.

**Granular Sub-Steps:**
- **Step 091.1:** Implement `checkDuplicateSignals(profile)` in `lib/compliance/dedup.ts` scanning against existing active/closed accounts.
- **Step 091.2:** Compute blind index hashes for national ID, passport, tax number, and bank account routing/account pair.
- **Step 091.3:** If match found, immediately block automated account creation, flag application `duplicate_review`, and alert compliance officer.
- **Step 091.4:** Inform applicant with generic message: 'An account associated with these details already exists. Please contact support.'

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/dedup.ts`
- `// path: db/migrations/027_duplicate_signals.sql`
- `// path: tests/compliance/dedup.test.ts`

**Verification & Quality Gate:**  
Attempt signup with duplicate national ID hash; verify system halts creation and creates compliance review ticket.

---

### Step 092: Dynamic Processor-Driven Business Profile Form Engine
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build dynamic business profile form that renders fields dynamically based on connected payment processor requirements.  

**Technical Architecture & Specification:**  
Construct flexible onboarding form in `app/(merchant)/onboarding/business-profile/`. Adapt field requirements dynamically according to which payment processor (NMI, Stripe Connect, Rainforest, Airwallex) will underwrite the merchant, collecting all processor-required fields without redundant re-entry.

**Granular Sub-Steps:**
- **Step 092.1:** Define processor-specific field schemas in `lib/kyb/schemas/` (NMI, Stripe, Rainforest, Airwallex).
- **Step 092.2:** Create unified client form component rendering required fields: legal name, trade name, address, tax ID, formation date.
- **Step 092.3:** Store merchant answers in canonical platform structure mapped to each processor's API schema.
- **Step 092.4:** Add unit tests verifying schema validation adapts cleanly when switching target processor.

**Primary Files & Required Path Comments:**
- `// path: app/(merchant)/onboarding/business-profile/page.tsx`
- `// path: lib/kyb/schemas/index.ts`
- `// path: tests/kyb/schemas.test.ts`

**Verification & Quality Gate:**  
Fill business profile form for Stripe vs NMI; verify form prompts for exact required processor fields.

---

### Step 093: Merchant Category Code (MCC) Registry & Risk Classifier
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build standard MCC code registry mapping merchant industries to risk tiers, reserve rates, and prohibited status.  

**Technical Architecture & Specification:**  
Implement ISO 18245 MCC catalog in `lib/constants/mcc.ts`. Provide searchable dropdown in onboarding. Automatically classify selected MCC into Risk Tier 1, Restricted Tier, or Prohibited. Assign baseline rolling reserve percentage and hold days accordingly.

**Granular Sub-Steps:**
- **Step 093.1:** Seed ISO 18245 MCC catalog in `lib/constants/mcc.ts` with code, description, risk level, and prohibited flag.
- **Step 093.2:** Build searchable MCC combobox UI component `<MccSelector value={mcc} onChange={setMcc} />`.
- **Step 093.3:** Implement automated risk classifier assigning starting reserve (10% standard, higher for elevated risk MCCs).
- **Step 093.4:** Add unit tests verifying high-risk MCCs (e.g. software subscriptions vs travel) receive proper risk classifications.

**Primary Files & Required Path Comments:**
- `// path: lib/constants/mcc.ts`
- `// path: components/onboarding/MccSelector.tsx`
- `// path: tests/compliance/mcc.test.ts`

**Verification & Quality Gate:**  
Select high-risk MCC in onboarding; verify system applies appropriate elevated risk tier and reserve rule.

---

### Step 094: Merchant Website & Storefront Authenticity Verification Engine
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build automated and manual website verification pipeline validating business authenticity, terms display, and product listings.  

**Technical Architecture & Specification:**  
Implement website review workflow in `lib/compliance/website-verify.ts`. Automated crawler checks: domain age, SSL certificate, live HTTP 200 status, presence of Terms of Service, Refund Policy, Contact info, and pricing in USD. Compliance officer performs visual inspection.

**Granular Sub-Steps:**
- **Step 094.1:** Create `merchant_websites` table tracking `url`, `crawl_status`, `ssl_valid`, `terms_found`, `refund_policy_found`, `reviewed_by`.
- **Step 094.2:** Implement automated URL crawler inspecting homepage and footer links for mandatory legal disclosures.
- **Step 094.3:** Build website review panel in compliance officer dashboard displaying embedded preview and inspection checklist.
- **Step 094.4:** Block merchant activation until website verification status transitions to `verified`.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/website-verify.ts`
- `// path: db/migrations/028_merchant_websites.sql`
- `// path: app/(office)/compliance/websites/page.tsx`

**Verification & Quality Gate:**  
Submit merchant store URL; verify automated crawler inspects SSL and legal pages, flagging for compliance sign-off.

---

### Step 095: Unified Processor KYB Document Packet Generator
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build KYB document packet aggregator packaging trade licenses, registry lookups, and tax certificates for processors.  

**Technical Architecture & Specification:**  
Construct KYB document bundle generator in `lib/kyb/packet.ts`. Assemble: business registration certificate/trade license, registered address proof (<= 90 days), corporate registry lookup result, ownership structure chart, and company tax ID certificate.

**Granular Sub-Steps:**
- **Step 095.1:** Define `KybDocumentPacket` data structure encapsulating verified documents, company metadata, and hashes.
- **Step 095.2:** Implement secure pre-upload AES-256-GCM encryption for all business registration documents.
- **Step 095.3:** Create automated packet validator verifying all mandatory processor KYB items are present before submission.
- **Step 095.4:** Write tests asserting packet completeness for corporations, partnerships, and sole proprietors.

**Primary Files & Required Path Comments:**
- `// path: lib/kyb/packet.ts`
- `// path: types/kyb.ts`
- `// path: tests/kyb/packet.test.ts`

**Verification & Quality Gate:**  
Generate KYB packet for corporate merchant; verify all mandatory documents and metadata are assembled without omissions.

---

### Step 096: Director & UBO Identity Collection & Liveness Verification Pipeline
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build director and UBO onboarding workflow collecting government IDs, proof of address, and liveness checks for all owners >= 25%.  

**Technical Architecture & Specification:**  
Construct UBO collection pipeline in `app/(merchant)/onboarding/beneficial-owners/`. Capture legal name, date of birth, residential address, nationality, national ID/passport upload, and selfie/liveness verification status for every director and UBO at or above 25% ownership.

**Granular Sub-Steps:**
- **Step 096.1:** Create `company_beneficial_owners` table with `company_id`, `full_name`, `dob`, `equity_percentage`, `id_doc_id`, `status`.
- **Step 096.2:** Enforce business logic constraint: sum of declared beneficial ownership must account for all owners holding >= 25%.
- **Step 096.3:** Integrate file upload with AES-256-GCM encryption for passports and national ID cards.
- **Step 096.4:** Add unit tests verifying application is rejected if any >=25% owner lacks identity document upload.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/029_beneficial_owners.sql`
- `// path: app/(merchant)/onboarding/beneficial-owners/page.tsx`
- `// path: lib/kyb/ubo.ts`

**Verification & Quality Gate:**  
Add two 50% shareholders; verify system mandates identity document and address proof for both individuals.

---

### Step 097: Proof of Address & Payout Bank Verification Engine
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build address and payout bank account verification pipeline enforcing 90-day utility bill and registered business name match.  

**Technical Architecture & Specification:**  
Implement proof of address and bank verification in `lib/kyb/bank-address.ts`. Verify address proof issued within 90 days (utility bill, bank statement). Verify payout bank account is registered strictly in legal business name; reject personal accounts for corporate merchants.

**Granular Sub-Steps:**
- **Step 097.1:** Implement document issue date validator: verify utility bill or bank statement timestamp is within past 90 days.
- **Step 097.2:** Implement legal name fuzzy matching comparing bank account holder name with corporate registration name.
- **Step 097.3:** If name mismatch detected, block auto-pass and route case to compliance officer for manual review.
- **Step 097.4:** Write tests verifying rejection of utility bills older than 90 days and mismatched bank beneficiary names.

**Primary Files & Required Path Comments:**
- `// path: lib/kyb/bank-address.ts`
- `// path: tests/kyb/bank-address.test.ts`

**Verification & Quality Gate:**  
Submit utility bill dated 120 days ago; verify system rejects document and requests fresh proof within 90 days.

---

### Step 098: Supplementary IDV Adapter Common Interface Specification
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Define standard TypeScript interface for supplementary identity verification (IDV) vendors (Jumio, Didit, Sumsub).  

**Technical Architecture & Specification:**  
Create adapter specification in `lib/idv/types.ts`. Define methods: `initiateVerificationSession`, `checkVerificationStatus`, `verifyWebhookSignature`, and `parseVerificationResult`. Allow Super Admin to activate at most one supplementary IDV vendor at a time.

**Granular Sub-Steps:**
- **Step 098.1:** Define `IdvAdapter` interface in `lib/idv/types.ts` with standard session and webhook contracts.
- **Step 098.2:** Define `IdvVerificationResult` with normalized fields: `idNumber`, `idType`, `dob`, `livenessPassed`, `confidenceScore`.
- **Step 098.3:** Enforce fail-closed policy: if vendor check fails or is unavailable, route case to manual review; never auto-pass.
- **Step 098.4:** Create mock IDV adapter for local testing and CI test suites.

**Primary Files & Required Path Comments:**
- `// path: lib/idv/types.ts`
- `// path: lib/idv/mock.ts`
- `// path: tests/idv/adapter-interface.test.ts`

**Verification & Quality Gate:**  
Verify TypeScript compiles mock adapter fulfilling all interface methods without type errors.

---

### Step 099: Jumio Netverify Identity Verification Adapter Implementation
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build Jumio Netverify adapter implementing document verification, biometric selfie, and liveness detection.  

**Technical Architecture & Specification:**  
Implement Jumio Netverify integration in `lib/idv/jumio.ts`. Support API session creation, redirect/iframe WebSDK integration, signature-verified webhook callback ingestion, and normalized identity result extraction.

**Granular Sub-Steps:**
- **Step 099.1:** Implement `JumioAdapter` class handling authentication, API tokens, and session initiation.
- **Step 099.2:** Implement webhook callback handler verifying Jumio HMAC signature and extracting verification decision.
- **Step 099.3:** Map Jumio status codes (PASSED, FAILED, WARNING) to platform standard verification states.
- **Step 099.4:** Add unit tests with sample Jumio webhook payloads asserting accurate status mapping.

**Primary Files & Required Path Comments:**
- `// path: lib/idv/jumio.ts`
- `// path: app/api/webhooks/idv/jumio/route.ts`
- `// path: tests/idv/jumio.test.ts`

**Verification & Quality Gate:**  
Simulate Jumio webhook with valid HMAC; verify merchant KYC record updates with Jumio verification result.

---

### Step 100: Didit Identity & Liveness Verification Adapter Implementation
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build Didit identity verification adapter implementing automated document reading and biometric liveness checks.  

**Technical Architecture & Specification:**  
Implement Didit adapter in `lib/idv/didit.ts`. Communicate with Didit REST API, initiate verification sessions, process webhook callbacks with cryptographic signature verification, and persist authoritative liveness and OCR results.

**Granular Sub-Steps:**
- **Step 100.1:** Implement `DiditAdapter` class creating verification sessions via Didit API client.
- **Step 100.2:** Implement Didit webhook verification validating API secret and event timestamp.
- **Step 100.3:** Extract OCR extracted document numbers and liveness status into platform KYC data model.
- **Step 100.4:** Write tests validating Didit payload parsing and error handling on network timeouts.

**Primary Files & Required Path Comments:**
- `// path: lib/idv/didit.ts`
- `// path: app/api/webhooks/idv/didit/route.ts`
- `// path: tests/idv/didit.test.ts`

**Verification & Quality Gate:**  
Trigger Didit test verification; verify session token returns and webhook updates verification state.

---

### Step 101: Sumsub WebSDK Identity Verification Adapter Implementation
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build Sumsub WebSDK identity verification adapter implementing applicant creation and inspection review webhooks.  

**Technical Architecture & Specification:**  
Implement Sumsub adapter in `lib/idv/sumsub.ts`. Generate Sumsub WebSDK access tokens, handle applicant level verification (identity, selfie, address), verify Sumsub HMAC-SHA256 webhook signatures, and ingest inspection review outcomes.

**Granular Sub-Steps:**
- **Step 101.1:** Implement `SumsubAdapter` class generating SDK access tokens for frontend embedding.
- **Step 101.2:** Implement webhook handler in `app/api/webhooks/idv/sumsub/route.ts` checking `x-payload-digest` HMAC header.
- **Step 101.3:** Normalize Sumsub reviewAnswer (GREEN, RED) to platform status and persist raw inspection metadata.
- **Step 101.4:** Add unit tests verifying rejection of tampered Sumsub webhook digests.

**Primary Files & Required Path Comments:**
- `// path: lib/idv/sumsub.ts`
- `// path: app/api/webhooks/idv/sumsub/route.ts`
- `// path: tests/idv/sumsub.test.ts`

**Verification & Quality Gate:**  
Generate Sumsub SDK token; verify token is valid and webhook signature verification accepts genuine payload.

---

### Step 102: IDV Vendor Registry & Single-Active-Provider Super Admin Switch
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build Super Admin control panel allowing activation of at most one supplementary IDV vendor with fail-closed manual fallback.  

**Technical Architecture & Specification:**  
Implement IDV registry in `lib/idv/registry.ts`. Allow Super Admin to configure and activate exactly one IDV vendor (Jumio, Didit, or Sumsub) or none. If no vendor is active or check fails, automatically route applications to manual compliance review.

**Granular Sub-Steps:**
- **Step 102.1:** Create `idv_settings` table storing `active_vendor` ('none' | 'jumio' | 'didit' | 'sumsub'), credentials, and updated_at.
- **Step 102.2:** Build Super Admin IDV settings page (`app/(office)/super-admin/idv/page.tsx`) with 2FA step-up confirmation.
- **Step 102.3:** Enforce business rule: vendor result never overrides payment processor KYB rejection or restriction.
- **Step 102.4:** Write tests verifying seamless fallback to manual compliance queue when no IDV adapter is active.

**Primary Files & Required Path Comments:**
- `// path: lib/idv/registry.ts`
- `// path: app/(office)/super-admin/idv/page.tsx`
- `// path: tests/idv/registry.test.ts`

**Verification & Quality Gate:**  
Switch active IDV vendor to 'none'; submit KYC application and verify it routes cleanly to manual compliance review.

---

### Step 103: Automated Daily Sanctions Screening Engine (OFAC, UN, EU, UK HMT)
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build automated daily sanctions screening engine checking merchants, directors, and UBOs against international lists.  

**Technical Architecture & Specification:**  
Implement sanctions screening in `lib/compliance/sanctions.ts`. Ingest official OFAC SDN, UN Consolidated, EU Financial Sanctions, and UK HMT lists. Execute Jaro-Winkler/Levenshtein fuzzy matching against seller legal names, director names, and UBOs at onboarding and daily.

**Granular Sub-Steps:**
- **Step 103.1:** Create `sanctions_lists` table storing entity names, aliases, list source, publication date, and hash.
- **Step 103.2:** Implement fuzzy matching algorithm with configurable similarity threshold (default 85%).
- **Step 103.3:** If potential match found, block automated activation/payout and open compliance investigation case.
- **Step 103.4:** Record list update timestamp and screening execution time in `sanctions_screening_logs`.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/sanctions.ts`
- `// path: db/migrations/030_sanctions_screening.sql`
- `// path: tests/compliance/sanctions.test.ts`

**Verification & Quality Gate:**  
Screen applicant with name matching OFAC SDN entry; verify engine flags potential match and blocks activation.

---

### Step 104: PEP & Adverse Media Screening Engine with Enhanced Due Diligence
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build Politically Exposed Persons (PEP) and adverse media screening engine triggering Enhanced Due Diligence (EDD).  

**Technical Architecture & Specification:**  
Implement PEP and adverse media screening in `lib/compliance/pep.ts`. Flag applicants holding senior public positions, military leadership, or associated with financial crime adverse media. Require documented EDD and CEO/Super Admin management sign-off.

**Granular Sub-Steps:**
- **Step 104.1:** Create `pep_screening_cases` table tracking `company_id`, `individual_name`, `pep_tier`, `adverse_media_flag`, `status`.
- **Step 104.2:** Build compliance officer EDD workspace with fields for Source of Wealth, Source of Funds, and risk rationale.
- **Step 104.3:** Enforce dual sign-off: PEP approval requires compliance officer recommendation plus CEO executive approval.
- **Step 104.4:** Write tests verifying potential PEP matches cannot be auto-cleared without formal review resolution.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/pep.ts`
- `// path: app/(office)/compliance/pep/page.tsx`
- `// path: tests/compliance/pep.test.ts`

**Verification & Quality Gate:**  
Flag sample applicant as PEP; verify activation remains blocked until Compliance and CEO complete EDD approval.

---

### Step 105: Risk-Based Underwriting & Starting Limit Assignment Calculator
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build underwriting calculator establishing initial monthly transaction volume limits and risk tier assignments.  

**Technical Architecture & Specification:**  
Implement underwriting engine in `lib/compliance/underwriting.ts`. Evaluate MCC code, business age, bank statement cash flow, and website risk. Assign new merchants strictly to Tier 1: maximum USD $500 per transaction and USD $2,500 per month, with 10% 90-day reserve.

**Granular Sub-Steps:**
- **Step 105.1:** Implement `calculateUnderwritingTiers(companyData)` returning initial tier, transaction cap, and monthly volume limit.
- **Step 105.2:** Enforce Tier 1 default: USD $500 max single charge, USD $2,500 monthly limit, 10% rolling reserve for 90 days.
- **Step 105.3:** Store approved underwriting parameters in `company_risk_profiles` table with version and reviewer references.
- **Step 105.4:** Add unit tests verifying all new approved sellers initialize strictly in Tier 1 regardless of requested volume.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/underwriting.ts`
- `// path: db/migrations/031_company_risk_profiles.sql`
- `// path: tests/compliance/underwriting.test.ts`

**Verification & Quality Gate:**  
Underwrite new merchant; verify risk profile initializes with Tier 1 caps ($500/tx, $2,500/mo, 10% reserve).

---

### Step 106: Four-Eye Compliance Review Queue for Merchant Applications
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build four-eye compliance review queue requiring two distinct compliance reviewers for large or high-risk merchants.  

**Technical Architecture & Specification:**  
Construct review queue under `app/(office)/compliance/queue/`. Standard merchants require one compliance review; merchants in high-risk MCCs or requesting elevated volumes require dual compliance review (first reviewer and second reviewer) before CEO approval.

**Granular Sub-Steps:**
- **Step 106.1:** Create `kyc_reviews` table storing `company_id`, `first_reviewer_id`, `second_reviewer_id`, `decision`, `notes`.
- **Step 106.2:** Enforce business logic rule: `first_reviewer_id !== second_reviewer_id`.
- **Step 106.3:** Build reviewer interface displaying KYB document packet, website inspection results, and sanctions check logs.
- **Step 106.4:** Advance application to CEO queue only after all required compliance review signatures are recorded.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/compliance/queue/page.tsx`
- `// path: app/(office)/compliance/queue/[id]/page.tsx`
- `// path: lib/compliance/review.ts`

**Verification & Quality Gate:**  
Review high-risk application; verify first reviewer approval leaves case in queue awaiting second reviewer sign-off.

---

### Step 107: CEO Final KYC Approval & Super Admin Provisioning Authorization Gate
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build final executive sign-off gate requiring CEO approval and Super Admin authority before sub-merchant creation.  

**Technical Architecture & Specification:**  
Implement executive onboarding sign-off in `app/(office)/ceo/kyc-approvals/`. Following compliance review and payment processor authoritative KYB verification, CEO provides final executive approval, triggering automatic sub-merchant gateway provisioning.

**Granular Sub-Steps:**
- **Step 107.1:** Create CEO approval route `POST /api/office/ceo/kyc-approvals/[id]/approve` requiring step-up reauthentication.
- **Step 107.2:** Verify processor-side authoritative KYB status is `verified` before permitting platform approval.
- **Step 107.3:** Trigger sub-merchant provisioning job upon successful CEO sign-off.
- **Step 107.4:** Audit log final approval event in `audit_logs` with CEO actor ID, policy version, and timestamp.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/ceo/kyc-approvals/page.tsx`
- `// path: app/api/office/ceo/kyc-approvals/[id]/approve/route.ts`
- `// path: lib/compliance/ceo-approval.ts`

**Verification & Quality Gate:**  
Execute CEO final approval; verify merchant status updates to `approved` and provisioning job enqueues.

---

### Step 108: Suspicious Activity Report (SAR) Case Management Subsystem
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build confidential Suspicious Activity Report (SAR) workspace strictly restricted to Compliance and Super Admin roles.  

**Technical Architecture & Specification:**  
Construct confidential SAR management system in `lib/compliance/sar.ts`. System prepares internal case file, document pack, and transaction timeline. Strictly hide SAR data from merchant owner and support staff (tipping-off prevention).

**Granular Sub-Steps:**
- **Step 108.1:** Create `sar_cases` table storing `case_number`, `company_id`, `narrative`, `suspect_details`, `status` (draft, filed, closed).
- **Step 108.2:** Install database RLS and route guards restricting SAR table access strictly to `compliance_kyc` and `super_admin`.
- **Step 108.3:** Assemble automated evidence document pack: transaction logs, IP addresses, device fingerprints, and KYC documents.
- **Step 108.4:** Add unit tests verifying sub-merchant or support role queries to SAR endpoints receive 403 Forbidden.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/032_sar_cases.sql`
- `// path: lib/compliance/sar.ts`
- `// path: app/(office)/compliance/sar/[id]/page.tsx`

**Verification & Quality Gate:**  
Query SAR endpoints as sub-merchant or support; verify zero records returned and access logged as unauthorized attempt.

---

### Step 109: Periodic Re-KYC Scheduling & Event-Triggered Review Engine
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build Re-KYC engine scheduling reviews every 12 months (Tier 3) or 24 months (Tiers 1/2) and triggering on bank/volume spikes.  

**Technical Architecture & Specification:**  
Construct re-verification scheduler in `lib/compliance/re-kyc.ts`. Enforce 12-month re-KYC for Tier 3 and 24-month for Tiers 1 and 2. Automatically trigger immediate re-KYC upon bank account change, corporate ownership change, or sudden 3x volume spike.

**Granular Sub-Steps:**
- **Step 109.1:** Create `re_kyc_schedules` table tracking `company_id`, `due_date`, `trigger_reason`, `status` (scheduled, in_progress, cleared).
- **Step 109.2:** Implement event triggers hooking into bank update, UBO equity modification, and volume anomaly detection.
- **Step 109.3:** If re-KYC overdue or unresolved, restrict merchant payout and offer creation capabilities under approved policy.
- **Step 109.4:** Write tests verifying re-KYC trigger fires automatically when sub-merchant updates payout bank account.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/re-kyc.ts`
- `// path: db/migrations/033_re_kyc_schedules.sql`
- `// path: tests/compliance/re-kyc.test.ts`

**Verification & Quality Gate:**  
Mutate merchant bank account; verify system schedules immediate event-triggered re-KYC and freezes payouts.

---

### Step 110: Sub-Merchant Auto-Provisioning Pipeline & Multi-Gateway Sync
**Phase:** Phase 7: Merchant Onboarding, KYB/KYC & IDV Verification Adapters  
**Objective:** Build asynchronous sub-merchant provisioning worker syncing provider submerchant IDs, capabilities, and webhook listeners.  

**Technical Architecture & Specification:**  
Implement automated provisioning worker in `lib/processors/provisioning.ts`. Upon CEO approval, create sub-merchant accounts across connected payment gateways (NMI, Stripe, Rainforest, Airwallex). Persist provider submerchant IDs and sync capabilities via webhooks.

**Granular Sub-Steps:**
- **Step 110.1:** Create `submerchant_accounts` table storing `company_id`, `provider_name`, `provider_submerchant_id`, `status`, `capabilities`.
- **Step 110.2:** Implement background job calling provider sub-merchant provisioning APIs with idempotent retry logic.
- **Step 110.3:** If no master platform gateway account is connected, queue provisioning and raise urgent alert to office team.
- **Step 110.4:** Enable product listings, payments, and payouts only after both processor verification and platform risk checks pass.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/provisioning.ts`
- `// path: db/migrations/034_submerchant_accounts.sql`
- `// path: tests/processors/provisioning.test.ts`

**Verification & Quality Gate:**  
Trigger provisioning worker for approved merchant; verify provider sub-merchant IDs are generated and stored in database.

---

## Phase 8: Payment Processor Adapters & Gateway Architecture

### Step 111: Unified Payment Processor Adapter Interface Specification
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Define standard TypeScript interface for payment processor adapters covering charges, refunds, payouts, and webhooks.  

**Technical Architecture & Specification:**  
Establish the unified gateway contract in `lib/processors/types.ts`. Standardize method signatures: `createSubMerchant`, `authorizePayment`, `capturePayment`, `refundPayment`, `createPayout`, `verifyWebhook`, and `testConnection` across all five platform providers.

**Granular Sub-Steps:**
- **Step 111.1:** Define `PaymentProcessorAdapter` interface in `lib/processors/types.ts` with strict TypeScript typings.
- **Step 111.2:** Define standardized request and response types: `AuthorizeRequest`, `ChargeResult`, `RefundResult`, `PayoutResult`.
- **Step 111.3:** Normalize gateway error codes into platform standard `GatewayError` classes.
- **Step 111.4:** Create mock payment processor adapter for automated integration tests and developer sandbox.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/types.ts`
- `// path: lib/processors/mock.ts`
- `// path: tests/processors/interface.test.ts`

**Verification & Quality Gate:**  
Verify TypeScript compiles mock processor adapter fulfilling all interface methods without type errors.

---

### Step 112: Payment Processor Registry & Capability Matrix
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build central payment processor registry cataloging all 5 providers and their supported capability matrix.  

**Technical Architecture & Specification:**  
Create provider registry in `lib/processors/registry.ts`. Register all 5 launch providers: NMI, Payoneer, Rainforest, Stripe Connect, and Airwallex. Document capability matrix: card acceptance, e-wallets, sub-merchant creation, payouts, and supported countries.

**Granular Sub-Steps:**
- **Step 112.1:** Create `lib/processors/registry.ts` mapping provider slugs to adapter implementations and metadata.
- **Step 112.2:** Define capability matrix: NMI (cards/sub-merchants), Payoneer (payouts), Rainforest (cards/sub-merchants), Stripe (cards/wallets/payouts), Airwallex (global/payouts).
- **Step 112.3:** Implement registry lookup methods: `getAdapter(slug)`, `getAvailableProcessors(country, capability)`.
- **Step 112.4:** Add unit tests verifying registry returns correct adapter instances and capability flags.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/registry.ts`
- `// path: types/processors.ts`
- `// path: tests/processors/registry.test.ts`

**Verification & Quality Gate:**  
Query registry for payout-capable providers; verify registry returns Payoneer, Airwallex, and Stripe.

---

### Step 113: NMI Official Adapter Implementation with Collect.js Token Exchange
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build official NMI adapter consuming Collect.js hosted payment tokens and executing charges via NMI Three-Step/REST API.  

**Technical Architecture & Specification:**  
Implement official NMI adapter in `lib/processors/nmi.ts` following nmi.com and docs.nmi.com specifications. Browser collects card data strictly through Collect.js hosted fields (secure.nmi.com/token/Collect.js) returning a payment token. Server exchanges token for payment via NMI API. Server never sees raw card number, expiry, or CVV.

**Granular Sub-Steps:**
- **Step 113.1:** Implement `NmiAdapter` class handling API authentication via security keys or username/password.
- **Step 113.2:** Implement `authorizePayment` and `capturePayment` exchanging Collect.js token (`payment_token`) via NMI Direct Post / REST API.
- **Step 113.3:** Implement `refundPayment` sending transaction ID and amount to NMI refund endpoint.
- **Step 113.4:** Parse NMI response codes (1=Approved, 2=Declined, 3=Error), AVS responses, and CVV match codes.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/nmi.ts`
- `// path: lib/processors/nmi-types.ts`
- `// path: tests/processors/nmi.test.ts`

**Verification & Quality Gate:**  
Execute sandbox NMI token exchange; verify authorization succeeds with response code 1 and zero raw card data processed.

---

### Step 114: NMI Sub-Merchant Gateway Provisioning Client
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build automated NMI sub-merchant onboarding client provisioning merchant accounts through the NMI partner gateway API.  

**Technical Architecture & Specification:**  
Implement NMI sub-merchant provisioning in `lib/processors/nmi-submerchant.ts`. Transmit approved merchant business details, processing limits, and MCC code to NMI gateway partner API. Store returned gateway sub-merchant ID and credentials.

**Granular Sub-Steps:**
- **Step 114.1:** Implement `createNmiSubMerchant(companyData)` calling NMI affiliate/partner gateway creation endpoint.
- **Step 114.2:** Transmit required NMI fields: business legal name, address, tax ID, representative details, and MCC.
- **Step 114.3:** Store resulting NMI merchant ID and API keys encrypted in `submerchant_accounts` table.
- **Step 114.4:** Write tests verifying sub-merchant provisioning payload matches official NMI partner documentation.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/nmi-submerchant.ts`
- `// path: tests/processors/nmi-submerchant.test.ts`

**Verification & Quality Gate:**  
Provision test NMI sub-merchant; verify NMI returns gateway account ID and credentials are encrypted at rest.

---

### Step 115: Payoneer Global Payout Adapter Implementation
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build Payoneer payout adapter automatically registering merchant bank accounts and disbursing approved payouts.  

**Technical Architecture & Specification:**  
Implement Payoneer integration in `lib/processors/payoneer.ts`. Automatically link payout bank account added in merchant profile to Payoneer Mass Payouts API. Disburse approved settlement payouts in USD and ingest payout status webhooks.

**Granular Sub-Steps:**
- **Step 115.1:** Implement `PayoneerAdapter` class connecting to Payoneer Mass Payouts REST API with OAuth2 client credentials.
- **Step 115.2:** Implement `registerPayoutBank(companyId, bankDetails)` creating payee and bank account record in Payoneer.
- **Step 115.3:** Implement `createPayout(payoutBatchId, amount, payeeId)` submitting payout instruction.
- **Step 115.4:** Process Payoneer payout status webhooks (SUBMITTED, COMPLETED, FAILED) and update ledger entries.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/payoneer.ts`
- `// path: app/api/webhooks/payment/payoneer/route.ts`
- `// path: tests/processors/payoneer.test.ts`

**Verification & Quality Gate:**  
Simulate Payoneer payout creation; verify payout ID generated and webhook transitions payout to completed.

---

### Step 116: Rainforest Payment Acceptance & Sub-Merchant Creation Adapter
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build Rainforest (rainforestpay.com) adapter for PayFac sub-merchant onboarding and embedded payment processing.  

**Technical Architecture & Specification:**  
Implement Rainforest adapter in `lib/processors/rainforest.ts` per rainforestpay.com API. Support automated sub-merchant merchant creation, hosted field card tokenization session generation, payment intents, and signature-verified webhook ingestion.

**Granular Sub-Steps:**
- **Step 116.1:** Implement `RainforestAdapter` class communicating with Rainforest REST API with bearer authentication.
- **Step 116.2:** Implement `createSubMerchant` creating Rainforest merchant entity with legal and KYB details.
- **Step 116.3:** Implement `authorizePayment` and `capturePayment` using Rainforest payment methods and card tokens.
- **Step 116.4:** Verify Rainforest webhook HMAC signatures and process merchant capability update events.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/rainforest.ts`
- `// path: app/api/webhooks/payment/rainforest/route.ts`
- `// path: tests/processors/rainforest.test.ts`

**Verification & Quality Gate:**  
Create test sub-merchant on Rainforest sandbox; verify merchant ID returned and payment session created.

---

### Step 117: Stripe Connect Custom & Express Sub-Merchant Adapter
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build Stripe Connect adapter managing connected accounts, PaymentIntents, and destination charge payouts.  

**Technical Architecture & Specification:**  
Implement Stripe Connect integration in `lib/processors/stripe.ts` using `stripe` SDK. Create connected accounts, process PaymentIntents with Stripe Elements hosted fields, handle destination charges with application fees, and manage payouts.

**Granular Sub-Steps:**
- **Step 117.1:** Implement `StripeAdapter` class initializing Stripe client with encrypted platform master secret key.
- **Step 117.2:** Implement `createSubMerchant` creating Stripe Connect account with capability requests (card_payments, transfers).
- **Step 117.3:** Implement PaymentIntent creation with `transfer_data[destination]` and `application_fee_amount`.
- **Step 117.4:** Process Stripe webhooks (`payment_intent.succeeded`, `charge.dispute.created`, `account.updated`) with signature verification.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/stripe.ts`
- `// path: app/api/webhooks/payment/stripe/route.ts`
- `// path: tests/processors/stripe.test.ts`

**Verification & Quality Gate:**  
Create Stripe PaymentIntent; verify connected account destination transfer and webhook signature validation.

---

### Step 118: Airwallex Connected Accounts & Payment/Payout Adapter
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build Airwallex (airwallex.com) adapter for Asian/global payment acceptance, connected accounts, and payouts.  

**Technical Architecture & Specification:**  
Implement Airwallex integration in `lib/processors/airwallex.ts`. Support Airwallex connected account onboarding, hosted card elements/e-wallet checkout sessions, cross-border payouts, and signature-verified webhook processing.

**Granular Sub-Steps:**
- **Step 118.1:** Implement `AirwallexAdapter` class handling API client authentication and token refresh.
- **Step 118.2:** Implement connected account creation passing sub-merchant business identity and beneficial ownership data.
- **Step 118.3:** Implement `createPaymentIntent` and `createPayout` for Asian local payment methods and SWIFT bank payouts.
- **Step 118.4:** Verify Airwallex webhook RSA/HMAC signatures and dispatch events to ledger worker.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/airwallex.ts`
- `// path: app/api/webhooks/payment/airwallex/route.ts`
- `// path: tests/processors/airwallex.test.ts`

**Verification & Quality Gate:**  
Execute test charge on Airwallex sandbox; verify payment intent confirms and webhook verifies cleanly.

---

### Step 119: Gateway Architecture Extension Point for Future Providers
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Design hot-pluggable gateway extension point enabling addition of new payment providers without refactoring core code.  

**Technical Architecture & Specification:**  
Implement open-closed architecture for payment gateways in `lib/processors/factory.ts`. Any new provider adapter fulfilling `PaymentProcessorAdapter` and added to `registry.ts` automatically surfaces in Super Admin dashboard and routing rules.

**Granular Sub-Steps:**
- **Step 119.1:** Implement dynamic adapter loader in `lib/processors/factory.ts` resolving provider from database configuration.
- **Step 119.2:** Ensure core payment engine relies strictly on `PaymentProcessorAdapter` interface without provider-specific branching.
- **Step 119.3:** Build admin UI dynamically rendering gateway configuration cards based on registered providers.
- **Step 119.4:** Add unit tests verifying a dummy 6th adapter can be registered and called without modifying checkout routes.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/factory.ts`
- `// path: docs/gateways/ADDING_A_PROVIDER.md`
- `// path: tests/processors/factory.test.ts`

**Verification & Quality Gate:**  
Register mock provider; verify admin gateway management page displays new provider card automatically.

---

### Step 120: Super Admin Gateway Management Dashboard with 2FA Step-Up
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build Super Admin gateway configuration console with mandatory 2FA step-up reauthentication and zero code change activation.  

**Technical Architecture & Specification:**  
Construct gateway administration console under `app/(office)/super-admin/gateways/`. Restrict strictly to Super Admin role with fresh 2FA reauthentication within 5 minutes. Allow adding, testing, enabling, and disabling gateway credentials without redeploying code.

**Granular Sub-Steps:**
- **Step 120.1:** Create gateway management layout and list in `app/(office)/super-admin/gateways/page.tsx`.
- **Step 120.2:** Enforce step-up reauthentication modal before allowing viewing or editing of gateway parameters.
- **Step 120.3:** Provide toggles for enable/disable; prevent enabling any provider whose connection test fails.
- **Step 120.4:** Audit log all gateway credential additions, toggles, and tests in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/super-admin/gateways/page.tsx`
- `// path: components/admin/GatewayConfigCard.tsx`
- `// path: lib/processors/admin.ts`

**Verification & Quality Gate:**  
Access gateway console; verify step-up 2FA is required and disabled provider cannot be toggled without valid connection test.

---

### Step 121: AES-256-GCM Gateway Credential Encryption & Masked UI
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Enforce AES-256-GCM encryption at rest for all gateway API keys and secrets with masked UI display.  

**Technical Architecture & Specification:**  
Per KD Solution IT security mandate: all gateway API keys, client secrets, and webhook secrets must be AES-256-GCM encrypted before storage in `gateway_credentials` table. After saving, full key is never displayed again; show only last 4 chars and update time.

**Granular Sub-Steps:**
- **Step 121.1:** Create `gateway_credentials` table storing `provider_slug`, `encrypted_payload`, `last4`, `version`, `is_active`.
- **Step 121.2:** Encrypt credentials using domain-derived AES-256-GCM subkey prior to database insert/update.
- **Step 121.3:** Never return plaintext secret in API responses; send only masked string (e.g. `••••••••••••a1b2`).
- **Step 121.4:** Write tests verifying database query on `gateway_credentials` returns only ciphertext buffers.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/035_gateway_credentials.sql`
- `// path: lib/processors/credentials.ts`
- `// path: tests/processors/credentials.test.ts`

**Verification & Quality Gate:**  
Inspect raw database row for Stripe secret key; verify data is encrypted ciphertext and UI displays masked last 4.

---

### Step 122: Built-in Live Gateway Connection Test Harness
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build automated connection test harness executing live sandbox API ping before allowing gateway activation.  

**Technical Architecture & Specification:**  
Implement live connection tester in `lib/processors/test-connection.ts`. Call provider balance or account endpoint with entered credentials. Require 100% successful ping response before enabling gateway toggle in Super Admin dashboard.

**Granular Sub-Steps:**
- **Step 122.1:** Implement `testGatewayConnection(providerSlug, credentials)` calling provider test endpoint.
- **Step 122.2:** Expose endpoint `POST /api/office/gateways/[provider]/test` with detailed latency and diagnostic output.
- **Step 122.3:** Enforce business rule: if connection test fails or times out, block gateway activation toggle.
- **Step 122.4:** Write unit tests simulating connection success and failure handling across all 5 providers.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/test-connection.ts`
- `// path: app/api/office/gateways/[provider]/test/route.ts`
- `// path: tests/processors/test-connection.test.ts`

**Verification & Quality Gate:**  
Click 'Test Connection' with invalid API key; verify error diagnostics display and activation toggle remains disabled.

---

### Step 123: Deterministic Payment Routing Rules Engine with Fail-Closed Guard
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build deterministic payment routing rules engine routing transactions by currency, country, and card brand.  

**Technical Architecture & Specification:**  
Implement routing engine in `lib/processors/routing.ts`. Evaluate transaction parameters: merchant country, payer country, currency (USD), card brand, and sub-merchant connected accounts. Route to optimal gateway. If no rule matches, fail closed (reject payment); never silently reroute.

**Granular Sub-Steps:**
- **Step 123.1:** Create `payment_routing_rules` table storing `priority`, `conditions` (country, currency, mcc), `target_provider`.
- **Step 123.2:** Implement `resolvePaymentProcessor(txContext)` evaluating prioritized rules deterministically.
- **Step 123.3:** Enforce fail-closed guard: if no routing rule matches, throw `UnroutablePaymentError` and reject transaction.
- **Step 123.4:** Write tests verifying payment is rejected rather than sent to incorrect fallback provider when rules do not match.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/routing.ts`
- `// path: db/migrations/036_payment_routing_rules.sql`
- `// path: tests/processors/routing.test.ts`

**Verification & Quality Gate:**  
Submit payment with unsupported currency or unrouted country; verify system rejects payment with clean error.

---

### Step 124: Provider Verification Status & Account Capability Synchronization
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build provider capability synchronizer persisting independent verification states for each connected processor.  

**Technical Architecture & Specification:**  
Implement capability tracker in `lib/processors/sync-status.ts`. Payment processors own their sub-merchant KYB decision. Store independent status for each provider: `pending`, `action_required`, `verified`, `restricted`, `rejected`. Verification from one provider never satisfies another.

**Granular Sub-Steps:**
- **Step 124.1:** Update `submerchant_accounts` table tracking `verification_status` and `capabilities` (charges_enabled, payouts_enabled).
- **Step 124.2:** Sync capabilities via signature-verified idempotent webhook handlers from each provider.
- **Step 124.3:** Enforce rule: seller charges stay disabled for a provider until that specific provider reports verified status.
- **Step 124.4:** Audit log all provider capability transitions with provider timestamp and raw payload hash.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/sync-status.ts`
- `// path: tests/processors/sync-status.test.ts`

**Verification & Quality Gate:**  
Simulate provider webhook restricting payouts; verify platform updates capability state and blocks payouts for that provider.

---

### Step 125: Master Platform Account Connection Queue & Missing-Key Alerting
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build queue handler pausing sub-merchant provisioning and alerting office if master platform gateway keys are missing.  

**Technical Architecture & Specification:**  
Implement safeguard in `lib/processors/master-account.ts`. If an approved merchant requires provisioning on a gateway where master platform account credentials are not configured, hold provisioning in queued state and trigger urgent dashboard/email alerts to office.

**Granular Sub-Steps:**
- **Step 125.1:** Implement `verifyMasterAccountConfigured(providerSlug)` checking active credentials before provisioning.
- **Step 125.2:** If credentials missing, set provisioning status to `queued_missing_master_credentials`.
- **Step 125.3:** Dispatch notification to Super Admin and CEO requesting gateway credential configuration.
- **Step 125.4:** Write tests verifying provisioning job retries cleanly once master gateway credentials are saved.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/master-account.ts`
- `// path: tests/processors/master-account.test.ts`

**Verification & Quality Gate:**  
Attempt sub-merchant provisioning without master gateway key; verify job queues safely and alerts office team.

---

### Step 126: Multi-Provider Webhook Ingestion Router & Payload Dispatcher
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build unified webhook router receiving webhooks from all 5 providers with signature verification and event dispatching.  

**Technical Architecture & Specification:**  
Construct central webhook ingestion endpoint `app/api/webhooks/payment/[provider]/route.ts`. Route incoming payloads to provider-specific signature verification modules, store raw events in database, and dispatch asynchronous worker jobs.

**Granular Sub-Steps:**
- **Step 126.1:** Create dynamic route `app/api/webhooks/payment/[provider]/route.ts` supporting POST requests.
- **Step 126.2:** Read raw request body buffer before any JSON parsing to allow precise cryptographic HMAC signature verification.
- **Step 126.3:** Dispatch verified event to background queue worker for asynchronous ledger and notification processing.
- **Step 126.4:** Return HTTP 200/202 response to provider within 2 seconds to prevent provider webhook delivery retries.

**Primary Files & Required Path Comments:**
- `// path: app/api/webhooks/payment/[provider]/route.ts`
- `// path: lib/webhooks/dispatcher.ts`
- `// path: tests/webhooks/router.test.ts`

**Verification & Quality Gate:**  
Send test webhook to `/api/webhooks/payment/stripe`; verify raw payload captured, verified, and enqueued.

---

### Step 127: Processor-Specific Webhook Signature Verification Modules
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build cryptographic webhook signature verification modules for NMI, Stripe, Rainforest, Airwallex, and Payoneer.  

**Technical Architecture & Specification:**  
Implement signature verifiers in `lib/webhooks/signatures/`. Verify Stripe `Stripe-Signature` header (timestamp + v1 HMAC), NMI MD5/SHA256 hash checks, Rainforest HMAC-SHA256, Airwallex RSA/HMAC, and Payoneer webhook tokens. Reject unverified webhooks with HTTP 401.

**Granular Sub-Steps:**
- **Step 127.1:** Implement `verifyStripeWebhook(rawBody, signature, secret)` using Stripe SDK.
- **Step 127.2:** Implement `verifyNmiWebhook(payload, receivedHash, secretKey)` using HMAC-SHA256.
- **Step 127.3:** Implement Rainforest, Airwallex, and Payoneer signature verifiers in dedicated modules.
- **Step 127.4:** Add unit tests verifying rejection of webhooks with expired timestamps or tampered signatures.

**Primary Files & Required Path Comments:**
- `// path: lib/webhooks/signatures/stripe.ts`
- `// path: lib/webhooks/signatures/nmi.ts`
- `// path: lib/webhooks/signatures/rainforest.ts`
- `// path: lib/webhooks/signatures/airwallex.ts`
- `// path: lib/webhooks/signatures/payoneer.ts`

**Verification & Quality Gate:**  
Submit webhook with altered payload byte; verify signature validator rejects request with HTTP 401 Unauthorized.

---

### Step 128: Webhook Idempotency & Distributed Event Lock Engine
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build webhook deduplication and event locking engine preventing duplicate processing of retried webhook events.  

**Technical Architecture & Specification:**  
Implement deduplication engine in `lib/webhooks/idempotency.ts`. Store incoming event IDs in `webhook_events` table with unique constraint on `(provider, event_id)`. Acquire database lock during processing to prevent concurrent execution of duplicate webhook deliveries.

**Granular Sub-Steps:**
- **Step 128.1:** Create `webhook_events` table tracking `provider`, `event_id`, `status` (pending, processing, completed, failed), `payload`.
- **Step 128.2:** Implement `acquireWebhookLock(provider, eventId)` returning false if event is already processing or completed.
- **Step 128.3:** If event previously completed, return HTTP 200 immediately without re-executing ledger or status changes.
- **Step 128.4:** Write tests simulating identical webhook delivered 5 times concurrently; verify exactly 1 execution occurs.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/037_webhook_events.sql`
- `// path: lib/webhooks/idempotency.ts`
- `// path: tests/webhooks/idempotency.test.ts`

**Verification & Quality Gate:**  
Post identical Stripe event 3 times; verify only first execution mutates ledger and subsequent calls return cached 200.

---

### Step 129: Processor Fee Modeling & Interchange++ Cost Tracking Engine
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Build gateway fee modeling engine calculating processor interchange and fixed transaction costs per transaction.  

**Technical Architecture & Specification:**  
Implement fee calculator in `lib/processors/fees.ts`. Model Interchange++ and flat fees for each connected processor (e.g. 2.9% + $0.30 for standard cards, lower for ACH/debit). Record estimated and reconciled processor costs for margin analysis.

**Granular Sub-Steps:**
- **Step 129.1:** Create `processor_fee_schedules` table storing percentage rate, fixed fee, and international surcharge per provider.
- **Step 129.2:** Implement `calculateProcessorCost(amount, provider, cardBrand, isInternational)` using `numeric(18,4)` Decimal math.
- **Step 129.3:** Record processor fee debit on transaction record alongside platform fee deduction.
- **Step 129.4:** Write tests verifying precision of fee calculations across domestic and international payment scenarios.

**Primary Files & Required Path Comments:**
- `// path: lib/processors/fees.ts`
- `// path: db/migrations/038_processor_fee_schedules.sql`
- `// path: tests/processors/fees.test.ts`

**Verification & Quality Gate:**  
Calculate processor cost for $100 international transaction; verify Decimal math calculates exact fees without rounding drift.

---

### Step 130: Gateway Official Documentation & Verified Sandbox URLs Registry
**Phase:** Phase 8: Payment Processor Adapters & Gateway Architecture  
**Objective:** Document official verified documentation URLs and sandbox testing portals for all 5 payment processors.  

**Technical Architecture & Specification:**  
Per KD Solution IT architectural rules: record verified official documentation URLs and sandbox test resources in `docs/gateways/VERIFIED_URLS.md`. Ensure all adapter implementations align directly with verified provider documentation.

**Granular Sub-Steps:**
- **Step 130.1:** Create `docs/gateways/VERIFIED_URLS.md` cataloging official documentation and sandbox URLs for all 5 processors.
- **Step 130.2:** Document NMI Collect.js tokenization endpoints (https://secure.nmi.com/token/Collect.js) and Direct Post docs (docs.nmi.com).
- **Step 130.3:** Document Rainforest (rainforestpay.com), Stripe Connect, Airwallex (airwallex.com), and Payoneer official developer docs.
- **Step 130.4:** Include test card numbers, sandbox error simulation codes, and webhook testing CLI commands for each provider.

**Primary Files & Required Path Comments:**
- `// path: docs/gateways/VERIFIED_URLS.md`
- `// path: docs/gateways/TEST_CARDS.md`

**Verification & Quality Gate:**  
Review `docs/gateways/VERIFIED_URLS.md`; verify all 5 provider doc links, endpoints, and test card catalogs are present.

---

## Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security

### Step 131: Cardholder Data Environment (CDE) Complete Isolation Architecture
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Enforce strict PCI-DSS SAQ A scope ensuring raw card numbers, CVVs, and expiry dates never touch platform servers.  

**Technical Architecture & Specification:**  
Establish platform card security architecture in `docs/security/CDE_ISOLATION.md`. Card data is entered solely inside provider-hosted secure iframes (NMI Collect.js and Stripe Elements). Platform servers and databases handle only one-time payment tokens. Keylogging or scraping is physically impossible.

**Granular Sub-Steps:**
- **Step 131.1:** Implement AST scanner forbidding any form input fields named `cardNumber`, `cvv`, or `expiry` on platform domains.
- **Step 131.2:** Configure Content Security Policy (CSP) headers restricting iframe sources strictly to authorized payment providers.
- **Step 131.3:** Implement server-side payload scanner raising security alerts if any incoming request body contains 13-19 digit PAN strings.
- **Step 131.4:** Document PCI DSS SAQ A architecture and scope reduction boundaries in `docs/security/CDE_ISOLATION.md`.

**Primary Files & Required Path Comments:**
- `// path: docs/security/CDE_ISOLATION.md`
- `// path: scripts/scan-pan-leakage.ts`
- `// path: middleware.ts`

**Verification & Quality Gate:**  
Run PAN leakage scanner across codebase; verify zero input fields or API routes handle raw card data.

---

### Step 132: NMI Collect.js Hosted Tokenization Front-End Component
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build React client component loading NMI Collect.js hosted fields and returning secure one-time payment tokens.  

**Technical Architecture & Specification:**  
Implement NMI hosted fields component in `components/checkout/CollectJsField.tsx`. Load `https://secure.nmi.com/token/Collect.js`, inject hosted iframes for card number, CVV, and expiration, handle card validation, and emit one-time payment token on submission.

**Granular Sub-Steps:**
- **Step 132.1:** Create `CollectJsField.tsx` loading script dynamically with integrity checking and error fallback.
- **Step 132.2:** Configure Collect.js custom styling matching platform design system tokens.
- **Step 132.3:** Handle `CollectJS.configure` callback extracting one-time payment token upon user submission.
- **Step 132.4:** Display clear inline validation errors for invalid card numbers or expired dates directly from Collect.js callbacks.

**Primary Files & Required Path Comments:**
- `// path: components/checkout/CollectJsField.tsx`
- `// path: types/collectjs.d.ts`
- `// path: tests/checkout/collectjs.test.tsx`

**Verification & Quality Gate:**  
Render checkout form; verify NMI Collect.js iframes render securely and token callback fires on form submit.

---

### Step 133: Stripe Elements & Hosted Secure Fields Component
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build React client component embedding Stripe Elements for card, Apple Pay, and Google Pay tokenization.  

**Technical Architecture & Specification:**  
Implement Stripe Elements component in `components/checkout/StripeField.tsx` using `@stripe/react-stripe-js`. Embed hosted card element, enable digital wallets (Apple Pay, Google Pay), and confirm PaymentIntents securely in client browser.

**Granular Sub-Steps:**
- **Step 133.1:** Create `StripeField.tsx` wrapping checkout form in `<Elements stripe={stripePromise}>`.
- **Step 133.2:** Configure unified Payment Element supporting cards, Apple Pay, and Google Pay.
- **Step 133.3:** Handle client-side `stripe.confirmPayment` flow with automated redirect and return URL handling.
- **Step 133.4:** Add unit tests verifying Stripe elements mount properly and handle payment method creation.

**Primary Files & Required Path Comments:**
- `// path: components/checkout/StripeField.tsx`
- `// path: lib/payment/stripe-client.ts`
- `// path: tests/checkout/stripe-field.test.tsx`

**Verification & Quality Gate:**  
Load Stripe checkout element; verify payment element mounts and initiates client-side confirmation.

---

### Step 134: 3D Secure 2.0 (3DS2) Authentication & Liability Shift Engine
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Enforce 3D Secure 2.0 challenge and frictionless authentication on all card payments to secure fraud liability shift.  

**Technical Architecture & Specification:**  
Implement 3DS2 flow in `lib/payment/three-ds.ts`. Request 3DS authentication on every card transaction. Support frictionless flow and step-up challenge modals. Verify ECI (Electronic Commerce Indicator) and CAVV results to confirm fraud liability shift to card issuer.

**Granular Sub-Steps:**
- **Step 134.1:** Implement `initiate3dsAuthentication(paymentData, provider)` triggering 3DS2 enrollment check.
- **Step 134.2:** Handle 3DS challenge redirect / iframe modal component `<ThreeDsChallengeModal url={challengeUrl} />`.
- **Step 134.3:** Verify liability shift status: ECI 05/02 (liability shifted) vs ECI 07/00 (liability not shifted).
- **Step 134.4:** Record 3DS authentication result, CAVV, and XID on payment record for dispute defense.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/three-ds.ts`
- `// path: components/checkout/ThreeDsChallengeModal.tsx`
- `// path: tests/payment/three-ds.test.ts`

**Verification & Quality Gate:**  
Simulate 3DS challenge test card; verify modal displays, challenge completes, and liability shift status is recorded.

---

### Step 135: Non-3DS AVS & Payer IP Country Match Verification Fallback
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build risk fallback for non-3DS payments requiring billing postal code and payer IP country match before capture.  

**Technical Architecture & Specification:**  
Per KD Solution IT security policy: when 3DS cannot be completed, capture happens only if billing postal code (AVS match) and payer IP geolocation country both match the invoice data. If either mismatches, capture is blocked and payment routes to manual review.

**Granular Sub-Steps:**
- **Step 135.1:** Implement `verifyNon3dsRiskFallback(avsResult, payerIp, invoiceData)` in `lib/payment/avs-check.ts`.
- **Step 135.2:** Inspect AVS postal match code (Y, X, D, F) against invoice postal code.
- **Step 135.3:** Resolve payer country from IP address via GeoIP lookup and compare against invoice billing country.
- **Step 135.4:** If postal or country mismatches, block immediate capture, set status to `in_review`, and alert compliance team.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/avs-check.ts`
- `// path: tests/payment/avs-check.test.ts`

**Verification & Quality Gate:**  
Simulate non-3DS transaction with mismatched IP country; verify capture is blocked and payment moves to manual review.

---

### Step 136: Card & IP Transaction Velocity Rate Limiting Engine
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build velocity filter detecting card testing attacks and rapid multi-attempt fraud by card hash and IP address.  

**Technical Architecture & Specification:**  
Construct transaction velocity limiter in `lib/payment/velocity.ts`. Track charge frequency per card fingerprint (max 3 attempts per hour, max 5 per day) and per IP address (max 10 attempts per hour). Block card testing attacks and rate limit abusive sources.

**Granular Sub-Steps:**
- **Step 136.1:** Create `payment_velocity_records` table tracking `card_fingerprint`, `ip_address`, `window_start`, `attempt_count`.
- **Step 136.2:** Implement `checkPaymentVelocity(cardFingerprint, ip)` checking sliding window counts.
- **Step 136.3:** If velocity exceeded, reject transaction with `CardVelocityLimitExceededError` and temporary IP block.
- **Step 136.4:** Write tests simulating rapid card testing script; verify engine blocks further attempts after 3 rapid submissions.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/velocity.ts`
- `// path: db/migrations/039_payment_velocity.sql`
- `// path: tests/payment/velocity.test.ts`

**Verification & Quality Gate:**  
Submit 4 rapid test charges with same card token; verify 4th charge is immediately blocked by velocity guard.

---

### Step 137: Global Card Token & Provider Fingerprint Blacklist Filter
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build instant card blacklist rejecting known fraudulent cards by provider card fingerprint and token hash.  

**Technical Architecture & Specification:**  
Implement blacklist filter in `lib/payment/blacklist.ts`. Check incoming card fingerprints against `card_blacklist` table. Immediately reject charges from cards associated with confirmed fraud, stolen card reports, or excessive chargebacks.

**Granular Sub-Steps:**
- **Step 137.1:** Create `card_blacklist` table storing `card_fingerprint`, `reason`, `added_by`, `added_at`.
- **Step 137.2:** Implement pre-charge check `isCardBlacklisted(fingerprint)` in payment authorization pipeline.
- **Step 137.3:** Provide Super Admin interface to add/remove card fingerprints with mandatory justification notes.
- **Step 137.4:** Add unit tests verifying blacklisted cards are rejected before reaching gateway API.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/040_card_blacklist.sql`
- `// path: lib/payment/blacklist.ts`
- `// path: tests/payment/blacklist.test.ts`

**Verification & Quality Gate:**  
Add card fingerprint to blacklist; attempt charge and verify transaction is instantly rejected.

---

### Step 138: Two-Step Authorization & Capture Workflow Engine
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build two-step authorization and capture engine supporting delayed capture and pre-capture compliance checks.  

**Technical Architecture & Specification:**  
Implement separate authorization and capture pipelines in `lib/payment/auth-capture.ts`. Authorize funds on client card, hold authorization, evaluate fraud signals and transaction size gates, and execute capture only when all compliance rules pass.

**Granular Sub-Steps:**
- **Step 138.1:** Implement `authorize(paymentRequest)` placing authorization hold without immediate settlement.
- **Step 138.2:** Implement `capture(paymentId, amount)` executing capture on approved authorization.
- **Step 138.3:** Enforce business rule: authorization must never be represented to merchant as settlement or payout-eligible cash.
- **Step 138.4:** Implement auto-void for authorizations expiring without capture within 7 days.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/auth-capture.ts`
- `// path: tests/payment/auth-capture.test.ts`

**Verification & Quality Gate:**  
Execute authorization; verify payment record shows status `authorized` and balance is not credited until capture.

---

### Step 139: Mandatory USD $5,000+ Pre-Capture Compliance Review Gate
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Enforce mandatory manual compliance review before capturing any transaction exceeding USD $5,000.  

**Technical Architecture & Specification:**  
Per KD Solution IT risk rule: any transaction over USD $5,000 requires documented manual review by Compliance team before capture, regardless of merchant tier. Capture is blocked until review passes. If provider cannot separate auth/capture, review occurs pre-charge or reject.

**Granular Sub-Steps:**
- **Step 139.1:** Implement transaction size check: if `amount > 5000.0000`, set payment status to `pending_large_tx_review`.
- **Step 139.2:** Block capture API execution while payment is in `pending_large_tx_review` state.
- **Step 139.3:** Route transaction to compliance officer review queue (`app/(office)/compliance/payments/review/`).
- **Step 139.4:** Upon compliance review approval, release capture lock and trigger gateway capture.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/large-tx-guard.ts`
- `// path: app/(office)/compliance/payments/review/page.tsx`
- `// path: tests/payment/large-tx.test.ts`

**Verification & Quality Gate:**  
Submit $5,500 charge; verify capture is held in review queue and completes only after compliance officer sign-off.

---

### Step 140: Client Payment Processing API with Idempotency & Concurrency Locks
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build unified payment processing API (`POST /api/payments/charge`) with idempotency keys and concurrency locks.  

**Technical Architecture & Specification:**  
Construct core payment route `POST /api/payments/charge`. Extract `Idempotency-Key`, validate payload, acquire advisory lock, route to processor, execute 3DS/AVS checks, post double-entry ledger entries on success, and return structured payment result.

**Granular Sub-Steps:**
- **Step 140.1:** Create route handler `app/api/payments/charge/route.ts` validating Zod charge schema.
- **Step 140.2:** Apply idempotency middleware ensuring duplicate requests return identical cached response.
- **Step 140.3:** Enforce sub-merchant Tier 1 and Tier 2 single-transaction and monthly limits.
- **Step 140.4:** Audit log all payment attempts with full forensic metadata and correlation IDs.

**Primary Files & Required Path Comments:**
- `// path: app/api/payments/charge/route.ts`
- `// path: lib/payment/charge.ts`
- `// path: tests/payment/charge-api.test.ts`

**Verification & Quality Gate:**  
Submit valid payment payload with idempotency key; verify payment succeeds and duplicate submission returns cached result.

---

### Step 141: Payment Status Lifecycle State Machine & Audit Trailing
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build strict payment status state machine governing valid status transitions and immutability rules.  

**Technical Architecture & Specification:**  
Implement state machine in `lib/payment/state-machine.ts`. Valid statuses: `initiated`, `pending_3ds`, `authorized`, `in_review`, `captured`, `failed`, `refunded`, `partially_refunded`, `disputed`, `voided`. Disallow invalid transitions (e.g. captured -> initiated).

**Granular Sub-Steps:**
- **Step 141.1:** Define state machine transition table in `lib/payment/state-machine.ts`.
- **Step 141.2:** Implement `transitionPaymentStatus(paymentId, newStatus, reason, actorId)` with optimistic locking.
- **Step 141.3:** Record every status transition in `payment_status_history` table with timestamp and metadata.
- **Step 141.4:** Add unit tests verifying invalid transitions (e.g. `failed` to `captured`) throw `InvalidStateTransitionError`.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/state-machine.ts`
- `// path: db/migrations/041_payment_status_history.sql`
- `// path: tests/payment/state-machine.test.ts`

**Verification & Quality Gate:**  
Attempt illegal status change from `voided` to `captured`; verify state machine rejects operation with HTTP 400.

---

### Step 142: Sub-Merchant Statement Descriptor Formatter (KD [Business Name])
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build dynamic statement descriptor formatter prepending 'KD ' to sub-merchant trade name within 22 characters.  

**Technical Architecture & Specification:**  
Per KD Solution IT card network rules: cardholder statement descriptor must show the two letters 'KD ' together with sub-merchant business name. Clean special characters, truncate to card network 22-character limit, and pass to gateway.

**Granular Sub-Steps:**
- **Step 142.1:** Implement `formatStatementDescriptor(submerchantName)` in `lib/payment/descriptor.ts`.
- **Step 142.2:** Sanitize business name: remove symbols, enforce uppercase/alphanumeric, prepend `KD ` prefix.
- **Step 142.3:** Truncate resulting string to exactly 22 characters maximum (e.g. `KD ACME SUPPLIES`).
- **Step 142.4:** Add unit tests verifying diverse business names format properly within character boundaries.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/descriptor.ts`
- `// path: tests/payment/descriptor.test.ts`

**Verification & Quality Gate:**  
Format descriptor for 'Global Technologies & Services Ltd'; verify output is `KD GLOBAL TECH & SERV` (<=22 chars).

---

### Step 143: Hosted Checkout Page Architecture with Plan Branding Controls
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build responsive hosted checkout page under `app/(checkout)/pay/[id]/` with merchant logo and color customization.  

**Technical Architecture & Specification:**  
Construct high-converting hosted checkout page in `app/(checkout)/pay/[id]/page.tsx`. Support mobile/desktop viewports, render sub-merchant logo and colors (if included in merchant plan), display itemized invoice lines, and embed secure hosted payment fields.

**Granular Sub-Steps:**
- **Step 143.1:** Create checkout layout and page in `app/(checkout)/pay/[id]/page.tsx` with high-contrast responsive styling.
- **Step 143.2:** Render sub-merchant branding (logo, primary color) if merchant plan includes branding entitlement; fallback to KD branding.
- **Step 143.3:** Dynamically toggle Collect.js vs Stripe Elements based on resolved payment processor.
- **Step 143.4:** Include security trust badges: 256-bit SSL encryption, PCI-DSS SAQ A compliant, Powered by Licensed Partners.

**Primary Files & Required Path Comments:**
- `// path: app/(checkout)/pay/[id]/page.tsx`
- `// path: components/checkout/CheckoutSummary.tsx`
- `// path: lib/checkout/session.ts`

**Verification & Quality Gate:**  
Load hosted checkout page; verify clean responsive rendering, merchant branding, and secure iframe initialization.

---

### Step 144: Real-Time Payment Receipt Generator & Client Notification
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build real-time payment receipt generator displaying paid state and dispatching branded email receipt.  

**Technical Architecture & Specification:**  
Implement receipt generator in `lib/payment/receipt.ts`. Upon successful payment capture, transition tokenized invoice link to paid state, render printable web receipt with transaction ID and statement descriptor, and dispatch confirmation email to payer.

**Granular Sub-Steps:**
- **Step 144.1:** Create receipt view component `<PaymentReceipt payment={payment} invoice={invoice} />`.
- **Step 144.2:** Generate printable/downloadable PDF payment receipt via background worker.
- **Step 144.3:** Dispatch `PAYMENT_RECEIVED_RECEIPT` email to client with transaction ID, amount, date, and card last 4.
- **Step 144.4:** Lock associated invoice and tokenized link against any further payment attempts.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/receipt.ts`
- `// path: components/checkout/PaymentReceipt.tsx`
- `// path: tests/payment/receipt.test.ts`

**Verification & Quality Gate:**  
Complete payment; verify browser displays receipt, email receipt is dispatched, and invoice link locks.

---

### Step 145: Payment Forensic Metadata Collector & Fraud Telemetry Engine
**Phase:** Phase 9: Payment Engine, Hosted Fields, 3DS & Card Security  
**Objective:** Build payment telemetry collector recording client IP, browser headers, AVS/CVV codes, and routing decisions.  

**Technical Architecture & Specification:**  
Capture forensic metadata for every transaction in `payment_telemetry` table. Store: client IP address, ASN, user agent, browser language, screen resolution, AVS response, CVV match code, 3DS ECI/CAVV, routing rule matched, and gateway latency.

**Granular Sub-Steps:**
- **Step 145.1:** Create `payment_telemetry` table linked to `payments.id` with UUIDv7 primary key.
- **Step 145.2:** Extract client request telemetry in payment handler without storing any cardholder PII.
- **Step 145.3:** Record provider response timing and gateway correlation IDs for dispute and audit trace.
- **Step 145.4:** Write tests verifying telemetry persistence on both successful and failed transactions.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/042_payment_telemetry.sql`
- `// path: lib/payment/telemetry.ts`
- `// path: tests/payment/telemetry.test.ts`

**Verification & Quality Gate:**  
Execute payment; verify `payment_telemetry` contains IP, user agent, AVS code, and 3DS indicators.

---

## Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation

### Step 146: Chart of Accounts & Immutable Double-Entry Foundation
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Establish formal Chart of Accounts categorizing Assets, Liabilities, Equity, Revenue, and Expense accounts.  

**Technical Architecture & Specification:**  
Define the platform financial accounting structure in `lib/ledger/accounts.ts`. Number accounts: Assets (1000s: Processor Receivables, Bank Accounts), Liabilities (2000s: Merchant Available Balance, Pending Settlement, Held Reserves), Revenue (4000s: Platform Fees, Subscription Revenue), Expense (5000s: Processor Interchange Costs, Dispute Fees).

**Granular Sub-Steps:**
- **Step 146.1:** Create `ledger_accounts` table storing `account_number`, `name`, `type` (asset, liability, equity, revenue, expense), `company_id`.
- **Step 146.2:** Seed standard system chart of accounts in `db/seeds/ledger-accounts.ts`.
- **Step 146.3:** Create merchant sub-accounts dynamically for each provisioned sub-merchant tenant.
- **Step 146.4:** Define TypeScript enums for standard account codes in `types/ledger.ts`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/043_ledger_accounts.sql`
- `// path: lib/ledger/accounts.ts`
- `// path: types/ledger.ts`

**Verification & Quality Gate:**  
Verify chart of accounts schema, standard account seeds, and tenant sub-account initialization.

---

### Step 147: Double-Entry Journal & Ledger Schema Migration
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Create `ledger_journals` and `ledger_entries` tables storing debits and credits with fixed numeric(18,4) precision.  

**Technical Architecture & Specification:**  
Migrate core double-entry accounting tables. Each transaction writes a journal header (`ledger_journals`) and at least two balancing entries (`ledger_entries`) storing `account_id`, `debit numeric(18,4)`, `credit numeric(18,4)`, `currency VARCHAR(3)` (USD only), and `company_id`.

**Granular Sub-Steps:**
- **Step 147.1:** Create SQL migration `044_create_ledger_tables.sql` defining `ledger_journals` and `ledger_entries`.
- **Step 147.2:** Add columns to `ledger_entries`: `journal_id`, `account_id`, `debit numeric(18,4)`, `credit numeric(18,4)`.
- **Step 147.3:** Enforce positive amounts constraint: `CHECK (debit >= 0 AND credit >= 0 AND (debit > 0 OR credit > 0))`.
- **Step 147.4:** Add indexes on `account_id`, `company_id`, `created_at`, and `journal_id`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/044_create_ledger_tables.sql`
- `// path: lib/ledger/types.ts`
- `// path: lib/db/ledger.ts`

**Verification & Quality Gate:**  
Verify table creation, column types `numeric(18,4)`, and foreign key relationships between journals and entries.

---

### Step 148: Zero-Balance Journal Entry Database Trigger
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Install PostgreSQL constraint trigger verifying SUM(debit) equals SUM(credit) on every journal transaction.  

**Technical Architecture & Specification:**  
Enforce fundamental double-entry invariant at database engine level: every journal entry set must balance to exactly zero: `SUM(debit) - SUM(credit) = 0`. Create PostgreSQL constraint trigger deferred to transaction commit, aborting transaction if unbalanced.

**Granular Sub-Steps:**
- **Step 148.1:** Create SQL migration `045_ledger_zero_balance_trigger.sql` defining deferred constraint trigger `check_journal_balance`.
- **Step 148.2:** Trigger verifies `SUM(debit) = SUM(credit)` for given `journal_id` before transaction commits.
- **Step 148.3:** Raise fatal exception `LedgerUnbalancedError` if imbalance is detected, rolling back entire transaction.
- **Step 148.4:** Write database integration test attempting to commit unbalanced journal; verify PostgreSQL raises fatal error.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/045_ledger_zero_balance_trigger.sql`
- `// path: tests/db/ledger-trigger.test.ts`

**Verification & Quality Gate:**  
Attempt to post journal with $100 debit and $90 credit; verify database trigger aborts transaction.

---

### Step 149: Immutable Ledger Constraints & Compensating Reversal Engine
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Install database rules blocking UPDATE/DELETE on ledger and build compensating reversal entry engine.  

**Technical Architecture & Specification:**  
Per KD Solution IT financial rules: ledger entries are never edited or deleted. Install database rules blocking all UPDATE and DELETE commands on `ledger_entries`. Corrections must be written strictly as reversing entries referencing original journal ID.

**Granular Sub-Steps:**
- **Step 149.1:** Create SQL migration `046_ledger_immutability_rules.sql` installing rules preventing UPDATE and DELETE on ledger tables.
- **Step 149.2:** Implement `createReversingJournal(originalJournalId, reason, actorId)` in `lib/ledger/reversal.ts`.
- **Step 149.3:** Swap debits and credits of original entries in compensating reversal transaction.
- **Step 149.4:** Write tests verifying attempt to mutate ledger row throws error and reversal balances out original entries.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/046_ledger_immutability_rules.sql`
- `// path: lib/ledger/reversal.ts`
- `// path: tests/ledger/reversal.test.ts`

**Verification & Quality Gate:**  
Execute `UPDATE ledger_entries SET credit = 0`; verify PostgreSQL raises error and reversal engine creates clean reversing journal.

---

### Step 150: Core Payment Flow Double-Entry Posting Rules
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Implement double-entry posting rules for payment capture: Processor Receivable, Merchant Balance, and Platform Fee.  

**Technical Architecture & Specification:**  
Construct core payment journal poster in `lib/ledger/post-payment.ts`. Upon successful $100 charge with 3% platform fee: Debit Account 1100 (Processor Receivable) $100.0000; Credit Account 2100 (Merchant Pending Settlement) $97.0000; Credit Account 4100 (Platform Fee Revenue) $3.0000.

**Granular Sub-Steps:**
- **Step 150.1:** Implement `postPaymentCaptureJournal(payment, feeAmount)` within database transaction.
- **Step 150.2:** Calculate exact fee split using `numeric(18,4)` Decimal math, ensuring zero rounding discrepancy.
- **Step 150.3:** Assert debits equal credits before posting.
- **Step 150.4:** Add unit tests verifying exact ledger balances across varied transaction amounts and fee tiers.

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/post-payment.ts`
- `// path: tests/ledger/post-payment.test.ts`

**Verification & Quality Gate:**  
Post sample payment capture; verify Processor Receivable increases by gross amount, Merchant balance by net, and Fee revenue by split.

---

### Step 151: Platform Processing Fee Calculation & Split-Payment Posting
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build platform fee calculator evaluating global vs merchant-specific overrides and posting fee revenue journals.  

**Technical Architecture & Specification:**  
Implement fee calculator in `lib/ledger/platform-fee.ts`. Evaluate global platform fee percent (set by Super Admin) or merchant custom override (approved by CEO/Super Admin). Deduct fee at capture and credit Platform Fee Revenue account.

**Granular Sub-Steps:**
- **Step 151.1:** Implement `calculatePlatformFee(amount, companyId)` retrieving active fee rate.
- **Step 151.2:** Ensure fee calculation uses fixed-precision Decimal math with Banker's rounding.
- **Step 151.3:** Record fee calculation breakdown on payment journal entry for transparency.
- **Step 151.4:** Write tests verifying custom fee overrides take precedence over global default fee rates.

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/platform-fee.ts`
- `// path: tests/ledger/platform-fee.test.ts`

**Verification & Quality Gate:**  
Set merchant custom fee to 2.5%; process $200 charge and verify platform fee deducted is exactly $5.0000.

---

### Step 152: Settlement Hold & Rolling Reserve Double-Entry Journal Posting
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build double-entry journal poster for settlement hold maturation and rolling reserve allocation.  

**Technical Architecture & Specification:**  
Implement hold and reserve posting rules in `lib/ledger/reserves.ts`. When funds clear holding period: Debit Account 2100 (Pending Settlement), Credit Account 2000 (Available Balance). Allocate reserve: Debit Account 2000 (Available Balance), Credit Account 2200 (Rolling Reserve).

**Granular Sub-Steps:**
- **Step 152.1:** Implement `postSettlementReleaseJournal(companyId, amount)` moving funds from Pending to Available.
- **Step 152.2:** Implement `postRollingReserveJournal(companyId, reserveAmount)` allocating funds into Rolling Reserve account.
- **Step 152.3:** Implement `postReserveReleaseJournal(companyId, releasedAmount)` returning matured reserve to Available Balance.
- **Step 152.4:** Write tests verifying total sub-merchant equity is conserved throughout hold, reserve, and release transitions.

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/reserves.ts`
- `// path: tests/ledger/reserves.test.ts`

**Verification & Quality Gate:**  
Release matured settlement batch; verify journal correctly moves balance from Pending Settlement to Available Balance.

---

### Step 153: Sub-Merchant Real-Time Balance Query & Aggregation Service
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build high-performance balance aggregation service querying Available Balance, Pending Settlement, and Rolling Reserve.  

**Technical Architecture & Specification:**  
Implement balance calculator in `lib/ledger/balance.ts`. Aggregate debits and credits from `ledger_entries` for given company: Available Balance = Net credit in Account 2000; Pending Settlement = Net credit in Account 2100; Rolling Reserve = Net credit in Account 2200.

**Granular Sub-Steps:**
- **Step 153.1:** Implement `getMerchantBalance(companyId)` returning `{ available, pending, reserve, currency: 'USD' }`.
- **Step 153.2:** Optimize query using indexed aggregation on `account_id` with short-lived cache for dashboard rendering.
- **Step 153.3:** Provide API endpoint `GET /api/merchant/balance` for sub-merchant dashboard.
- **Step 153.4:** Add unit tests verifying balance query accurately matches ledger entries after series of charges and payouts.

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/balance.ts`
- `// path: app/api/merchant/balance/route.ts`
- `// path: tests/ledger/balance.test.ts`

**Verification & Quality Gate:**  
Query merchant balance after $1,000 charges and $100 reserve; verify available, pending, and reserve values are exact.

---

### Step 154: Negative Balance Management & Rolling Reserve Recovery Engine
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build negative balance recovery engine offsetting chargeback losses from rolling reserve and contract recovery.  

**Technical Architecture & Specification:**  
Implement negative balance resolution in `lib/ledger/negative-balance.ts`. When chargeback or refund creates negative Available Balance: automatically debit Rolling Reserve (Account 2200) to restore Available Balance to zero. If reserve is exhausted, enqueue remaining deficit for legal/contract collection.

**Granular Sub-Steps:**
- **Step 154.1:** Implement `offsetNegativeBalance(companyId)` evaluating available balance deficit against held reserve.
- **Step 154.2:** Post compensating journal transferring deficit amount from Rolling Reserve to Available Balance.
- **Step 154.3:** If total equity remains negative, flag account `negative_balance_collection` and alert Finance Ops.
- **Step 154.4:** Write tests verifying rolling reserve successfully absorbs chargeback deficit without manual intervention.

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/negative-balance.ts`
- `// path: tests/ledger/negative-balance.test.ts`

**Verification & Quality Gate:**  
Simulate $500 chargeback on empty available balance with $600 reserve; verify reserve absorbs deficit and balance zeros out.

---

### Step 155: Continuous Invariant Ledger Monitor & Imbalance Alert Worker
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build automated background monitor continuously verifying global ledger mathematical balance and alerting office on mismatch.  

**Technical Architecture & Specification:**  
Implement ledger invariant scanner in `lib/ledger/monitor.ts`. Continuously verify: (1) every journal balances to zero; (2) total system Assets equal total Liabilities plus Equity; (3) Bank custodial balance covers all merchant liabilities. Alert office immediately on any discrepancy.

**Granular Sub-Steps:**
- **Step 155.1:** Implement `checkGlobalLedgerInvariants()` scanning all journals and account balances.
- **Step 155.2:** Verify global equation: `SUM(debits) - SUM(credits) === 0` across entire platform database.
- **Step 155.3:** If any mismatch is detected, dispatch critical Sentry alert and emergency email to Finance Ops and CEO.
- **Step 155.4:** Configure automated hourly background job executing invariant check.

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/monitor.ts`
- `// path: scripts/check-ledger.ts`
- `// path: tests/ledger/monitor.test.ts`

**Verification & Quality Gate:**  
Run `scripts/check-ledger.ts`; verify scanner validates all journals and reports 100% balanced ledger.

---

### Step 156: Multi-Provider Settlement Report Parsing & Ingestion Engine
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build settlement report parsers ingesting CSV and JSON settlement files from NMI, Stripe, Rainforest, and Airwallex.  

**Technical Architecture & Specification:**  
Implement settlement report parser in `lib/reconciliation/ingest.ts`. Ingest daily processor payout and settlement reports. Parse processor transaction IDs, gross amounts, fee deductions, net payout amounts, and settlement dates into `processor_settlement_lines` table.

**Granular Sub-Steps:**
- **Step 156.1:** Create `processor_settlement_lines` table tracking `provider`, `processor_tx_id`, `amount`, `fee`, `net`, `settlement_date`.
- **Step 156.2:** Implement CSV parsers for Stripe Settlement CSV, NMI Settlement Reports, Rainforest, and Airwallex files.
- **Step 156.3:** Provide file upload portal for Finance Ops (`app/(office)/finance/settlement-upload/`).
- **Step 156.4:** Add unit tests verifying parser accurately extracts line items from sample provider CSV formats.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/047_processor_settlement_lines.sql`
- `// path: lib/reconciliation/ingest.ts`
- `// path: tests/reconciliation/ingest.test.ts`

**Verification & Quality Gate:**  
Upload sample Stripe settlement CSV; verify all settlement lines parse and insert into database with zero errors.

---

### Step 157: Automated Transaction-Level Reconciliation Matcher
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build automated reconciliation matcher pairing platform transaction records with processor settlement lines.  

**Technical Architecture & Specification:**  
Implement automated reconciliation in `lib/reconciliation/matcher.ts`. Match platform payment records with processor settlement lines by provider transaction ID and amount. Flag records as `matched`, `amount_mismatch`, `missing_in_processor`, or `missing_in_platform`.

**Granular Sub-Steps:**
- **Step 157.1:** Create `reconciliation_matches` table tracking `payment_id`, `settlement_line_id`, `status`, `discrepancy_amount`.
- **Step 157.2:** Execute matching algorithm comparing gross charge, processor fee, and net settlement within 1-cent tolerance.
- **Step 157.3:** Mark matched records `reconciled` and update ledger Account 1100 (Processor Receivable) to settled cash.
- **Step 157.4:** Write tests verifying matcher accurately pairs 1,000 transactions and flags single-cent anomalies.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/048_reconciliation_matches.sql`
- `// path: lib/reconciliation/matcher.ts`
- `// path: tests/reconciliation/matcher.test.ts`

**Verification & Quality Gate:**  
Run reconciliation matcher; verify matched records update to `reconciled` and mismatches route to investigation queue.

---

### Step 158: 3-Day Reconciliation Mismatch Resolution Queue & Escalation SLA
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build Finance Ops reconciliation mismatch queue enforcing mandatory resolution within 3 business days.  

**Technical Architecture & Specification:**  
Per KD Solution IT operational rules: any reconciliation mismatch must be resolved by Finance Ops within 3 days. Construct resolution queue in `app/(office)/finance/reconciliation/`. Track 72-hour countdown SLA, auto-escalate to CEO at 48 hours, and audit log all resolution steps.

**Granular Sub-Steps:**
- **Step 158.1:** Create `reconciliation_mismatch_cases` table tracking `case_id`, `mismatch_type`, `sla_deadline`, `assigned_to`, `status`.
- **Step 158.2:** Build resolution interface with side-by-side comparison of platform record vs processor report line.
- **Step 158.3:** Provide resolution actions: post adjusting entry, re-query processor API, or flag processor billing error.
- **Step 158.4:** Trigger automated email escalation to Finance Ops lead and CEO at 48 hours and 72 hours.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/049_reconciliation_mismatches.sql`
- `// path: app/(office)/finance/reconciliation/[id]/page.tsx`
- `// path: lib/reconciliation/sla.ts`

**Verification & Quality Gate:**  
Inspect mismatch case; verify 3-day SLA countdown displays and resolution action writes adjusting journal.

---

### Step 159: Processor Monthly Bill Matching & Interchange Fee Audit Engine
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build processor monthly bill matching tool comparing billed fees against platform calculated deductions.  

**Technical Architecture & Specification:**  
Implement invoice audit engine in `lib/reconciliation/bill-match.ts`. Ingest monthly processor billing statements. Compare billed interchange, assessment, and fixed gateway fees against internal platform ledger cost accruals, flagging overcharges for dispute.

**Granular Sub-Steps:**
- **Step 159.1:** Create `processor_monthly_bills` table storing `provider`, `billing_period`, `total_billed_fees`, `audit_status`.
- **Step 159.2:** Implement bill comparison calculator aggregating 30-day transaction volume and computing fee variance.
- **Step 159.3:** Build bill audit dashboard in Finance Ops console (`app/(office)/finance/bill-audit/`).
- **Step 159.4:** Record audit sign-off by Finance Ops lead and CEO in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/050_processor_monthly_bills.sql`
- `// path: lib/reconciliation/bill-match.ts`
- `// path: app/(office)/finance/bill-audit/page.tsx`

**Verification & Quality Gate:**  
Audit monthly processor bill; verify system compares internal fee accruals against billed total and reports variance.

---

### Step 160: Sub-Merchant Settlement Statement Generator (CSV & PDF)
**Phase:** Phase 10: Double-Entry Ledger, Balance Engine & Reconciliation  
**Objective:** Build settlement statement exporter allowing merchants to download detailed periodic statements as CSV and PDF.  

**Technical Architecture & Specification:**  
Construct settlement statement generator in `lib/ledger/statement.ts`. Allow merchants to select any date range and download complete statement itemizing: gross payments, platform fees, processor costs, reserve allocations, refunds, chargebacks, and net payouts.

**Granular Sub-Steps:**
- **Step 160.1:** Implement `generateSettlementStatement(companyId, startDate, endDate)` aggregating ledger entries.
- **Step 160.2:** Create CSV export formatter producing standard accounting spreadsheet format.
- **Step 160.3:** Create PDF statement generator producing branded settlement summary statement.
- **Step 160.4:** Provide download interface on merchant dashboard (`app/(merchant)/statements/`).

**Primary Files & Required Path Comments:**
- `// path: lib/ledger/statement.ts`
- `// path: app/(merchant)/statements/page.tsx`
- `// path: tests/ledger/statement.test.ts`

**Verification & Quality Gate:**  
Download settlement statement for past month; verify CSV and PDF accurately reflect all ledger movements and totals.

---

## Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates

### Step 161: Risk Tier Policy Versioning Schema & Governance Rules
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Design versioned risk tier policy schema editable only by CEO and Super Admin through formal approval workflow.  

**Technical Architecture & Specification:**  
Create risk tier policy architecture in `lib/compliance/tier-policy.ts`. Store versioned policy definitions in `risk_tier_policies` table. Define transaction caps, monthly limits, reserve rates, reserve holding days, and post-fulfilment payout delays. Any change requires distinct proposal and CEO/Super Admin approval.

**Granular Sub-Steps:**
- **Step 161.1:** Create SQL migration `051_create_risk_tier_policies.sql` storing policy versions, parameters, and effective dates.
- **Step 161.2:** Define immutable policy version linking: every payment and payout record references the active `policy_version_id` applied at authorization.
- **Step 161.3:** Enforce dual-actor governance: changes proposed by Super Admin require CEO confirmation; changes proposed by CEO require Super Admin confirmation.
- **Step 161.4:** Audit log all policy version proposals and approvals in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/051_create_risk_tier_policies.sql`
- `// path: lib/compliance/tier-policy.ts`
- `// path: types/tier-policy.ts`

**Verification & Quality Gate:**  
Verify policy version schema, constraints, and assert that unapproved policy proposals cannot be activated.

---

### Step 162: Tier 1 (New Merchant) Limits & 10% 90-Day Reserve Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Enforce baseline Tier 1 limits: max USD $500/transaction, USD $2,500/month, 10% 90-day reserve, payout >= 7 days post-fulfilment.  

**Technical Architecture & Specification:**  
Implement Tier 1 policy rules in `lib/compliance/tier1.ts`. Every newly onboarded seller starts strictly in Tier 1. Enforce: single transaction cap $500 USD, monthly gross volume cap $2,500 USD, 10% rolling reserve held for 90 days, and payout eligibility no earlier than 7 days after verified delivery.

**Granular Sub-Steps:**
- **Step 162.1:** Implement pre-charge check `validateTier1Transaction(companyId, amount)` rejecting charges > $500.
- **Step 162.2:** Check calendar month cumulative volume, rejecting charges that would push monthly total past $2,500.
- **Step 162.3:** Allocate 10% of captured amount into rolling reserve account with 90-day maturity timestamp.
- **Step 162.4:** Enforce payout gate: block settlement release until at least 7 days after recorded delivery confirmation.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/tier1.ts`
- `// path: tests/compliance/tier1.test.ts`

**Verification & Quality Gate:**  
Attempt $550 charge for Tier 1 merchant; verify charge is rejected with error `Exceeds Tier 1 transaction limit of $500`.

---

### Step 163: Tier 2 Eligibility Evaluator & 5% 60-Day Reserve Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build Tier 2 eligibility evaluator and limits: max USD $2,500/tx, $15,000/mo, 5% 60-day reserve, payout >= 3 days post-fulfilment.  

**Technical Architecture & Specification:**  
Implement Tier 2 policy in `lib/compliance/tier2.ts`. Eligibility criteria: minimum 60 active days, at least 20 completed orders, chargeback rate below 0.3%, and zero active fraud flags. Tier 2 limits: max $2,500 per charge, $15,000 monthly limit, 5% reserve held 60 days, payout >= 3 days post-fulfilment.

**Granular Sub-Steps:**
- **Step 163.1:** Implement `evaluateTier2Eligibility(companyId)` evaluating 60 days, 20 orders, and <0.3% chargeback rate.
- **Step 163.2:** Enforce Tier 2 limits on approved accounts: $2,500 max transaction and $15,000 monthly volume cap.
- **Step 163.3:** Apply 5% rolling reserve with 60-day maturity on Tier 2 payments.
- **Step 163.4:** Enforce post-fulfilment payout delay of at least 3 days after verified delivery.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/tier2.ts`
- `// path: tests/compliance/tier2.test.ts`

**Verification & Quality Gate:**  
Evaluate merchant with 65 active days and 25 orders; verify eligibility succeeds and Tier 2 parameters apply upon approval.

---

### Step 164: Tier 3 Eligibility Evaluator & Custom Reserve Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build Tier 3 eligibility evaluator and limits: max USD $10,000/tx, $50,000/mo, 0-5% reserve, payout >= 2 days post-fulfilment.  

**Technical Architecture & Specification:**  
Implement Tier 3 policy in `lib/compliance/tier3.ts`. Eligibility criteria: minimum 180 active days, 100 completed orders, chargeback rate below 0.3%, and current cleared re-KYC. Tier 3 limits: max $10,000 per charge, $50,000 monthly limit (higher requires custom approval), 0-5% reserve, payout >= 2 days post-fulfilment.

**Granular Sub-Steps:**
- **Step 164.1:** Implement `evaluateTier3Eligibility(companyId)` checking 180 days, 100 orders, chargeback <0.3%, and re-KYC validity.
- **Step 164.2:** Enforce Tier 3 limits: $10,000 transaction cap and $50,000 monthly volume cap.
- **Step 164.3:** Configure custom reserve rate (0% to 5%) based on compliance risk determination.
- **Step 164.4:** Enforce post-fulfilment payout delay of at least 2 days after verified delivery.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/tier3.ts`
- `// path: tests/compliance/tier3.test.ts`

**Verification & Quality Gate:**  
Evaluate merchant meeting Tier 3 criteria; verify system qualifies account for manual Tier 3 upgrade review.

---

### Step 165: Idempotent Monthly Volume Counter & Limit Enforcement
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build idempotent calendar-month volume accumulator enforcing tier caps with zero race-condition overages.  

**Technical Architecture & Specification:**  
Implement monthly volume tracker in `lib/compliance/volume-tracker.ts`. Track cumulative gross processing volume for current calendar month using idempotent database counter and advisory locks. Reject charges that would cause cumulative volume to exceed active tier cap.

**Granular Sub-Steps:**
- **Step 165.1:** Create `company_monthly_volumes` table storing `company_id`, `month_year`, `gross_volume`, `charge_count`.
- **Step 165.2:** Atomically increment volume within payment transaction using row lock `FOR UPDATE`.
- **Step 165.3:** If `gross_volume + charge_amount > monthly_limit`, reject charge with `MonthlyVolumeCapExceededError`.
- **Step 165.4:** Write tests simulating concurrent charges near monthly limit; verify volume cap is strictly enforced without overages.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/052_company_monthly_volumes.sql`
- `// path: lib/compliance/volume-tracker.ts`
- `// path: tests/compliance/volume-tracker.test.ts`

**Verification & Quality Gate:**  
Process charges up to $2,500 monthly limit; verify next charge is blocked and volume resets cleanly on 1st of next month.

---

### Step 166: Standardized Chargeback Rate Observation Window & Denominator Calculator
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build card network standard chargeback rate calculator evaluating sliding observation window and minimum sample size.  

**Technical Architecture & Specification:**  
Implement chargeback rate calculator in `lib/compliance/chargeback-rate.ts`. Calculate rate = `total_chargebacks / total_transactions` over 90-day sliding observation window. Enforce card network rule: percentage threshold applies only after minimum sample size of 50 transactions is reached.

**Granular Sub-Steps:**
- **Step 166.1:** Implement `calculateChargebackRate(companyId, windowDays = 90)` returning ratio and sample count.
- **Step 166.2:** Apply minimum sample size threshold: if transactions < 50, do not trigger automated percentage sanctions.
- **Step 166.3:** If chargeback rate >= 0.3% and sample >= 50, flag account for compliance monitoring and extra reserve.
- **Step 166.4:** If chargeback rate >= 0.9%, trigger automated suspension warning and hold escalation.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/chargeback-rate.ts`
- `// path: tests/compliance/chargeback-rate.test.ts`

**Verification & Quality Gate:**  
Test with 1 dispute in 10 transactions (10% rate, sample < 50); verify system holds penalty pending minimum sample threshold.

---

### Step 167: Four-Eye Merchant Tier Upgrade Review & CEO Approval Workflow
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build four-eye tier upgrade workflow requiring automated qualification, compliance review, and CEO final approval.  

**Technical Architecture & Specification:**  
Per KD Solution IT policy: no automatic tier upgrades occur. When merchant meets eligibility, system generates upgrade proposal. Compliance officer reviews business history and submits recommendation. CEO performs required final approval. Super Admin retains full authority.

**Granular Sub-Steps:**
- **Step 167.1:** Create `tier_upgrade_requests` table tracking `company_id`, `current_tier`, `requested_tier`, `reviewed_by`, `approved_by`.
- **Step 167.2:** System generates upgrade proposal when automated metrics qualify account.
- **Step 167.3:** Compliance team reviews chargeback history, fulfilment proof, and re-KYC before recommending upgrade.
- **Step 167.4:** CEO executes final approval sign-off; tier upgrade takes effect prospectively from approval timestamp.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/053_tier_upgrades.sql`
- `// path: lib/compliance/tier-upgrade.ts`
- `// path: app/(office)/compliance/tier-upgrades/page.tsx`

**Verification & Quality Gate:**  
Qualify merchant for Tier 2; verify upgrade requires Compliance review followed by CEO approval before taking effect.

---

### Step 168: Automated Risk-Based Tier Downgrade & Settlement Freeze Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build automated risk-based tier downgrade and settlement freeze engine responding to fraud spikes or dispute surges.  

**Technical Architecture & Specification:**  
Implement risk mitigation engine in `lib/compliance/risk-downgrade.ts`. Automatically apply risk tier downgrade (Tier 3->2 or Tier 2->1), increase rolling reserve, or freeze payouts when: chargeback rate spikes, fraud alert is received, or adverse media triggers.

**Granular Sub-Steps:**
- **Step 168.1:** Implement `triggerRiskAction(companyId, actionType, reason, evidence)` in `lib/compliance/risk-downgrade.ts`.
- **Step 168.2:** Supported actions: `downgrade_tier`, `increase_reserve_rate`, `extend_hold_days`, `freeze_payouts`.
- **Step 168.3:** Record evidence, rationale, and active policy version in `risk_intervention_logs`.
- **Step 168.4:** Dispatch formal merchant notice explaining risk action and providing appeal pathway under approved policy.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/risk-downgrade.ts`
- `// path: db/migrations/054_risk_intervention_logs.sql`
- `// path: tests/compliance/risk-downgrade.test.ts`

**Verification & Quality Gate:**  
Simulate chargeback surge >0.9%; verify system executes risk action, increases reserve, and notifies merchant with appeal link.

---

### Step 169: Fulfilment Evidence Ingestion & Carrier Tracking Verification Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build fulfilment evidence collection and carrier tracking integration validating delivery confirmation before payout.  

**Technical Architecture & Specification:**  
Construct fulfilment tracking engine in `lib/fulfilment/tracker.ts`. Merchants submit delivery evidence for physical goods (carrier tracking number: FedEx, UPS, DHL, USPS) or service completion proof (client acceptance sign-off, digital delivery log).

**Granular Sub-Steps:**
- **Step 169.1:** Create `fulfilment_records` table tracking `invoice_id`, `carrier`, `tracking_number`, `delivery_status`, `delivered_at`.
- **Step 169.2:** Integrate tracking webhook/API verifying carrier status transitions to `delivered`.
- **Step 169.3:** For services, support digital client delivery confirmation with timestamped client sign-off.
- **Step 169.4:** Add unit tests verifying delivery timestamp is persisted and unverified shipments block payout timers.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/055_fulfilment_records.sql`
- `// path: lib/fulfilment/tracker.ts`
- `// path: app/(merchant)/fulfilment/page.tsx`

**Verification & Quality Gate:**  
Submit carrier tracking; verify system records delivery confirmation and starts post-fulfilment payout timer.

---

### Step 170: Fulfilment-Gated Settlement Holding Period Release Gate
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Enforce mandatory fulfilment gate: settlement hold timer starts only after verified delivery; funds held if delivery missing.  

**Technical Architecture & Specification:**  
Per KD Solution IT payout rules: payout eligibility requires recorded delivery confirmation or buyer acceptance. The post-fulfilment hold delay (7d for Tier 1, 3d for Tier 2, 2d for Tier 3) begins strictly on `delivered_at` timestamp. Missing fulfilment proof keeps funds held indefinitely.

**Granular Sub-Steps:**
- **Step 170.1:** Implement `isSettlementFulfilmentCleared(paymentId)` evaluating delivery status and post-fulfilment delay.
- **Step 170.2:** If fulfilment evidence is missing, keep funds in Pending Settlement; never release on timer alone.
- **Step 170.3:** Exception release requires documented compliance justification and dual CEO/Super Admin sign-off.
- **Step 170.4:** Write tests verifying funds remain held indefinitely when delivery tracking is not supplied.

**Primary Files & Required Path Comments:**
- `// path: lib/fulfilment/payout-gate.ts`
- `// path: tests/fulfilment/payout-gate.test.ts`

**Verification & Quality Gate:**  
Test payment with completed holding timer but missing delivery proof; verify settlement release is blocked.

---

### Step 171: Payout Multi-Gate Evaluator & Eligibility Barrier Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build multi-gate payout barrier verifying 6 prerequisites before disbursing funds: provider, bank, reserve, fulfilment, disputes, and cooling.  

**Technical Architecture & Specification:**  
Implement payout evaluator in `lib/finance/payout-gates.ts`. Payout dispatches only when ALL 6 gates pass: (1) Processor verification active; (2) Verified payout bank; (3) Bank change 96h cooling clear; (4) Minimum $100 balance available; (5) Fulfilment confirmed + tier delay passed; (6) Zero blocking disputes/reviews.

**Granular Sub-Steps:**
- **Step 171.1:** Implement `evaluatePayoutEligibility(companyId)` evaluating all 6 barrier conditions.
- **Step 171.2:** If any single gate fails, block payout batch inclusion and log specific blocking reason.
- **Step 171.3:** Provide detailed payout eligibility diagnostic view on sub-merchant dashboard.
- **Step 171.4:** Write unit tests asserting payout failure when each of the 6 individual gates is toggled to failed.

**Primary Files & Required Path Comments:**
- `// path: lib/finance/payout-gates.ts`
- `// path: tests/finance/payout-gates.test.ts`

**Verification & Quality Gate:**  
Evaluate payout with 5 gates passed and 1 gate failing; verify payout is blocked with exact diagnostic indicator.

---

### Step 172: Merchant Payout Bank Account Verification & Name Matching
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build payout bank account registration and legal name verification syncing to Payoneer or Airwallex.  

**Technical Architecture & Specification:**  
Implement bank management in `lib/finance/bank-account.ts`. When merchant adds bank account: verify bank account name matches registered legal business name. Automatically register verified bank with Payoneer or Airwallex payout adapters.

**Granular Sub-Steps:**
- **Step 172.1:** Create `company_bank_accounts` table storing `company_id`, `bank_name`, `account_last4`, `routing_number`, `status`.
- **Step 172.2:** Encrypt full bank account number and routing codes at rest using AES-256-GCM.
- **Step 172.3:** Sync verified bank details automatically to Payoneer Mass Payouts or Airwallex Connected Accounts.
- **Step 172.4:** Reject bank accounts where account holder name differs from registered corporate entity name.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/056_company_bank_accounts.sql`
- `// path: lib/finance/bank-account.ts`
- `// path: app/(merchant)/settings/payouts/page.tsx`

**Verification & Quality Gate:**  
Add payout bank account; verify encryption at rest, name match check, and automatic registration with Payoneer.

---

### Step 173: Bank Account Change 96-Hour Cooling Period Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Enforce mandatory 96-hour payout freeze on bank account changes starting only after manual compliance verification.  

**Technical Architecture & Specification:**  
Per KD Solution IT anti-account-takeover rules: changing a payout bank account requires manual compliance verification first. The 96-hour cooling period starts ONLY after compliance verification passes. During cooling, all payouts are 100% frozen (including to old bank). If verification fails, cooling never starts.

**Granular Sub-Steps:**
- **Step 173.1:** When bank update is submitted, set status to `pending_compliance_verification`.
- **Step 173.2:** Compliance officer inspects bank proof; upon approval, set `cooling_ends_at = NOW() + INTERVAL '96 hours'`.
- **Step 173.3:** During 96-hour cooling window, block all payouts completely across all platform accounts for that merchant.
- **Step 173.4:** If compliance verification fails, reject update; cooling never starts and previous bank remains active.

**Primary Files & Required Path Comments:**
- `// path: lib/finance/cooling-period.ts`
- `// path: tests/finance/cooling-period.test.ts`

**Verification & Quality Gate:**  
Update bank account; verify compliance must verify first, then 96-hour cooling freezes all payouts until timer expires.

---

### Step 174: Minimum USD $100 Payout Rule & Remainder Accumulation Engine
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Enforce minimum USD $100 payout threshold and accumulate smaller amounts until threshold or account closure.  

**Technical Architecture & Specification:**  
Implement payout batching rules in `lib/finance/payout-batch.ts`. Minimum payout amount is USD $100.0000. Available balances below $100 are retained in Available Balance and accumulate across settlement periods until exceeding $100, or paid out on final account closure.

**Granular Sub-Steps:**
- **Step 174.1:** Implement `qualifyPayoutAmount(availableBalance)` checking `availableBalance >= 100.0000`.
- **Step 174.2:** If balance < $100, retain funds in Available Balance and display accumulation notice on merchant dashboard.
- **Step 174.3:** When merchant formally closes account, release full remaining balance regardless of $100 minimum post-hold.
- **Step 174.4:** Write tests verifying $95 balance accumulates and triggers payout once next settlement pushes balance to $120.

**Primary Files & Required Path Comments:**
- `// path: lib/finance/payout-batch.ts`
- `// path: tests/finance/payout-batch.test.ts`

**Verification & Quality Gate:**  
Attempt payout of $85; verify system accumulates balance without payout and triggers payout when balance hits $100+.

---

### Step 175: Failed Payout Notification & Finance Operations Resolution Queue
**Phase:** Phase 11: Merchant Risk Tiers, Screening, Limits & Fulfilment Gates  
**Objective:** Build failed payout handler dispatching immediate merchant email alerts and enqueuing Finance Ops investigation.  

**Technical Architecture & Specification:**  
Implement failed payout handler in `lib/finance/failed-payout.ts`. When bank or provider rejects payout: immediately reverse ledger debit back to Available Balance, dispatch security/information email to merchant, and open investigation ticket in Finance Ops queue.

**Granular Sub-Steps:**
- **Step 175.1:** Process payout rejection webhook: set payout status to `failed` with provider rejection code.
- **Step 175.2:** Post reversing ledger journal returning funds from Payout In Transit to Merchant Available Balance.
- **Step 175.3:** Dispatch `PAYMENT_PAYOUT_FAILED` email to merchant explaining bank rejection reason.
- **Step 175.4:** Create investigation ticket in Finance Ops dashboard (`app/(office)/finance/payouts/failed/`).

**Primary Files & Required Path Comments:**
- `// path: lib/finance/failed-payout.ts`
- `// path: app/(office)/finance/payouts/failed/page.tsx`
- `// path: tests/finance/failed-payout.test.ts`

**Verification & Quality Gate:**  
Simulate failed Payoneer payout; verify ledger reverses funds to merchant balance and email alert is sent.

---

## Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine

### Step 176: TaxCloud API Client & Credential Encryption
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build TaxCloud REST API client with AES-256-GCM encrypted credential storage for US sales tax calculation.  

**Technical Architecture & Specification:**  
Implement TaxCloud client in `lib/tax/taxcloud.ts`. Encrypt merchant TaxCloud API ID and API Key at rest. Communicate with TaxCloud API (`Lookup`, `Authorized`, `Captured`, `Returned`) to calculate destination-based US state and local sales tax.

**Granular Sub-Steps:**
- **Step 176.1:** Create `lib/tax/taxcloud.ts` wrapping TaxCloud API endpoints with error handling and retry.
- **Step 176.2:** Encrypt TaxCloud credentials at rest in `merchant_taxcloud_configs` table.
- **Step 176.3:** Implement masked display showing only last 4 characters of TaxCloud API key.
- **Step 176.4:** Write tests verifying TaxCloud client builds correct tax lookup payload from invoice line items.

**Primary Files & Required Path Comments:**
- `// path: lib/tax/taxcloud.ts`
- `// path: db/migrations/057_taxcloud_configs.sql`
- `// path: tests/tax/taxcloud.test.ts`

**Verification & Quality Gate:**  
Test TaxCloud client with sandbox credentials; verify address lookup returns tax percentage breakdown.

---

### Step 177: Sub-Merchant TaxCloud Integration & On/Off Toggle
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build merchant tax settings portal allowing sub-merchants to connect personal TaxCloud accounts and toggle tax collection.  

**Technical Architecture & Specification:**  
Construct tax settings interface in `app/(merchant)/settings/taxes/page.tsx`. Enable sub-merchants to input their TaxCloud credentials, test connection, and toggle automated US sales tax collection on or off. Platform builds no complex tax engine of its own.

**Granular Sub-Steps:**
- **Step 177.1:** Build tax configuration page in `app/(merchant)/settings/taxes/page.tsx`.
- **Step 177.2:** Provide toggle switch: 'Collect US Sales Tax via TaxCloud' (default off).
- **Step 177.3:** Validate credentials via live TaxCloud ping before permitting toggle activation.
- **Step 177.4:** Audit log tax configuration updates in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: app/(merchant)/settings/taxes/page.tsx`
- `// path: lib/tax/settings.ts`
- `// path: tests/tax/settings.test.ts`

**Verification & Quality Gate:**  
Enable TaxCloud with test credentials; verify connection verifies and tax toggle activates successfully.

---

### Step 178: Real-Time Destination-Based US Sales Tax Calculation Engine
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build real-time sales tax calculator computing US state and municipal tax by destination address on checkout.  

**Technical Architecture & Specification:**  
Implement tax calculator in `lib/tax/calculate.ts`. When US customer enters billing/shipping address: call TaxCloud `Lookup` with origin and destination postal addresses and line item TIC codes. Add exact calculated sales tax as separate invoice line item.

**Granular Sub-Steps:**
- **Step 178.1:** Implement `calculateSalesTax(invoice, customerAddress)` querying TaxCloud when tax toggle is enabled.
- **Step 178.2:** Verify destination country is United States (US); skip calculation for non-US transactions.
- **Step 178.3:** Append calculated tax as distinct line item: 'Sales Tax (State/Local)' on invoice and checkout screen.
- **Step 178.4:** Add unit tests verifying tax is added only when enabled and matches TaxCloud response exactly.

**Primary Files & Required Path Comments:**
- `// path: lib/tax/calculate.ts`
- `// path: tests/tax/calculate.test.ts`

**Verification & Quality Gate:**  
Calculate tax for California destination; verify invoice displays California sales tax line item accurately.

---

### Step 179: Tax Line-Item Breakdown & Dedicated Ledger Journal Storage
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Store sales tax line items immutably on invoice and post dedicated double-entry ledger entries for sales tax collected.  

**Technical Architecture & Specification:**  
Record tax details on invoice and payment records. Upon payment capture: post sales tax liability to Account 2300 (Sales Tax Payable). Fiduciary segregation ensures collected sales tax is accounted separately from merchant product revenue.

**Granular Sub-Steps:**
- **Step 179.1:** Store `tax_amount`, `tax_rate`, `tax_jurisdiction` on `invoices` and `payments` tables.
- **Step 179.2:** Post double-entry journal: Credit Account 2300 (Sales Tax Payable) for exact tax portion of payment.
- **Step 179.3:** Ensure platform fee calculation applies strictly to gross subtotal excluding tax (or per merchant setting).
- **Step 179.4:** Write tests verifying tax amounts balance to penny in ledger journals.

**Primary Files & Required Path Comments:**
- `// path: lib/tax/ledger.ts`
- `// path: tests/tax/ledger.test.ts`

**Verification & Quality Gate:**  
Capture payment with $8.50 sales tax; verify ledger credits Account 2300 (Sales Tax Payable) with exactly $8.5000.

---

### Step 180: Sub-Merchant & Platform-Wide Sales Tax Reporting Dashboard
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build sales tax reporting dashboard displaying collected sales tax totals per sub-merchant and platform-wide.  

**Technical Architecture & Specification:**  
Construct tax reporting interfaces in merchant dashboard (`app/(merchant)/analytics/taxes/`) and Super Admin console (`app/(office)/super-admin/taxes/`). Display collected tax totals by state, jurisdiction, and date range for easy filing with TaxCloud/state authorities.

**Granular Sub-Steps:**
- **Step 180.1:** Build merchant tax report view itemizing tax collected by US state and tax jurisdiction.
- **Step 180.2:** Build Super Admin platform-wide tax summary aggregating tax collected across all sub-merchants.
- **Step 180.3:** Provide CSV export of tax reporting lines for quarterly state tax filing.
- **Step 180.4:** Add unit tests verifying aggregation accuracy across multiple sub-merchants and states.

**Primary Files & Required Path Comments:**
- `// path: app/(merchant)/analytics/taxes/page.tsx`
- `// path: app/(office)/super-admin/taxes/page.tsx`
- `// path: lib/tax/reporting.ts`

**Verification & Quality Gate:**  
Generate tax report for Q1; verify state-by-state tax totals match ledger Account 2300 entries.

---

### Step 181: SaaS Subscription Plans Schema & Entitlements Definition
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Create `subscription_plans` schema defining plan tiers, prices, intervals, and included platform services.  

**Technical Architecture & Specification:**  
Migrate plan definitions in `db/migrations/058_subscription_plans.sql`. Super Admin configures plans: name, monthly/annual price in USD, and entitled services array (`invoicing`, `payment_links`, `recurring_billing`, `public_api`, `custom_branding`, `test_mode`).

**Granular Sub-Steps:**
- **Step 181.1:** Create `subscription_plans` table storing `name`, `price_usd`, `interval`, `entitlements JSONB`, `is_active`.
- **Step 181.2:** Create `company_subscriptions` table linking sub-merchants to active plan, status, and renewal dates.
- **Step 181.3:** Build Super Admin plan management UI (`app/(office)/super-admin/plans/`).
- **Step 181.4:** Seed default launch plans: Starter ($29/mo), Professional ($79/mo), Enterprise ($199/mo).

**Primary Files & Required Path Comments:**
- `// path: db/migrations/058_subscription_plans.sql`
- `// path: lib/billing/plans.ts`
- `// path: app/(office)/super-admin/plans/page.tsx`

**Verification & Quality Gate:**  
Create new plan in Super Admin console; verify plan details and entitlement array persist in database.

---

### Step 182: Plan Entitlements Guard & Feature Authorization Middleware
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build entitlement enforcement middleware blocking sub-merchants from accessing services outside their active plan.  

**Technical Architecture & Specification:**  
Implement feature gating engine in `lib/billing/entitlements.ts`. Check sub-merchant's active plan entitlements before permitting: API key creation, public payment links, recurring invoice schedules, custom branding, or store plugin connections.

**Granular Sub-Steps:**
- **Step 182.1:** Implement `hasEntitlement(companyId, entitlementKey)` querying cached company plan features.
- **Step 182.2:** Create route middleware and server action guard `requireEntitlement(key)` returning HTTP 403 / upgrade prompt.
- **Step 182.3:** Create UI component `<PlanUpgradeModal feature={...} />` displayed when accessing locked features.
- **Step 182.4:** Add unit tests verifying Starter plan merchant cannot generate public API keys or recurring schedules.

**Primary Files & Required Path Comments:**
- `// path: lib/billing/entitlements.ts`
- `// path: components/billing/PlanUpgradeModal.tsx`
- `// path: tests/billing/entitlements.test.ts`

**Verification & Quality Gate:**  
Attempt to create API key on plan lacking API entitlement; verify system blocks action and prompts for upgrade.

---

### Step 183: Merchant Subscription Balance-First Auto-Debit Engine
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build subscription billing engine debiting plan fee from merchant platform balance first, falling back to saved card.  

**Technical Architecture & Specification:**  
Implement subscription billing in `lib/billing/charge-subscription.ts`. On plan renewal due date: attempt debit first from sub-merchant Available Balance. If balance is insufficient, charge saved payment card stored in Super Admin platform gateway account.

**Granular Sub-Steps:**
- **Step 183.1:** Implement `processSubscriptionRenewal(companyId)` evaluating available balance.
- **Step 183.2:** If balance >= plan price: post double-entry journal debiting Merchant Available Balance and crediting Platform Subscription Revenue.
- **Step 183.3:** If balance insufficient: charge saved customer card token via platform gateway account.
- **Step 183.4:** Write tests verifying balance-first debit logic and fallback to card when balance is empty.

**Primary Files & Required Path Comments:**
- `// path: lib/billing/charge-subscription.ts`
- `// path: tests/billing/charge-subscription.test.ts`

**Verification & Quality Gate:**  
Execute subscription renewal on account with $100 balance; verify $29 fee is debited from balance with zero card charge.

---

### Step 184: Stored Card Mandate Legal Agreement & Future-Charge Consent Tracker
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build stored card mandate agreement recording explicit future-charge consent text, version, timestamp, and IP.  

**Technical Architecture & Specification:**  
Per card scheme and legal rules: saving a card for subscription fallback requires explicit merchant future-charge mandate agreement. Record consent text, mandate version, acceptance timestamp, and IP address in `subscription_card_mandates` table.

**Granular Sub-Steps:**
- **Step 184.1:** Create `subscription_card_mandates` table tracking `company_id`, `card_last4`, `consent_text`, `ip_address`, `accepted_at`.
- **Step 184.2:** Build mandate acceptance UI with explicit checkbox: 'I authorize KD Solution IT to charge this card for recurring subscription fees'.
- **Step 184.3:** Store card token via platform gateway account; delete token immediately upon account closure or cancellation.
- **Step 184.4:** Add unit tests verifying card cannot be saved without valid signed mandate record.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/059_card_mandates.sql`
- `// path: lib/billing/mandates.ts`
- `// path: components/billing/CardMandateCheckbox.tsx`

**Verification & Quality Gate:**  
Save card for subscription billing; verify database records explicit mandate text, IP, and timestamp.

---

### Step 185: 7-Day Pre-Due Warning & Automatic Due-Date Service Suspension Engine
**Phase:** Phase 12: Sales Tax Calculation (TaxCloud) & Billing Engine  
**Objective:** Build subscription alert engine sending warnings 7 days prior and instantly suspending services if unpaid on due date.  

**Technical Architecture & Specification:**  
Implement subscription lifecycle manager in `lib/billing/lifecycle.ts`. Dispatch email warnings 7 days before renewal. If balance debit and card charge both fail on due date: instantly suspend payment processing and public links. Keep login, billing page, and support open. Restore all services immediately upon successful payment.

**Granular Sub-Steps:**
- **Step 185.1:** Implement background job sending advance renewal warning emails 7 days prior to renewal.
- **Step 185.2:** If payment fails on due date: update company status to `suspended_unpaid_billing` and block payment processing.
- **Step 185.3:** Enforce access rules: sub-merchant can still log in, access billing payment screen, and open support tickets.
- **Step 185.4:** Upon payment success, automatically transition status back to `active` and re-enable all services instantly.

**Primary Files & Required Path Comments:**
- `// path: lib/billing/lifecycle.ts`
- `// path: tests/billing/lifecycle.test.ts`

**Verification & Quality Gate:**  
Simulate failed billing on due date; verify payment links disable, merchant logs in, and paying invoice restores services.

---

## Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links

### Step 186: Professional Invoice Data Model & Numbering Generator
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Design professional invoice schema with sequential numbering generator and custom prefix support.  

**Technical Architecture & Specification:**  
Migrate invoice schema in `db/migrations/060_create_invoices.sql`. Follow standard US and international commercial invoice formats. Support customizable invoice prefix (e.g. `INV-2026-`), sequential integer counter per merchant, currency USD only, issue date, due date, terms, and notes.

**Granular Sub-Steps:**
- **Step 186.1:** Create `invoices` table with `company_id`, `client_id`, `invoice_number`, `status`, `subtotal`, `tax_total`, `total`.
- **Step 186.2:** Implement sequential numbering generator using PostgreSQL sequences or atomic company counters.
- **Step 186.3:** Ensure invoice numbers are unique per sub-merchant company tenant.
- **Step 186.4:** Add indexes on `company_id`, `client_id`, `status`, and `due_date`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/060_create_invoices.sql`
- `// path: types/invoice.ts`
- `// path: lib/invoices/numbering.ts`

**Verification & Quality Gate:**  
Create 3 sequential invoices for merchant; verify invoice numbers increment monotonically (INV-0001, INV-0002, INV-0003).

---

### Step 187: Global Standard Invoice Formatting, Line Items & Multi-Tier Discounts
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build invoice line items manager supporting item descriptions, quantities, unit prices, and line/invoice discounts.  

**Technical Architecture & Specification:**  
Construct line items schema and UI in `components/invoices/LineItemsEditor.tsx`. Support line item ordering, quantity, rate in USD `numeric(18,4)`, percentage or fixed discounts, tax TIC codes, line item subtotals, and overall invoice discount calculation.

**Granular Sub-Steps:**
- **Step 187.1:** Create `invoice_items` table storing `invoice_id`, `description`, `quantity`, `unit_price`, `discount`, `total`.
- **Step 187.2:** Calculate line items and invoice totals using `numeric(18,4)` Decimal math.
- **Step 187.3:** Build interactive line items table with drag-and-drop row reordering in invoice builder.
- **Step 187.4:** Write tests verifying discount and tax calculations conserve penny precision.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/061_invoice_items.sql`
- `// path: components/invoices/LineItemsEditor.tsx`
- `// path: lib/invoices/totals.ts`

**Verification & Quality Gate:**  
Add 3 line items with 10% discount; verify subtotal, discount, and grand total calculate exactly.

---

### Step 188: Invoice Lifecycle State Machine & Editing Lock on Paid Records
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build invoice status state machine and enforce physical immutability locking once an invoice is paid.  

**Technical Architecture & Specification:**  
Implement invoice state machine in `lib/invoices/state-machine.ts`. Status workflow: `draft` -> `sent` -> `viewed` -> `partially_paid` -> `paid` -> `overdue` -> `void`. Crucial rule: once an invoice is marked paid, lock all fields against any further editing or deletion.

**Granular Sub-Steps:**
- **Step 188.1:** Define invoice status transition rules in `lib/invoices/state-machine.ts`.
- **Step 188.2:** Install database trigger blocking UPDATE on `invoices` where status is `paid`, except for void/reversal audit flags.
- **Step 188.3:** Provide invoice duplicate and void operations with automated audit logging.
- **Step 188.4:** Write tests verifying attempt to edit line items of a paid invoice throws `LockedInvoiceError`.

**Primary Files & Required Path Comments:**
- `// path: lib/invoices/state-machine.ts`
- `// path: db/migrations/062_invoice_lock_trigger.sql`
- `// path: tests/invoices/state-machine.test.ts`

**Verification & Quality Gate:**  
Pay invoice; attempt to change price or line items; verify system blocks modification and returns HTTP 400.

---

### Step 189: Partial Payment Acceptance Engine (Minimum USD $20 Threshold)
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build partial payment engine allowing installment payments with mandatory minimum of USD $20 per payment.  

**Technical Architecture & Specification:**  
Implement partial payment processing in `lib/invoices/partial-payments.ts`. Allow customers to pay invoices in parts. Enforce platform rule: partial payment amount must be at least USD $20.0000. Track remaining balance; transition status to `partially_paid` until final balance reaches zero.

**Granular Sub-Steps:**
- **Step 189.1:** Implement `processInvoicePartialPayment(invoiceId, amount)` checking `amount >= 20.0000`.
- **Step 189.2:** Reject partial payment attempts under $20 with `MinimumPartialPaymentError`.
- **Step 189.3:** Update `amount_paid` and compute `remaining_balance` atomically in transaction.
- **Step 189.4:** When `remaining_balance === 0`, transition status to `paid` and lock invoice.

**Primary Files & Required Path Comments:**
- `// path: lib/invoices/partial-payments.ts`
- `// path: tests/invoices/partial-payments.test.ts`

**Verification & Quality Gate:**  
Attempt $15 partial payment; verify rejection; submit $25 payment on $100 invoice; verify remaining balance is $75.

---

### Step 190: High-Fidelity Server-Side PDF Invoice Generation Pipeline
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build background worker generating professional PDF invoices and storing encrypted files in object storage.  

**Technical Architecture & Specification:**  
Implement PDF generator in `lib/pdf/invoice-pdf.ts` using `@react-pdf/renderer` or headless browser. Offload rendering to background worker to maintain light serverless runtime load. Encrypt generated PDF with AES-256-GCM and store in object storage.

**Granular Sub-Steps:**
- **Step 190.1:** Design clean PDF template `<InvoicePdfDocument invoice={invoice} company={company} />`.
- **Step 190.2:** Implement background job rendering PDF stream without blocking HTTP request thread.
- **Step 190.3:** Upload encrypted PDF to object storage and link file ID to invoice record.
- **Step 190.4:** Provide secure signed download URL on client token portal and merchant dashboard.

**Primary Files & Required Path Comments:**
- `// path: lib/pdf/invoice-pdf.ts`
- `// path: components/pdf/InvoicePdfDocument.tsx`
- `// path: tests/pdf/invoice-pdf.test.ts`

**Verification & Quality Gate:**  
Generate PDF for invoice; verify PDF renders with accurate line items, merchant logo, and downloads cleanly.

---

### Step 191: Estimates & Quotes Architecture with Automated Expiration Rules
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build Estimates & Quotes workflow supporting client review, expiration timestamps, and void states.  

**Technical Architecture & Specification:**  
Construct quotes module in `lib/estimates/index.ts`. Statuses: `draft`, `sent`, `viewed`, `accepted`, `declined`, `expired`, `void`. If client declines estimate or expiration timestamp passes, automatically transition estimate status to `void`.

**Granular Sub-Steps:**
- **Step 191.1:** Create `estimates` and `estimate_items` tables mirroring invoice data structures.
- **Step 191.2:** Implement background worker checking expiring estimates and setting status to `void`.
- **Step 191.3:** Provide client decline button on tokenized estimate link setting status to `void` immediately.
- **Step 191.4:** Write tests verifying declined or expired estimates cannot be converted or accepted.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/063_create_estimates.sql`
- `// path: lib/estimates/index.ts`
- `// path: app/(merchant)/estimates/page.tsx`

**Verification & Quality Gate:**  
Decline estimate via client portal; verify status transitions to `void` and cannot be re-opened.

---

### Step 192: Digital Signature & Legal E-Sign Audit Evidence Capture Engine
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build legal electronic signature engine capturing signer name, email, consent checkbox, IP, geo, device, and hash.  

**Technical Architecture & Specification:**  
Implement digital signature engine in `lib/estimates/signature.ts`. When client accepts estimate, capture: signer legal name, email, mandatory consent checkbox record, timestamp, IP address, geo-location, browser fingerprint, and SHA-256 document hash for legal non-repudiation.

**Granular Sub-Steps:**
- **Step 192.1:** Create `estimate_signatures` table storing all 8 forensic evidence fields with document hash.
- **Step 192.2:** Build signature pad and consent UI component in `components/estimates/SignaturePad.tsx`.
- **Step 192.3:** Generate cryptographic signature certificate appended to accepted estimate PDF.
- **Step 192.4:** Add unit tests verifying missing consent checkbox or invalid document hash blocks acceptance.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/064_estimate_signatures.sql`
- `// path: lib/estimates/signature.ts`
- `// path: components/estimates/SignaturePad.tsx`

**Verification & Quality Gate:**  
Sign estimate; verify database stores signer name, IP, device fingerprint, timestamp, and document hash.

---

### Step 193: Estimate-to-Invoice Conversion & Payment Link Auto-Generation
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build automated estimate-to-invoice converter generating invoice and payment link immediately upon client e-signature.  

**Technical Architecture & Specification:**  
Implement conversion workflow in `lib/estimates/convert.ts`. As soon as estimate receives valid digital signature: automatically clone items into a new invoice, assign invoice number, generate tokenized payment link, and redirect client directly to payment checkout.

**Granular Sub-Steps:**
- **Step 193.1:** Implement `convertEstimateToInvoice(estimateId)` in database transaction.
- **Step 193.2:** Clone line items, client details, and discounts from estimate into new invoice.
- **Step 193.3:** Generate tokenized invoice payment link and send email notice to merchant and client.
- **Step 193.4:** Redirect client browser directly to payment checkout page (`pay/[id]`).

**Primary Files & Required Path Comments:**
- `// path: lib/estimates/convert.ts`
- `// path: tests/estimates/convert.test.ts`

**Verification & Quality Gate:**  
Sign estimate; verify system converts estimate to invoice, displays payment link, and redirects to checkout.

---

### Step 194: Recurring Invoice Schedule Engine & Batch Generator
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build recurring invoice scheduling engine generating recurring invoices on weekly, monthly, or annual schedules.  

**Technical Architecture & Specification:**  
Construct recurring billing manager in `lib/invoices/recurring.ts`. Merchants configure schedule: client ID, line items, interval (weekly, monthly, quarterly, annual), start date, end date, and auto-send options. Background worker generates invoices on schedule.

**Granular Sub-Steps:**
- **Step 194.1:** Create `recurring_invoice_schedules` table tracking `company_id`, `client_id`, `interval`, `next_run_date`, `status`.
- **Step 194.2:** Implement batch worker running daily at 00:00 UTC generating scheduled invoices.
- **Step 194.3:** Dispatch generated invoice link automatically to client email if auto-send is enabled.
- **Step 194.4:** Write tests verifying next run date advances accurately across month boundaries and leap years.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/065_recurring_schedules.sql`
- `// path: lib/invoices/recurring.ts`
- `// path: app/(merchant)/recurring/page.tsx`

**Verification & Quality Gate:**  
Create monthly recurring schedule; trigger worker; verify invoice is generated and `next_run_date` advances 1 month.

---

### Step 195: Non-Retry Failed Recurring Payment Policy & Client Reminder Queue
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Enforce non-retry policy on failed recurring payments and schedule automated overdue client reminders.  

**Technical Architecture & Specification:**  
Per KD Solution IT billing rules: when recurring payment fails, there is NO automatic silent retry. Mark invoice as due or overdue immediately, dispatch reminder emails to client at configured intervals, and notify merchant to take needed action.

**Granular Sub-Steps:**
- **Step 195.1:** If recurring payment fails: set invoice status to `overdue`; forbid automated card retry loop.
- **Step 195.2:** Enqueue structured client reminder emails at +1 day, +3 days, and +7 days after due date.
- **Step 195.3:** Alert sub-merchant dashboard displaying failed recurring invoice in action required list.
- **Step 195.4:** Add unit tests verifying zero automated card re-charge attempts occur after initial failure.

**Primary Files & Required Path Comments:**
- `// path: lib/invoices/reminders.ts`
- `// path: tests/invoices/no-retry.test.ts`

**Verification & Quality Gate:**  
Simulate failed recurring charge; verify invoice marks overdue, zero retry occurs, and reminder email enqueues.

---

### Step 196: Tokenized Client Link Access Engine (i/[token] & e/[token])
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build tokenized link engine generating cryptographically secure URLs under `i/[token]` and `e/[token]`.  

**Technical Architecture & Specification:**  
Implement token generator in `lib/client-portal/tokens.ts`. Generate 256-bit cryptographically random tokens for invoices (`/i/[token]`) and estimates (`/e/[token]`). Clients access full interactive views and checkout without login. Defend against enumeration.

**Granular Sub-Steps:**
- **Step 196.1:** Create `document_tokens` table mapping high-entropy tokens to `invoice_id` or `estimate_id` with expiration.
- **Step 196.2:** Implement token resolver route fetching document and verifying active status.
- **Step 196.3:** Enforce strict rate limiting on tokenized routes to prevent brute-force token guessing.
- **Step 196.4:** Write tests verifying invalid or expired tokens return clean 404 without leaking document IDs.

**Primary Files & Required Path Comments:**
- `// path: lib/client-portal/tokens.ts`
- `// path: db/migrations/066_document_tokens.sql`
- `// path: tests/client-portal/tokens.test.ts`

**Verification & Quality Gate:**  
Access invoice via `/i/[token]`; verify invoice loads without login prompt and invalid token returns 404.

---

### Step 197: Paid Invoice Link Locking & Receipt Mode Enforcement
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Enforce rule: once an invoice is fully paid, its tokenized link permanently locks against payment and displays receipt.  

**Technical Architecture & Specification:**  
Per KD Solution IT platform rules: once an invoice is fully paid through its tokenized link, that link no longer accepts payment. Opening it displays the paid state, payment timestamp, and downloadable receipt. A partly paid invoice accepts only the remaining amount.

**Granular Sub-Steps:**
- **Step 197.1:** In tokenized invoice route `app/(client)/i/[token]/page.tsx`, check payment status on load.
- **Step 197.2:** If `status === 'paid'`, hide payment form and render read-only paid receipt with PDF download.
- **Step 197.3:** If `status === 'partially_paid'`, clamp maximum checkout amount to exact remaining balance.
- **Step 197.4:** Add unit tests verifying payment submission on fully paid invoice token is rejected with HTTP 400.

**Primary Files & Required Path Comments:**
- `// path: app/(client)/i/[token]/page.tsx`
- `// path: tests/client-portal/paid-locking.test.ts`

**Verification & Quality Gate:**  
Open tokenized link of paid invoice; verify payment button is disabled and paid receipt is displayed.

---

### Step 198: General Reusable Payment Links & Plan-Gated Hosted Checkout
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build reusable payment links engine allowing merchants to generate shareable payment links when included in plan.  

**Technical Architecture & Specification:**  
Construct payment links module in `lib/payment-links/index.ts`. Allow merchants to create fixed or custom amount payment links with custom descriptions. Enforce plan entitlement: service is usable only when included in merchant active plan.

**Granular Sub-Steps:**
- **Step 198.1:** Create `payment_links` table storing `company_id`, `slug`, `title`, `amount`, `is_active`, `redirect_url`.
- **Step 198.2:** Verify merchant plan contains `payment_links` entitlement before allowing link creation.
- **Step 198.3:** Build public payment link checkout route `app/(checkout)/link/[slug]/page.tsx`.
- **Step 198.4:** Add unit tests verifying deactivated payment links reject checkout attempts.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/067_payment_links.sql`
- `// path: lib/payment-links/index.ts`
- `// path: app/(checkout)/link/[slug]/page.tsx`

**Verification & Quality Gate:**  
Generate reusable payment link; open link in incognito browser; verify checkout page loads and processes payment.

---

### Step 199: Sub-Merchant Invoice Branding & Custom Logo Engine
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build invoice branding engine allowing merchants to upload business logo, set colors, and configure footer notes.  

**Technical Architecture & Specification:**  
Implement branding engine in `lib/branding/index.ts`. Allow merchants to upload logo (PNG/JPEG <= 2MB), set primary brand color, and configure custom invoice footer notes. Reflect branding across invoice web views, PDFs, and checkout if entitled in plan.

**Granular Sub-Steps:**
- **Step 199.1:** Create `merchant_branding` table storing `company_id`, `logo_file_id`, `primary_color`, `footer_note`.
- **Step 199.2:** Build branding settings screen (`app/(merchant)/settings/branding/page.tsx`) with live invoice preview.
- **Step 199.3:** Inject merchant branding into web invoice templates and PDF generator.
- **Step 199.4:** Fall back to default KD Solution IT platform branding if merchant plan excludes custom branding.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/068_merchant_branding.sql`
- `// path: lib/branding/index.ts`
- `// path: app/(merchant)/settings/branding/page.tsx`

**Verification & Quality Gate:**  
Upload merchant logo and primary color; verify invoice view displays merchant logo and custom color scheme.

---

### Step 200: Bulk Client & Product Catalog CSV Import Tool with Row Error Reporting
**Phase:** Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links  
**Objective:** Build high-performance CSV import tool importing clients and products with detailed row-by-row error reporting.  

**Technical Architecture & Specification:**  
Construct CSV data importer in `lib/import/csv.ts`. Allow bulk import of clients and product/service catalogs. Process row by row: import all valid rows successfully into database while reporting invalid rows with exact row numbers and error reasons.

**Granular Sub-Steps:**
- **Step 200.1:** Implement CSV parsing engine using `papaparse` with streaming support for large files.
- **Step 200.2:** Validate each row against client/product Zod schemas, collecting errors by row index.
- **Step 200.3:** Execute batch insert for valid rows in transaction; generate downloadable CSV of failed rows with error column.
- **Step 200.4:** Build import UI (`app/(merchant)/import/`) with drag-and-drop upload and progress indicator.

**Primary Files & Required Path Comments:**
- `// path: lib/import/csv.ts`
- `// path: app/(merchant)/import/page.tsx`
- `// path: tests/import/csv.test.ts`

**Verification & Quality Gate:**  
Upload CSV with 8 valid rows and 2 invalid rows; verify 8 rows import and UI highlights errors on rows 4 and 9.

---

## Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine

### Step 201: Sub-Merchant Refund Management Interface & Reversible Ledger Poster
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build refund management interface supporting full and partial refunds with automatic double-entry ledger reversals.  

**Technical Architecture & Specification:**  
Construct refund engine in `lib/payment/refund.ts`. Merchants request full or partial refund from dashboard (`app/(merchant)/refunds/`). Validate available balance, submit refund to payment processor, and post reversing ledger journal upon success.

**Granular Sub-Steps:**
- **Step 201.1:** Create `refunds` table storing `payment_id`, `company_id`, `amount`, `reason`, `gateway_refund_id`, `status`.
- **Step 201.2:** Post refund ledger journal: Debit Merchant Available Balance, Credit Processor Receivable.
- **Step 201.3:** Update payment status to `refunded` (full) or `partially_refunded` with residual balance.
- **Step 201.4:** Audit log all refund requests, approvals, and gateway execution in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/069_create_refunds.sql`
- `// path: lib/payment/refund.ts`
- `// path: app/(merchant)/refunds/page.tsx`

**Verification & Quality Gate:**  
Execute partial refund of $30 on $100 payment; verify processor executes refund and ledger debits merchant balance.

---

### Step 202: Platform Fee Refund Policy Switch (Return vs Retain Setting)
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build Super Admin platform fee refund policy switch configuring whether platform fee is returned or retained on refund.  

**Technical Architecture & Specification:**  
Per KD Solution IT business rules: whether the platform processing fee is returned to merchant upon refund is configurable by Super Admin globally or per merchant. Ledger posting engine adjusts reversing entries based on active setting.

**Granular Sub-Steps:**
- **Step 202.1:** Add `refund_platform_fee_policy` ('return' | 'retain') to platform and company settings.
- **Step 202.2:** If policy is 'return': reverse Platform Fee Revenue debiting fee back to merchant balance.
- **Step 202.3:** If policy is 'retain': leave Platform Fee Revenue intact and deduct full refund from merchant balance.
- **Step 202.4:** Write tests verifying ledger entries accurately reflect active fee refund policy.

**Primary Files & Required Path Comments:**
- `// path: lib/payment/fee-refund-policy.ts`
- `// path: tests/payment/fee-refund.test.ts`

**Verification & Quality Gate:**  
Toggle fee refund policy to 'retain'; execute refund and verify platform fee remains credited to platform revenue.

---

### Step 203: Multi-Gateway Dispute Webhook Ingestion & Tracking Subsystem
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build multi-gateway dispute ingestion engine capturing chargeback notifications and opening dispute records.  

**Technical Architecture & Specification:**  
Implement dispute tracker in `lib/disputes/ingest.ts`. Ingest chargeback webhooks from Stripe, NMI, Rainforest, and Airwallex. Record dispute in `disputes` table with provider dispute ID, charge ID, disputed amount, reason code, and submission deadline.

**Granular Sub-Steps:**
- **Step 203.1:** Create `disputes` table storing `company_id`, `payment_id`, `provider_dispute_id`, `amount`, `reason_code`, `deadline`.
- **Step 203.2:** Parse card scheme dispute reason codes (Visa, Mastercard, Amex, Discover) into human-readable categories.
- **Step 203.3:** Immediately freeze disputed amount from merchant Available Balance or Rolling Reserve.
- **Step 203.4:** Audit log dispute notification and dispatch urgent alert email to merchant owner.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/070_create_disputes.sql`
- `// path: lib/disputes/ingest.ts`
- `// path: tests/disputes/ingest.test.ts`

**Verification & Quality Gate:**  
Ingest test chargeback webhook; verify dispute record created, funds held, and alert email dispatched.

---

### Step 204: 24/48-Hour Merchant Timezone Dispute SLA & Alert Engine
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Enforce strict dispute response deadline of 24 hours (or 48h if configured) in merchant's own timezone with warning alerts.  

**Technical Architecture & Specification:**  
Per KD Solution IT dispute policy: merchant response deadline is 24 hours in the merchant's own timezone (Super Admin can configure 48h). Send automated email warnings immediately at hour 0 and at midpoint (hour 12/24). If unanswered, auto-submit available evidence.

**Granular Sub-Steps:**
- **Step 204.1:** Calculate deadline timestamp based on sub-merchant profile timezone: `NOW() + INTERVAL '24 hours'` (or 48h).
- **Step 204.2:** Dispatch immediate alert email at hour 0: 'URGENT: Chargeback Received - Action Required Within 24h'.
- **Step 204.3:** Dispatch midpoint reminder email at hour 12: 'WARNING: 12 Hours Remaining to Submit Dispute Evidence'.
- **Step 204.4:** Display prominent countdown timer banner on merchant dashboard while dispute is pending response.

**Primary Files & Required Path Comments:**
- `// path: lib/disputes/sla.ts`
- `// path: components/disputes/DisputeCountdownBanner.tsx`
- `// path: tests/disputes/sla.test.ts`

**Verification & Quality Gate:**  
Open dispute for Tokyo merchant; verify deadline calculates in JST timezone and midpoint alert fires at 12 hours.

---

### Step 205: Merchant Dispute Response Portal & Document Upload Pipeline
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build merchant dispute response portal allowing rebuttal narrative entry and supporting document uploads.  

**Technical Architecture & Specification:**  
Construct response portal in `app/(merchant)/disputes/[id]/page.tsx`. Provide rebuttal text editor, structured upload areas for proof of delivery, customer communications, refund policy acknowledgment, and tracking receipts with AES-256-GCM encryption.

**Granular Sub-Steps:**
- **Step 205.1:** Build dispute response form in `app/(merchant)/disputes/[id]/page.tsx` with deadline countdown.
- **Step 205.2:** Provide categorized file upload dropzones: Proof of Delivery, Communication Logs, Terms Acceptance.
- **Step 205.3:** Encrypt all uploaded dispute evidence files with AES-256-GCM prior to cloud storage transfer.
- **Step 205.4:** Audit log merchant evidence submission in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: app/(merchant)/disputes/[id]/page.tsx`
- `// path: lib/disputes/response.ts`
- `// path: tests/disputes/response.test.ts`

**Verification & Quality Gate:**  
Submit dispute rebuttal narrative and delivery receipt; verify files encrypt and status updates to `under_review`.

---

### Step 206: Structured Chargeback Evidence Pack Auto-Assembler
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build automated evidence pack assembler combining invoice, delivery proof, communications, and terms acceptance into single PDF.  

**Technical Architecture & Specification:**  
Implement evidence pack compiler in `lib/disputes/evidence-pack.ts`. Automatically compile: (1) Original invoice PDF; (2) Carrier tracking delivery confirmation; (3) Client communication logs; (4) Timestamped Terms of Service acceptance record with IP and device hash.

**Granular Sub-Steps:**
- **Step 206.1:** Implement `assembleEvidencePack(disputeId)` gathering all associated transaction records.
- **Step 206.2:** Compile records into standardized card network evidence PDF with table of contents and cover page.
- **Step 206.3:** Verify evidence pack complies with Visa and Mastercard dispute document formatting rules.
- **Step 206.4:** Store compiled evidence pack in object storage and attach to compliance review queue.

**Primary Files & Required Path Comments:**
- `// path: lib/disputes/evidence-pack.ts`
- `// path: tests/disputes/evidence-pack.test.ts`

**Verification & Quality Gate:**  
Trigger evidence pack assembly; verify resulting PDF bundles invoice, delivery proof, and terms record.

---

### Step 207: Compliance Four-Eye Dispute Review & Provider Submission Engine
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build Compliance review queue reviewing evidence pack before formal submission to payment processor.  

**Technical Architecture & Specification:**  
Construct review queue under `app/(office)/compliance/disputes/`. Compliance officer inspects merchant evidence pack for legal adequacy, adds internal notes, approves submission, and triggers API upload to acquiring processor or card network portal.

**Granular Sub-Steps:**
- **Step 207.1:** Build dispute review queue in `app/(office)/compliance/disputes/page.tsx`.
- **Step 207.2:** Compliance officer reviews assembled evidence pack, verifying document clarity and rebuttal completeness.
- **Step 207.3:** Submit approved evidence pack to gateway dispute API (Stripe, NMI, Rainforest, Airwallex).
- **Step 207.4:** Audit log compliance review decision and gateway submission timestamp in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/compliance/disputes/page.tsx`
- `// path: lib/disputes/submit.ts`
- `// path: tests/disputes/submit.test.ts`

**Verification & Quality Gate:**  
Approve dispute evidence in compliance queue; verify adapter submits evidence pack to gateway sandbox.

---

### Step 208: Chargeback Fee Deduction & Balance Offset Engine
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build chargeback fee deduction engine debiting Super Admin configured dispute fee from sub-merchant balance.  

**Technical Architecture & Specification:**  
Implement dispute fee poster in `lib/disputes/chargeback-fee.ts`. When chargeback occurs: debit Super Admin configured chargeback fee (e.g. $15.00 USD) from sub-merchant balance and credit Account 4200 (Dispute Fee Revenue). Deduct losses from balance or reserve.

**Granular Sub-Steps:**
- **Step 208.1:** Retrieve active chargeback fee amount configured by Super Admin (default $15.0000 USD).
- **Step 208.2:** Post double-entry journal: Debit Merchant Available Balance (Account 2000), Credit Dispute Fee Revenue (Account 4200).
- **Step 208.3:** If balance is insufficient, debit fee from Rolling Reserve (Account 2200).
- **Step 208.4:** Write tests verifying chargeback fee posts accurately and updates merchant statement breakdown.

**Primary Files & Required Path Comments:**
- `// path: lib/disputes/chargeback-fee.ts`
- `// path: tests/disputes/chargeback-fee.test.ts`

**Verification & Quality Gate:**  
Process chargeback; verify ledger debits $15 fee from merchant balance and records entry on settlement statement.

---

### Step 209: Graduated Card Scheme Chargeback Monitoring & Penalty Framework
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build graduated chargeback monitoring program applying warning -> extra reserve -> suspension upon threshold breach.  

**Technical Architecture & Specification:**  
Implement card network compliance framework in `lib/disputes/monitoring-program.ts`. Evaluate chargeback ratio: (1) Level 1 (>=0.3%): Warning notification and daily monitoring; (2) Level 2 (>=0.6%): Mandatory +5% rolling reserve and extended hold; (3) Level 3 (>=0.9%): Immediate processing suspension.

**Granular Sub-Steps:**
- **Step 209.1:** Implement automated daily evaluation scanning sub-merchant 90-day chargeback rates.
- **Step 209.2:** Trigger graduated intervention: Level 1 (warning), Level 2 (reserve escalation), Level 3 (suspension).
- **Step 209.3:** All threshold values are configurable by Super Admin with CEO confirmation.
- **Step 209.4:** Audit log all graduated risk escalations and notify merchant with remediation checklist.

**Primary Files & Required Path Comments:**
- `// path: lib/disputes/monitoring-program.ts`
- `// path: tests/disputes/monitoring-program.test.ts`

**Verification & Quality Gate:**  
Simulate merchant breaching 0.6% dispute threshold; verify system escalates reserve by +5% and notifies merchant.

---

### Step 210: Dispute Outcome Settlement & Ledger Reversal Finalizer
**Phase:** Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine  
**Objective:** Build dispute outcome webhook finalizer releasing held funds on win or finalizing loss against held balance on loss.  

**Technical Architecture & Specification:**  
Implement dispute outcome handler in `lib/disputes/outcome.ts`. Ingest provider outcome webhook: if Dispute WON: release held funds back to Merchant Available Balance; if Dispute LOST: finalize loss by posting chargeback loss journal against held funds.

**Granular Sub-Steps:**
- **Step 210.1:** Process dispute won webhook: transition status to `won`, reverse dispute hold, credit Available Balance.
- **Step 210.2:** Process dispute lost webhook: transition status to `lost`, debit held reserve, credit Processor Receivable.
- **Step 210.3:** Notify sub-merchant by email with detailed outcome report from card network.
- **Step 210.4:** Write tests verifying ledger balances correctly after dispute won vs dispute lost outcomes.

**Primary Files & Required Path Comments:**
- `// path: lib/disputes/outcome.ts`
- `// path: tests/disputes/outcome.test.ts`

**Verification & Quality Gate:**  
Simulate dispute won event; verify held funds return to merchant available balance with clean ledger journal.

---

## Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)

### Step 211: Merchant Public API Architecture & Masked Key Management
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build public API infrastructure allowing merchants to generate publishable and secret keys with masked display.  

**Technical Architecture & Specification:**  
Construct merchant API credentials module in `lib/api/keys.ts`. Merchants generate publishable keys (`pk_live_...`) and secret keys (`sk_live_...`). Hash secret keys with Argon2id; store only masked string (`••••••••••••abcd`). Never show secret key again after initial generation.

**Granular Sub-Steps:**
- **Step 211.1:** Create `api_keys` table storing `company_id`, `key_prefix`, `secret_hash`, `last4`, `is_test`, `is_active`.
- **Step 211.2:** Verify sub-merchant plan contains `public_api` entitlement before allowing key creation.
- **Step 211.3:** Provide one-time copy modal displaying full secret key strictly upon creation.
- **Step 211.4:** Provide key revocation and regeneration controls with immediate database invalidation.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/071_create_api_keys.sql`
- `// path: lib/api/keys.ts`
- `// path: app/(merchant)/developers/api-keys/page.tsx`

**Verification & Quality Gate:**  
Generate API key; verify full secret displays once, refreshes to masked string, and secret hash persists in database.

---

### Step 212: Bearer Token Authentication, HMAC Signatures & Rate Limiting
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build public API authentication middleware verifying Bearer tokens, enforcing rate limits, and audit logging calls.  

**Technical Architecture & Specification:**  
Implement public API middleware in `lib/api/auth.ts`. Validate `Authorization: Bearer sk_...` headers against `api_keys` table. Enforce tier-based rate limiting (100 requests/minute for standard merchants). Audit log every API call with latency and response status.

**Granular Sub-Steps:**
- **Step 212.1:** Implement `authenticateApiRequest(req)` extracting and verifying API bearer token.
- **Step 212.2:** Apply Redis/memory token bucket rate limiter returning HTTP 429 Too Many Requests when cap exceeded.
- **Step 212.3:** Inject authenticated company tenant context into database session for strict RLS isolation.
- **Step 212.4:** Add unit tests verifying invalid or revoked API keys return HTTP 401 Unauthorized.

**Primary Files & Required Path Comments:**
- `// path: lib/api/auth.ts`
- `// path: lib/api/rate-limit.ts`
- `// path: tests/api/auth.test.ts`

**Verification & Quality Gate:**  
Call API with valid bearer token; verify response succeeds; test with invalid token and verify 401 Unauthorized.

---

### Step 213: Store Payment Intent & Checkout Session API
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build public e-commerce checkout session API (`POST /v1/checkout/sessions`) for online store payments.  

**Technical Architecture & Specification:**  
Construct store checkout API in `app/api/v1/checkout/sessions/route.ts`. Accept store order details (amount, currency USD, order_id, line_items, return_url, cancel_url). Return session ID and hosted checkout redirect URL for online store payment completion.

**Granular Sub-Steps:**
- **Step 213.1:** Define checkout session request schema in `lib/validation/checkout-session.ts`.
- **Step 213.2:** Create `POST /api/v1/checkout/sessions` route generating hosted checkout session.
- **Step 213.3:** Return JSON: `{ session_id: 'cs_...', checkout_url: 'https://.../pay/cs_...' }`.
- **Step 213.4:** Handle success and cancel redirects back to merchant storefront with cryptographic signature.

**Primary Files & Required Path Comments:**
- `// path: app/api/v1/checkout/sessions/route.ts`
- `// path: lib/validation/checkout-session.ts`
- `// path: tests/api/checkout-session.test.ts`

**Verification & Quality Gate:**  
Post order payload to `/v1/checkout/sessions`; verify JSON returns valid checkout session URL.

---

### Step 214: Developer Sandbox & Complete Test Mode Isolation Environment
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build Developer Sandbox and Test Mode environment completely isolating test data from live production data.  

**Technical Architecture & Specification:**  
Per KD Solution IT architectural rules: every merchant has Test/Sandbox mode with separate credentials (`sk_test_...`, `pk_test_...`). Test payments move zero real money. Invoices, payment links, and store integrations can be fully exercised in test mode. Test data never mixes with live data.

**Granular Sub-Steps:**
- **Step 214.1:** Add `is_test BOOLEAN DEFAULT false` column to all transaction, invoice, and customer tables.
- **Step 214.2:** Partition database queries and API routing based on active `is_test` context.
- **Step 214.3:** Build test mode toggle switch on merchant dashboard header with clear visual amber banner.
- **Step 214.4:** Write tests verifying test mode payments do not debit live bank accounts or credit real balances.

**Primary Files & Required Path Comments:**
- `// path: lib/sandbox/context.ts`
- `// path: components/sandbox/TestModeBanner.tsx`
- `// path: tests/sandbox/isolation.test.ts`

**Verification & Quality Gate:**  
Toggle to Test Mode; create test invoice and charge; verify transaction is flagged `is_test=true` and live balance is untouched.

---

### Step 215: Simulated Webhooks Dispatcher for Merchant Integration Testing
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build developer webhook simulator allowing merchants to trigger simulated payment and dispute webhooks.  

**Technical Architecture & Specification:**  
Construct webhook simulator in `app/(merchant)/developers/webhooks/page.tsx`. Allow developers to dispatch mock webhook events (`payment.succeeded`, `payment.failed`, `dispute.opened`, `refund.processed`) to their configured test endpoint with valid HMAC signature.

**Granular Sub-Steps:**
- **Step 215.1:** Create `merchant_webhook_endpoints` table storing `url`, `secret`, `is_test`, `is_active`.
- **Step 215.2:** Implement webhook simulation dispatcher generating signed HMAC-SHA256 headers (`KD-Signature`).
- **Step 215.3:** Build simulation UI with event selector, payload editor, and immediate response status inspector.
- **Step 215.4:** Add unit tests verifying developer test endpoints receive well-formed signed payloads.

**Primary Files & Required Path Comments:**
- `// path: app/(merchant)/developers/webhooks/page.tsx`
- `// path: lib/sandbox/simulate-webhook.ts`
- `// path: tests/sandbox/webhook-sim.test.ts`

**Verification & Quality Gate:**  
Trigger simulated `payment.succeeded` event; verify destination endpoint receives webhook with valid signature.

---

### Step 216: Official Shopify App Architecture & OAuth Handshake Client
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build official Shopify Partner App architecture with automated OAuth handshake and merchant credential linkage.  

**Technical Architecture & Specification:**  
Implement Shopify App integration under `app/shopify/`. Handle Shopify OAuth install flow: merchant installs app from Shopify App Store, logs in with platform credentials, and links store automatically. Store Shopify access tokens securely.

**Granular Sub-Steps:**
- **Step 216.1:** Create `shopify_installations` table tracking `shop_domain`, `access_token`, `company_id`, `installed_at`.
- **Step 216.2:** Implement OAuth handshake routes `app/shopify/auth/route.ts` and `app/shopify/callback/route.ts`.
- **Step 216.3:** Verify Shopify HMAC parameters on all incoming install and redirect requests.
- **Step 216.4:** Write tests verifying OAuth callback links store domain to authenticated sub-merchant company ID.

**Primary Files & Required Path Comments:**
- `// path: app/shopify/auth/route.ts`
- `// path: app/shopify/callback/route.ts`
- `// path: lib/shopify/oauth.ts`

**Verification & Quality Gate:**  
Simulate Shopify install request; verify HMAC validates, OAuth completes, and store records link.

---

### Step 217: Shopify Hosted Payment Extension & Callback Handler
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build Shopify Payments App extension handling hosted payment redirects and order completion callbacks.  

**Technical Architecture & Specification:**  
Construct Shopify Payments App extension in `lib/shopify/payments.ts`. When customer checks out on Shopify: redirect to KD Solution IT hosted checkout, process payment, and notify Shopify via Payments App API (`paymentSessionResolve` or `paymentSessionReject`).

**Granular Sub-Steps:**
- **Step 217.1:** Implement Shopify payment session handler in `app/api/shopify/payment/route.ts`.
- **Step 217.2:** Render hosted payment page matching Shopify order details and currency.
- **Step 217.3:** Call Shopify GraphQL API `paymentSessionResolve` upon payment success to complete Shopify order.
- **Step 217.4:** Handle refund and dispute callbacks syncing status between platform and Shopify admin.

**Primary Files & Required Path Comments:**
- `// path: app/api/shopify/payment/route.ts`
- `// path: lib/shopify/payments.ts`
- `// path: tests/shopify/payments.test.ts`

**Verification & Quality Gate:**  
Execute test Shopify checkout redirect; verify payment completes and Shopify GraphQL confirms order resolution.

---

### Step 218: Official WooCommerce Plugin Architecture & Settings Page
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Develop official WooCommerce WordPress PHP plugin package with administrative settings screen.  

**Technical Architecture & Specification:**  
Build production-ready WooCommerce plugin in `plugins/woocommerce-kd-pay/`. Provide WordPress settings screen: API Publishable Key, Secret Key, Test Mode toggle, and Webhook Secret. Automatically register KD Pay as active WooCommerce payment gateway.

**Granular Sub-Steps:**
- **Step 218.1:** Create WordPress plugin entry file `plugins/woocommerce-kd-pay/woocommerce-kd-pay.php`.
- **Step 218.2:** Implement `WC_Gateway_KD_Pay` class extending `WC_Payment_Gateway`.
- **Step 218.3:** Build admin settings form for API credentials and test mode configuration.
- **Step 218.4:** Package plugin into downloadable zip archive for merchant download (`kd-solution-pay-woo.zip`).

**Primary Files & Required Path Comments:**
- `// path: plugins/woocommerce-kd-pay/woocommerce-kd-pay.php`
- `// path: plugins/woocommerce-kd-pay/class-wc-gateway-kd-pay.php`
- `// path: plugins/woocommerce-kd-pay/README.md`

**Verification & Quality Gate:**  
Verify PHP syntax and WooCommerce gateway class registration in plugin codebase.

---

### Step 219: WooCommerce Checkout Gateway & Webhook Verification Handler
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Implement WooCommerce checkout redirect, order note logging, and signature-verified webhook listener.  

**Technical Architecture & Specification:**  
Implement checkout processing in WooCommerce plugin. On checkout: call platform `/v1/checkout/sessions`, redirect customer to hosted checkout, listen for platform webhook on payment success, verify HMAC signature, update WooCommerce order to `Processing`, and add transaction note.

**Granular Sub-Steps:**
- **Step 219.1:** Implement `process_payment(order_id)` calling platform API and returning redirect URL.
- **Step 219.2:** Implement WooCommerce webhook endpoint `wc-api=kd_pay_webhook` verifying signature.
- **Step 219.3:** Update WooCommerce order status and record platform charge ID in order notes.
- **Step 219.4:** Handle failed payments and cancellations, restoring WooCommerce cart and inventory.

**Primary Files & Required Path Comments:**
- `// path: plugins/woocommerce-kd-pay/includes/class-kd-pay-checkout.php`
- `// path: plugins/woocommerce-kd-pay/includes/class-kd-pay-webhook.php`

**Verification & Quality Gate:**  
Simulate WooCommerce checkout session; verify order notes update on simulated webhook callback.

---

### Step 220: Interactive OpenAPI / Swagger Documentation & Developer Portal
**Phase:** Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)  
**Objective:** Build interactive OpenAPI 3.1 / Swagger documentation and developer portal under `app/(public)/docs/api/`.  

**Technical Architecture & Specification:**  
Construct developer documentation in `app/(public)/docs/api/`. Provide interactive OpenAPI 3.1 specification, code samples (cURL, Node.js, Python, PHP), request/response schemas, error code dictionaries, and webhook verification guides.

**Granular Sub-Steps:**
- **Step 220.1:** Define comprehensive OpenAPI 3.1 specification in `docs/api/openapi.json`.
- **Step 220.2:** Embed interactive Swagger UI / Scalar component in `app/(public)/docs/api/page.tsx`.
- **Step 220.3:** Provide copyable code snippets for store session creation and webhook signature validation.
- **Step 220.4:** Document error code dictionary and rate limiting specifications.

**Primary Files & Required Path Comments:**
- `// path: docs/api/openapi.json`
- `// path: app/(public)/docs/api/page.tsx`
- `// path: components/docs/CodeSnippet.tsx`

**Verification & Quality Gate:**  
Navigate to `/docs/api`; verify interactive API documentation renders with runnable code examples.

---

## Phase 16: Email System, Notifications & Template Engine

### Step 221: Dual-Driver Email Sending Engine (SMTP & Provider API)
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Build flexible email sending engine supporting SMTP and provider API drivers with single active configuration.  

**Technical Architecture & Specification:**  
Implement email sending engine in `lib/email/index.ts`. Support dual drivers: standard SMTP (nodemailer) and provider REST API (Resend, SendGrid, Postmark). One sending method is active at a time. Store credentials encrypted at rest.

**Granular Sub-Steps:**
- **Step 221.1:** Define `EmailDriver` interface with `sendEmail(options)` method in `lib/email/types.ts`.
- **Step 221.2:** Implement `SmtpEmailDriver` using `nodemailer` with TLS verification.
- **Step 221.3:** Implement `ApiEmailDriver` connecting to email provider REST API.
- **Step 221.4:** Create provider factory in `lib/email/factory.ts` resolving active driver from database settings.

**Primary Files & Required Path Comments:**
- `// path: lib/email/types.ts`
- `// path: lib/email/smtp.ts`
- `// path: lib/email/api.ts`
- `// path: lib/email/factory.ts`

**Verification & Quality Gate:**  
Send test email via mock driver; verify message delivery payload conforms to standard email interface.

---

### Step 222: Super Admin Email Settings with Mandatory Test Email Gate
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Build Super Admin email configuration console requiring successful test email receipt before activation.  

**Technical Architecture & Specification:**  
Construct email settings in `app/(office)/super-admin/email/`. Super Admin enters SMTP/API credentials. Per platform rule: activating new email configuration requires successful live test email send and verification first. Encrypt email secrets and show masked.

**Granular Sub-Steps:**
- **Step 222.1:** Create `email_settings` table storing `driver_type`, `encrypted_credentials`, `is_active`, `is_verified`.
- **Step 222.2:** Build email configuration UI with 'Send Test Email' button.
- **Step 222.3:** Enforce business rule: prevent saving configuration as active until test email returns HTTP 200 delivery success.
- **Step 222.4:** Audit log email configuration updates and test sends in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/super-admin/email/page.tsx`
- `// path: db/migrations/072_email_settings.sql`
- `// path: lib/email/admin.ts`

**Verification & Quality Gate:**  
Enter new SMTP configuration; verify system blocks activation toggle until live test email verifies successfully.

---

### Step 223: Super Admin Editable Email Template Engine with Placeholders
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Build editable email template engine allowing Super Admin to customize subject, HTML, and text templates.  

**Technical Architecture & Specification:**  
Construct template engine in `lib/email/templates.ts`. Store email templates in `email_templates` table. Allow Super Admin to edit subject and body with dynamic placeholders (e.g. `{{merchant_name}}`, `{{amount}}`, `{{invoice_url}}`). Provide live preview tool.

**Granular Sub-Steps:**
- **Step 223.1:** Create `email_templates` table storing `slug`, `subject`, `html_body`, `text_body`, `variables JSONB`.
- **Step 223.2:** Build template editor in `app/(office)/super-admin/email/templates/` with live syntax highlighting and preview.
- **Step 223.3:** Implement template compiler in `lib/email/compile.ts` substituting variables safely.
- **Step 223.4:** Seed all system notification templates in `db/seeds/email-templates.ts`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/073_email_templates.sql`
- `// path: lib/email/templates.ts`
- `// path: app/(office)/super-admin/email/templates/page.tsx`

**Verification & Quality Gate:**  
Edit welcome email template in admin UI; verify test render correctly substitutes dynamic variables.

---

### Step 224: Transactional Email Queue Worker & Exponential Backoff Retries
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Build asynchronous email delivery queue with background worker and exponential backoff retry logic.  

**Technical Architecture & Specification:**  
Implement email queue in `lib/email/queue.ts`. Offload email sending to background worker to prevent slowing down request handlers. Record delivery status, provider message ID, and retry failed sends up to 3 times with exponential backoff.

**Granular Sub-Steps:**
- **Step 224.1:** Create `email_queue` table tracking `template_slug`, `recipient`, `payload`, `status`, `retry_count`, `next_retry_at`.
- **Step 224.2:** Implement background worker processing queued emails and calling active email driver.
- **Step 224.3:** Implement exponential backoff retry: retry after 1 min, 5 mins, and 30 mins upon delivery failure.
- **Step 224.4:** Log final delivery failures and alert office team if queue failure rate spikes.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/074_email_queue.sql`
- `// path: lib/email/queue.ts`
- `// path: tests/email/queue.test.ts`

**Verification & Quality Gate:**  
Enqueue test email; verify worker processes queue, dispatches email, and records provider message ID.

---

### Step 225: Mandatory Security & Identity Notification Templates Implementation
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Implement automated transactional notification templates for authentication, security locks, and KYC decisions.  

**Technical Architecture & Specification:**  
Construct security notification templates: Welcome & Email Verification, Password Reset, Login Lockout Alert (2 failed attempts), New Device Detected Alert, KYC Submission Confirmation, KYC Approved, KYC Rejected, and Office Account Unlock Notice.

**Granular Sub-Steps:**
- **Step 225.1:** Implement templates: `auth.welcome`, `auth.verify-email`, `auth.password-reset`, `auth.lockout-alert`.
- **Step 225.2:** Implement templates: `auth.new-device`, `kyc.submitted`, `kyc.approved`, `kyc.rejected`, `auth.unlocked`.
- **Step 225.3:** Design clean, mobile-responsive HTML email layouts with platform logo and security advice footer.
- **Step 225.4:** Write tests verifying all security events trigger corresponding email enqueue actions.

**Primary Files & Required Path Comments:**
- `// path: lib/email/templates/security.ts`
- `// path: tests/email/security-templates.test.ts`

**Verification & Quality Gate:**  
Trigger account lockout; verify `auth.lockout-alert` email enqueues with accurate IP and lockout duration.

---

### Step 226: Billing, Invoicing & Payment Notification Templates Implementation
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Implement automated transactional notification templates for invoices, payments, refunds, disputes, and payouts.  

**Technical Architecture & Specification:**  
Construct financial notification templates: Invoice Sent to Client, Payment Received Confirmation, Payment Failed Notice, Refund Issued, Dispute Opened Warning (24h SLA), Dispute Midpoint Alert, Payout Dispatched, and Settlement Funds Released.

**Granular Sub-Steps:**
- **Step 226.1:** Implement templates: `invoice.sent`, `payment.received`, `payment.failed`, `refund.issued`.
- **Step 226.2:** Implement templates: `dispute.opened`, `dispute.reminder`, `payout.sent`, `settlement.released`.
- **Step 226.3:** Include itemized payment summaries, transaction IDs, and direct dashboard action links in templates.
- **Step 226.4:** Add unit tests verifying financial notifications render correct monetary amounts in USD.

**Primary Files & Required Path Comments:**
- `// path: lib/email/templates/financial.ts`
- `// path: tests/email/financial-templates.test.ts`

**Verification & Quality Gate:**  
Simulate payment received; verify `payment.received` email renders correct USD amount and receipt link.

---

### Step 227: Subscription Due Warning, Suspension & Restoration Email Engine
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Implement subscription lifecycle email notifications: 7-day warning, service stop notice, and service restore notice.  

**Technical Architecture & Specification:**  
Construct subscription billing notifications: (1) 7-day advance renewal warning with due date and amount; (2) Due-date billing failure and service suspension notice with pay link; (3) Payment received and service restoration confirmation notice.

**Granular Sub-Steps:**
- **Step 227.1:** Implement templates: `billing.7day-warning`, `billing.service-suspended`, `billing.service-restored`.
- **Step 227.2:** Hook notifications into subscription billing background scheduler.
- **Step 227.3:** Provide direct, zero-friction payment link in suspension email directing merchant to billing pay page.
- **Step 227.4:** Write tests verifying 7-day warning dispatches exactly 7 days prior to renewal.

**Primary Files & Required Path Comments:**
- `// path: lib/email/templates/subscription.ts`
- `// path: tests/email/subscription-templates.test.ts`

**Verification & Quality Gate:**  
Trigger subscription warning worker; verify 7-day warning email enqueues for due merchants.

---

### Step 228: Domain Authentication (SPF, DKIM, DMARC) & Marketing Subdomain Setup
**Phase:** Phase 16: Email System, Notifications & Template Engine  
**Objective:** Document and validate email domain authentication (SPF, DKIM, DMARC) with separate marketing sending subdomain.  

**Technical Architecture & Specification:**  
Establish domain reputation architecture in `docs/email/DOMAIN_AUTHENTICATION.md`. Require SPF, DKIM (2048-bit), and strict DMARC (`p=reject`) on transactional sending domain. Configure separate subdomain (e.g. `mail.kdsolution.it`) for marketing/newsletters as volume grows.

**Granular Sub-Steps:**
- **Step 228.1:** Create `docs/email/DOMAIN_AUTHENTICATION.md` with exact DNS record templates for SPF, DKIM, and DMARC.
- **Step 228.2:** Implement automated DNS record validator checking SPF and DMARC publication before launch.
- **Step 228.3:** Enforce separation: transactional emails send from root domain, marketing/blog emails from dedicated subdomain.
- **Step 228.4:** Add pre-launch checklist gate verifying domain authentication passes external validation.

**Primary Files & Required Path Comments:**
- `// path: docs/email/DOMAIN_AUTHENTICATION.md`
- `// path: scripts/verify-email-dns.ts`

**Verification & Quality Gate:**  
Run DNS verification script; verify SPF, DKIM, and DMARC validation checklist passes cleanly.

---

## Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog

### Step 229: Support Ticketing Subsystem with Secure File Attachments
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Build support ticketing system allowing merchants to open tickets, attach files, and receive email replies.  

**Technical Architecture & Specification:**  
Construct support ticketing module in `lib/support/tickets.ts`. Merchants submit tickets with category, priority, and encrypted file attachments. Support agents assign tickets, update status (`open`, `in_progress`, `waiting_client`, `resolved`), and communicate via email.

**Granular Sub-Steps:**
- **Step 229.1:** Create `support_tickets` and `ticket_messages` tables with UUIDv7 primary keys and company isolation.
- **Step 229.2:** Build merchant ticket interface (`app/(merchant)/support/`) with conversation thread view.
- **Step 229.3:** Support encrypted file attachments (screenshots, invoices) using storage adapter.
- **Step 229.4:** Send email notifications to merchant upon agent reply with direct reply-by-web link.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/075_support_tickets.sql`
- `// path: lib/support/tickets.ts`
- `// path: app/(merchant)/support/page.tsx`

**Verification & Quality Gate:**  
Open support ticket with file attachment; verify ticket persists, agent can view and reply, and merchant receives notification.

---

### Step 230: Support SLA Compliance Engine (1-Day Urgent / 72-Hour Payment)
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Build support SLA compliance monitor enforcing 1-business-day urgent response and 72-hour payment resolution.  

**Technical Architecture & Specification:**  
Per KD Solution IT support service levels: monetary urgent tickets receive first response within 1 business day; stuck payment inquiries receive final resolution within 72 hours. Track SLA timers, auto-escalate breached tickets, and record SLA compliance percentage.

**Granular Sub-Steps:**
- **Step 230.1:** Compute SLA deadlines on ticket creation based on category (monetary urgent = 24h business, stuck payment = 72h).
- **Step 230.2:** Build SLA tracking indicators in Support dashboard (`app/(office)/support/tickets/`).
- **Step 230.3:** Trigger automated supervisor alerts at 75% SLA countdown elapsed.
- **Step 230.4:** Generate monthly SLA compliance report measuring on-time response and resolution rates.

**Primary Files & Required Path Comments:**
- `// path: lib/support/sla.ts`
- `// path: app/(office)/support/sla-metrics/page.tsx`
- `// path: tests/support/sla.test.ts`

**Verification & Quality Gate:**  
Create urgent monetary ticket; verify system sets 1-business-day SLA deadline and tracks countdown.

---

### Step 231: Global Dismissible Popup Announcement Engine
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Build platform announcement engine displaying popup notices across dashboards with user dismiss tracking.  

**Technical Architecture & Specification:**  
Construct announcements system in `lib/announcements/index.ts`. Super Admin publishes announcements with title, content, target roles, and active date range. Popup displays across merchant and office dashboards; once dismissed by a user, it never appears again for that user.

**Granular Sub-Steps:**
- **Step 231.1:** Create `announcements` and `announcement_dismissals` tables tracking user dismissals.
- **Step 231.2:** Build Super Admin announcement publisher (`app/(office)/super-admin/announcements/`).
- **Step 231.3:** Create client modal component `<AnnouncementPopup announcement={...} />` checking dismissal state.
- **Step 231.4:** Add unit tests verifying dismissed announcement is never returned in user active announcements query.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/076_announcements.sql`
- `// path: lib/announcements/index.ts`
- `// path: components/announcements/AnnouncementPopup.tsx`

**Verification & Quality Gate:**  
Publish announcement; view as merchant; dismiss popup; refresh page and verify popup does not re-appear.

---

### Step 232: Public Status Page & Real-Time Incident Reporting Subsystem
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Build public status page displaying real-time system health and publishing incident updates and subscriber alerts.  

**Technical Architecture & Specification:**  
Construct public status page at `app/(public)/status/page.tsx`. Display component health: Web Application, Payment Processing, Webhook Ingestion, Public API, Database. Allow Super Admin to publish incident announcements and notify email subscribers.

**Granular Sub-Steps:**
- **Step 232.1:** Create `status_incidents` and `status_subscribers` tables in database.
- **Step 232.2:** Implement automated health ping endpoints checking database, storage, and gateway connectivity.
- **Step 232.3:** Build public status page UI (`app/(public)/status/page.tsx`) with historical uptime indicators.
- **Step 232.4:** Provide subscriber email alert broadcast when an incident is published or resolved.

**Primary Files & Required Path Comments:**
- `// path: app/(public)/status/page.tsx`
- `// path: db/migrations/077_status_page.sql`
- `// path: lib/status/incidents.ts`

**Verification & Quality Gate:**  
Navigate to `/status`; verify system component health cards render and incident feed displays cleanly.

---

### Step 233: Headless CMS Architecture for All Public Platform Pages
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Build headless CMS architecture allowing Super Admin and Blogger roles to edit public content without code changes.  

**Technical Architecture & Specification:**  
Construct CMS engine in `lib/cms/index.ts`. All public marketing and informational pages are editable via CMS. Store page content, sections, titles, and SEO metadata in `cms_pages` table. Provide live editor and version history in office console.

**Granular Sub-Steps:**
- **Step 233.1:** Create `cms_pages` table storing `slug`, `title`, `sections JSONB`, `seo_meta JSONB`, `author_id`.
- **Step 233.2:** Build visual CMS section editor in `app/(office)/blogger/cms/` and Super Admin console.
- **Step 233.3:** Implement dynamic page renderer matching public URL slugs to active CMS page records.
- **Step 233.4:** Audit log all CMS edits with before/after diffs in `audit_logs`.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/078_cms_pages.sql`
- `// path: lib/cms/index.ts`
- `// path: app/(office)/blogger/cms/page.tsx`

**Verification & Quality Gate:**  
Edit public page content via CMS; refresh public URL and verify new content renders immediately.

---

### Step 234: Public Core Pages (Home, Product, Company, Legal, Contact) with Turnstile
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Implement public marketing website: Home, Product, Company, Support, Contact, and Lead forms with Turnstile.  

**Technical Architecture & Specification:**  
Deploy core public website routes under `app/(public)/`. Build: Homepage with value proposition, Product features, Company about page, Support directory, and Contact/Lead forms protected by Cloudflare Turnstile anti-bot verification.

**Granular Sub-Steps:**
- **Step 234.1:** Create public pages: `app/(public)/page.tsx` (Home), `app/(public)/product/page.tsx`, `app/(public)/company/page.tsx`.
- **Step 234.2:** Create contact and lead capture form `app/(public)/contact/page.tsx` with Turnstile widget.
- **Step 234.3:** Enforce partner display naming rules: 'Global Payout Partners' and 'Local Payment Methods via Licensed Partners'.
- **Step 234.4:** Verify all public pages comply with WCAG AA accessibility and mobile responsiveness.

**Primary Files & Required Path Comments:**
- `// path: app/(public)/page.tsx`
- `// path: app/(public)/product/page.tsx`
- `// path: app/(public)/contact/page.tsx`

**Verification & Quality Gate:**  
Submit contact form with Turnstile token; verify lead captures in database and automated email triggers.

---

### Step 235: Public Transparent Pricing Page with 30-Day Version Notice
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Build public Pricing page showing transparent fee schedule with mandatory 30-day advance notice for price revisions.  

**Technical Architecture & Specification:**  
Deploy public pricing at `app/(public)/pricing/page.tsx`. Display transparent price list: platform fee %, processor fees, payout fees, chargeback fees, and refund fees. Per platform policy: any new price must be announced 30 days prior. Track pricing versions with effective dates.

**Granular Sub-Steps:**
- **Step 235.1:** Create `pricing_versions` table storing fee schedules, approval sign-offs, and effective dates.
- **Step 235.2:** Build public pricing table displaying transparent breakdown of who pays which fee.
- **Step 235.3:** Display advance notice banner if a pending pricing version is scheduled to take effect in next 30 days.
- **Step 235.4:** Enforce dual approval: pricing revisions require joint sign-off from Super Admin and CEO.

**Primary Files & Required Path Comments:**
- `// path: app/(public)/pricing/page.tsx`
- `// path: db/migrations/079_pricing_versions.sql`
- `// path: lib/cms/pricing.ts`

**Verification & Quality Gate:**  
Visit `/pricing`; verify complete fee schedule renders transparently and effective date version is visible.

---

### Step 236: SEO Metadata, Dynamic Sitemap & Schema.org Generator
**Phase:** Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog  
**Objective:** Build automated SEO metadata engine, dynamic sitemap (`sitemap.xml`), and Schema.org structured JSON-LD data.  

**Technical Architecture & Specification:**  
Implement SEO infrastructure in `app/sitemap.ts` and `app/robots.ts`. Dynamically generate sitemap including all public CMS pages, legal policies, and blog articles. Inject OpenGraph tags, Twitter cards, and Schema.org FinancialService JSON-LD structured data.

**Granular Sub-Steps:**
- **Step 236.1:** Implement `app/sitemap.ts` dynamically fetching public pages and blog posts.
- **Step 236.2:** Implement `app/robots.ts` permitting public indexing while blocking `/api/`, `/(merchant)/`, and `/(office)/`.
- **Step 236.3:** Inject Schema.org `FinancialService` and `Organization` JSON-LD data in public layout.
- **Step 236.4:** Add unit tests verifying sitemap generates valid XML with proper canonical URLs.

**Primary Files & Required Path Comments:**
- `// path: app/sitemap.ts`
- `// path: app/robots.ts`
- `// path: components/seo/JsonLd.tsx`

**Verification & Quality Gate:**  
Request `/sitemap.xml`; verify valid XML response indexing all public routes and excluding private dashboards.

---

## Phase 18: Company Accounting, Office Dashboards & Operations Metrics

### Step 237: Internal Platform Company Accounting Subsystem
**Phase:** Phase 18: Company Accounting, Office Dashboards & Operations Metrics  
**Objective:** Build platform corporate accounting subsystem tracking company revenue, operating expenses, and processor bills.  

**Technical Architecture & Specification:**  
Construct internal accounting subsystem in `lib/accounting/company-books.ts`. Track corporate income (platform fee revenue, subscription fees, dispute fee collections) and operating expenses (processor interchange bills, SaaS tooling, salaries, taxes) to produce financial statements.

**Granular Sub-Steps:**
- **Step 237.1:** Create `company_accounting_entries` table with standard base columns and UUIDv7 primary keys.
- **Step 237.2:** Post automated corporate revenue accruals from payment fee deductions and subscription billing.
- **Step 237.3:** Provide expense entry interface for Finance Ops to log processor invoices and operational overhead.
- **Step 237.4:** Generate corporate Profit & Loss (P&L) and Balance Sheet reports for executive management.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/080_company_accounting.sql`
- `// path: lib/accounting/company-books.ts`
- `// path: app/(office)/finance/accounting/page.tsx`

**Verification & Quality Gate:**  
Log test corporate expense; verify corporate P&L report updates with accurate net income.

---

### Step 238: Strict RBAC Isolation for Company Accounting Books
**Phase:** Phase 18: Company Accounting, Office Dashboards & Operations Metrics  
**Objective:** Enforce strict RBAC isolation restricting corporate accounting books strictly to Super Admin, CEO, and Finance Ops.  

**Technical Architecture & Specification:**  
Per KD Solution IT architectural mandate: the corporate accounting area is accessible strictly to `super_admin`, `ceo`, and `finance_ops`. Sub-merchants, support staff, and bloggers must have 100% zero access to corporate accounting tables, queries, or reports.

**Granular Sub-Steps:**
- **Step 238.1:** Install PostgreSQL RLS policy on `company_accounting_entries` denying access to all non-office roles.
- **Step 238.2:** Add Next.js middleware guard blocking `/finance/accounting/*` from unauthorized roles.
- **Step 238.3:** Ensure sub-merchant API queries never join or expose corporate accounting entries.
- **Step 238.4:** Write tests verifying merchant owner attempting to query accounting tables receives RLS denial.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/081_accounting_rls_lockdown.sql`
- `// path: tests/auth/accounting-isolation.test.ts`

**Verification & Quality Gate:**  
Query corporate accounting endpoints as merchant owner; verify request returns 403 Forbidden and zero records.

---

### Step 239: Super Admin Global Executive KPI Dashboard
**Phase:** Phase 18: Company Accounting, Office Dashboards & Operations Metrics  
**Objective:** Build global operations KPI dashboard displaying total processing volume, active merchants, chargeback rate, and revenue.  

**Technical Architecture & Specification:**  
Construct executive metrics console at `app/(office)/super-admin/metrics/page.tsx`. Aggregate and display real-time platform numbers: total processing volume, active merchant count, overall platform chargeback rate, average settlement hold time, and net platform revenue.

**Granular Sub-Steps:**
- **Step 239.1:** Build executive KPI overview in `app/(office)/super-admin/metrics/page.tsx` with high-contrast metric cards.
- **Step 239.2:** Implement high-performance aggregation queries using materialized views or indexed summary tables.
- **Step 239.3:** Display interactive volume trends, geographic volume distribution, and processor split charts.
- **Step 239.4:** Provide date range filters (Today, 7D, 30D, YTD, Custom) with instant recalculation.

**Primary Files & Required Path Comments:**
- `// path: app/(office)/super-admin/metrics/page.tsx`
- `// path: lib/metrics/platform-kpis.ts`
- `// path: components/admin/KpiCard.tsx`

**Verification & Quality Gate:**  
Access Super Admin metrics page; verify global volume, merchant count, and platform revenue display accurately.

---

### Step 240: Sub-Merchant Personal Analytics & Chargeback Dashboard
**Phase:** Phase 18: Company Accounting, Office Dashboards & Operations Metrics  
**Objective:** Build sub-merchant personal analytics console displaying own processing volume, chargeback rate, holds, and balance.  

**Technical Architecture & Specification:**  
Construct merchant analytics console at `app/(merchant)/analytics/page.tsx`. Mirror the transparency of executive metrics for the sub-merchant's own business: gross transaction volume, own chargeback rate against 0.3% threshold, held reserve total, and pending settlement.

**Granular Sub-Steps:**
- **Step 240.1:** Build merchant analytics overview in `app/(merchant)/analytics/page.tsx`.
- **Step 240.2:** Display personal chargeback rate gauge comparing active ratio against card scheme thresholds.
- **Step 240.3:** Display settlement schedule chart showing upcoming release dates for held funds.
- **Step 240.4:** Ensure queries are strictly tenant-isolated to sub-merchant's authenticated `company_id` via RLS.

**Primary Files & Required Path Comments:**
- `// path: app/(merchant)/analytics/page.tsx`
- `// path: lib/metrics/merchant-analytics.ts`
- `// path: components/merchant/ChargebackGauge.tsx`

**Verification & Quality Gate:**  
Log in as sub-merchant; verify personal analytics displays own volume, chargeback ratio, and upcoming payout dates.

---

### Step 241: Compliance Calendar Expiry Alert Scheduler
**Phase:** Phase 18: Company Accounting, Office Dashboards & Operations Metrics  
**Objective:** Build background alert scheduler tracking annual compliance calendar renewals and alerting office team.  

**Technical Architecture & Specification:**  
Implement automated calendar scanner in `lib/compliance/calendar-worker.ts`. Scan compliance calendar daily for upcoming expiration dates (PCI DSS AoC, corporate cyber insurance, penetration tests, acquiring bank licenses). Dispatch notifications at 90d, 60d, 30d, and 7d.

**Granular Sub-Steps:**
- **Step 241.1:** Implement background job querying `compliance_calendar` for items expiring in next 90 days.
- **Step 241.2:** Dispatch escalation emails to Compliance Officer and Super Admin for pending renewals.
- **Step 241.3:** Flag status as `action_required` on CEO and Compliance dashboards when within 30 days.
- **Step 241.4:** Add unit tests verifying worker dispatches alerts at correct threshold intervals.

**Primary Files & Required Path Comments:**
- `// path: lib/compliance/calendar-worker.ts`
- `// path: tests/compliance/calendar-worker.test.ts`

**Verification & Quality Gate:**  
Seed calendar item expiring in 25 days; trigger worker; verify status flags urgent and alert email enqueues.

---

### Step 242: Sub-Merchant Account Closure & 7-Year Regulatory Retention Engine
**Phase:** Phase 18: Company Accounting, Office Dashboards & Operations Metrics  
**Objective:** Build merchant account closure workflow holding chargeback liability funds, shredding card tokens, and archiving 7 years.  

**Technical Architecture & Specification:**  
Implement account closure in `lib/merchant/closure.ts`. When merchant requests closure: hold chargeback liability buffer until 120-day chargeback window closes, disburse remaining balance to bank, instantly delete all saved card tokens, and retain transaction/KYC records for 7 years.

**Granular Sub-Steps:**
- **Step 242.1:** Implement `initiateAccountClosure(companyId)` setting status to `closing_pending_chargeback_window`.
- **Step 242.2:** Hold reserve buffer covering potential chargeback liabilities until dispute window expires (120 days).
- **Step 242.3:** Instantly delete all stored card tokens associated with departing merchant.
- **Step 242.4:** Apply regulatory archival lock preserving all transaction and KYC audit records for mandatory 7-year period.

**Primary Files & Required Path Comments:**
- `// path: lib/merchant/closure.ts`
- `// path: db/migrations/082_account_closure.sql`
- `// path: tests/merchant/closure.test.ts`

**Verification & Quality Gate:**  
Initiate account closure; verify card tokens delete, chargeback liability holds for 120 days, and data archives for 7 years.

---

## Phase 19: Background Jobs Engine, Schedulers & Workers

### Step 243: Distributed Background Job Queue Architecture & Task Runner
**Phase:** Phase 19: Background Jobs Engine, Schedulers & Workers  
**Objective:** Build robust background task runner executing asynchronous jobs with distributed locks and failure monitoring.  

**Technical Architecture & Specification:**  
Construct central background job engine in `lib/jobs/runner.ts`. Use PostgreSQL or Redis backed queue to orchestrate jobs: sub-merchant provisioning, email dispatch, webhook processing, settlement release, subscription charges, and reconciliation. Support distributed locking and failure alerts.

**Granular Sub-Steps:**
- **Step 243.1:** Create `background_jobs` table tracking `job_name`, `payload`, `status`, `scheduled_at`, `locked_until`.
- **Step 243.2:** Implement job worker polling loop with advisory lock acquisition to prevent duplicate execution across instances.
- **Step 243.3:** Implement retry policy with exponential backoff and dead-letter queue for failed tasks.
- **Step 243.4:** Expose job health metrics and alert office team if any background worker stalls or fails.

**Primary Files & Required Path Comments:**
- `// path: db/migrations/083_background_jobs.sql`
- `// path: lib/jobs/runner.ts`
- `// path: tests/jobs/runner.test.ts`

**Verification & Quality Gate:**  
Enqueue background job; verify worker acquires lock, executes task, and marks job completed.

---

### Step 244: Settlement Holding Period Release & Multi-Gate Verification Worker
**Phase:** Phase 19: Background Jobs Engine, Schedulers & Workers  
**Objective:** Build automated daily settlement release worker evaluating fulfilment and risk gates before releasing held funds.  

**Technical Architecture & Specification:**  
Implement settlement release worker in `lib/jobs/settlement-release.ts`. Run daily at 01:00 UTC. Scan pending settlements: release funds to Available Balance only if holding period has elapsed AND delivery tracking is verified AND account has zero blocking disputes or reviews.

**Granular Sub-Steps:**
- **Step 244.1:** Query pending settlements where `hold_matures_at <= NOW()`.
- **Step 244.2:** Verify all fulfilment and risk gates pass via `isSettlementFulfilmentCleared` and `evaluatePayoutEligibility`.
- **Step 244.3:** Post double-entry journal moving funds from Account 2100 (Pending Settlement) to Account 2000 (Available Balance).
- **Step 244.4:** Audit log all batch settlement releases and notify merchants with released settlement summary.

**Primary Files & Required Path Comments:**
- `// path: lib/jobs/settlement-release.ts`
- `// path: tests/jobs/settlement-release.test.ts`

**Verification & Quality Gate:**  
Run settlement release worker; verify eligible matured transactions release to available balance and ungated funds remain held.

---

### Step 245: Daily Sanctions (OFAC/UN/EU/UK HMT) & PEP Automated Rescreening Worker
**Phase:** Phase 19: Background Jobs Engine, Schedulers & Workers  
**Objective:** Build automated daily sanctions rescreening worker checking all active merchants and UBOs against latest lists.  

**Technical Architecture & Specification:**  
Implement daily sanctions screening worker in `lib/jobs/sanctions-rescreen.ts`. Run nightly at 02:00 UTC. Download updated OFAC, UN, EU, and UK HMT lists. Rescreen all active sellers, directors, and UBOs. Detect stale feeds and alert office immediately if screening run is missed.

**Granular Sub-Steps:**
- **Step 245.1:** Download and verify latest publication hashes of international sanctions lists.
- **Step 245.2:** Execute fuzzy match against all active sub-merchant company names and UBO identities.
- **Step 245.3:** If screening feed is stale (>24 hours without update), alert office and block affected activation/payout decisions.
- **Step 245.4:** Record screening execution timestamp and matched results in `sanctions_screening_logs`.

**Primary Files & Required Path Comments:**
- `// path: lib/jobs/sanctions-rescreen.ts`
- `// path: tests/jobs/sanctions-rescreen.test.ts`

**Verification & Quality Gate:**  
Trigger daily sanctions worker; verify all active accounts are scanned and screening log timestamp updates.

---

### Step 246: Scheduled Re-KYC Evaluator & Sudden Volume Spike Detection Worker
**Phase:** Phase 19: Background Jobs Engine, Schedulers & Workers  
**Objective:** Build background worker checking annual/biennial Re-KYC schedules and detecting sudden volume anomaly spikes.  

**Technical Architecture & Specification:**  
Implement Re-KYC and anomaly worker in `lib/jobs/re-kyc-worker.ts`. Check 12-month (Tier 3) and 24-month (Tiers 1/2) Re-KYC deadlines. Detect sudden processing volume spikes (>3x average monthly volume in 48 hours). Flag accounts for compliance review and freeze payouts until cleared.

**Granular Sub-Steps:**
- **Step 246.1:** Scan `re_kyc_schedules` table for accounts approaching re-verification due dates.
- **Step 246.2:** Calculate 48-hour volume velocity; if velocity exceeds 300% of merchant historical average, flag volume spike.
- **Step 246.3:** Restrict payout capabilities and open review ticket in compliance dashboard for flagged accounts.
- **Step 246.4:** Dispatch notification email to merchant requesting updated business documents.

**Primary Files & Required Path Comments:**
- `// path: lib/jobs/re-kyc-worker.ts`
- `// path: tests/jobs/re-kyc-worker.test.ts`

**Verification & Quality Gate:**  
Simulate volume spike 4x normal; verify worker flags account, restricts payouts, and creates review ticket.

---

### Step 247: Audit Log Hash Chain Verification & Merkle Root Archival Worker
**Phase:** Phase 19: Background Jobs Engine, Schedulers & Workers  
**Objective:** Build daily audit log integrity worker verifying SHA-256 hash chains, Ed25519 signatures, and anchoring Merkle roots.  

**Technical Architecture & Specification:**  
Implement audit integrity worker in `lib/jobs/audit-integrity.ts`. Run nightly at 23:59 UTC. Verify unbroken continuity of hash chain across all audit entries created in past 24 hours, validate Ed25519 signatures, compute daily Merkle root, and persist root in `audit_merkle_roots` table.

**Granular Sub-Steps:**
- **Step 247.1:** Scan daily batch of `audit_logs` asserting `current_hash = SHA256(prev_hash + sequence + payload)` for every row.
- **Step 247.2:** Verify Ed25519 cryptographic signatures for all sampled batch entries.
- **Step 247.3:** Calculate 32-byte Merkle root for daily batch and insert into `audit_merkle_roots` table.
- **Step 247.4:** Alert office team immediately if any broken hash chain or tampered entry is detected.

**Primary Files & Required Path Comments:**
- `// path: lib/jobs/audit-integrity.ts`
- `// path: tests/jobs/audit-integrity.test.ts`

**Verification & Quality Gate:**  
Run audit integrity worker; verify full 24-hour hash chain validates and daily Merkle root is generated.

---

## Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification

### Step 248: Full-Stack Performance Audit, Bundle Budgeting & Cache Optimization
**Phase:** Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification  
**Objective:** Execute performance audit enforcing Server Components, zero N+1 queries, Core Web Vitals, and light runtime load.  

**Technical Architecture & Specification:**  
Perform comprehensive performance hardening in `docs/performance/AUDIT_REPORT.md`. Enforce Next.js React Server Components by default. Verify pagination on every list, joined single queries, zero queries inside loops, database connection pooling, and sub-500ms cold start budgets on Vercel and Netlify.

**Granular Sub-Steps:**
- **Step 248.1:** Execute bundle analyzer; verify client JavaScript bundle size remains under 120KB gzipped for initial load.
- **Step 248.2:** Audit database queries across all API routes; verify absence of N+1 query loops and presence of indexes on foreign keys.
- **Step 248.3:** Configure Cache-Control headers: public marketing pages cached; merchant dashboards use private short-lived cache.
- **Step 248.4:** Verify Google Lighthouse score >= 90 for Performance, Accessibility, Best Practices, and SEO on public pages.

**Primary Files & Required Path Comments:**
- `// path: docs/performance/AUDIT_REPORT.md`
- `// path: scripts/audit-performance.ts`

**Verification & Quality Gate:**  
Run `npm run audit:performance`; verify bundle budgets, zero N+1 queries, and Lighthouse scores pass.

---

### Step 249: Disaster Recovery Rehearsal, Backup Restore & Rollback Verification
**Phase:** Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification  
**Objective:** Execute disaster recovery restore rehearsal on staging, verify point-in-time recovery, and validate migration rollbacks.  

**Technical Architecture & Specification:**  
Per KD Solution IT launch gates: perform live database restore rehearsal on staging. Validate PostgreSQL Point-In-Time Recovery (PITR). Restore file storage backups. Run complete forward database migration followed by clean backward rollback script to guarantee zero orphaned database state.

**Granular Sub-Steps:**
- **Step 249.1:** Execute point-in-time backup restore of Supabase PostgreSQL database on staging environment.
- **Step 249.2:** Verify restored database data integrity, hash-chained audit continuity, and zero data corruption.
- **Step 249.3:** Execute full forward and backward migration cycle test (`npm run migrate:test-cycle`).
- **Step 249.4:** Record restore rehearsal results and recovery time objective (RTO < 30 mins) in `docs/dr/RESTORE_REHEARSAL.md`.

**Primary Files & Required Path Comments:**
- `// path: docs/dr/RESTORE_REHEARSAL.md`
- `// path: scripts/rehearse-dr.ts`

**Verification & Quality Gate:**  
Run disaster recovery rehearsal script; confirm staging database restores cleanly with verified audit chain continuity.

---

### Step 250: Production Go-Live Verification Gates & Final Launch Readiness Sign-Off
**Phase:** Phase 20: Performance, Observability, Disaster Recovery & Go-Live Verification  
**Objective:** Execute comprehensive production launch verification gates, live gateway tests, and CEO/Super Admin sign-off.  

**Technical Architecture & Specification:**  
Execute final production go-live verification checklist: (1) All 250 steps verified complete; (2) Production environment variables validated; (3) Live gateway keys tested via built-in connection tester; (4) Turnstile verified on production domain; (5) First Super Admin account created with mandatory 2FA; (6) Status page published; (7) Formal sign-off recorded.

**Granular Sub-Steps:**
- **Step 250.1:** Run automated production readiness suite `npm run verify:go-live` checking env vars, database, and storage.
- **Step 250.2:** Execute live test transaction cycle (sandbox payment, refund, webhook) across all 5 payment processors.
- **Step 250.3:** Verify production domain HTTPS enforcement, HSTS, security headers, and Sentry error capture.
- **Step 250.4:** Record formal production launch sign-off certificate signed by CEO and Super Admin in `docs/final/GO_LIVE_SIGNOFF.md`.

**Primary Files & Required Path Comments:**
- `// path: scripts/verify-go-live.ts`
- `// path: docs/final/GO_LIVE_SIGNOFF.md`
- `// path: docs/final/HANDOFF.md`

**Verification & Quality Gate:**  
Execute `npm run verify:go-live`; verify all 250 production gates pass with green status and zero blocking findings.

---

## Production Go-Live & Release Verification Protocol

Every step in this plan must be verified before proceeding to the next. The final production release is unlocked only when all 250 steps pass the following automated gates:

1. **Typecheck & Linter Gate:** `npm run typecheck` and `npm run lint` pass with zero warnings, zero implicit any types, and 100% first-line path comment compliance.
2. **Database Migration & Rollback Gate:** All migrations in `db/migrations/` pass clean forward and reverse rollback cycles on staging without orphaned schema objects.
3. **Cryptographic Audit Gate:** Hash-chained audit logs verify 100% chain continuity and valid Ed25519 signatures; daily Merkle root export validates.
4. **Ledger Invariant Balance Gate:** Automated invariant monitor verifies `SUM(debit) - SUM(credit) = 0` across all journals and confirms custodial cash covers all merchant liabilities.
5. **Gateway Sandbox Payment & Refund Cycles:** Successful end-to-end sandbox authorization, capture, refund, and webhook cycles recorded across all 5 payment processors (NMI, Payoneer, Rainforest, Stripe Connect, Airwallex).
6. **Dual Sign-Off Gate:** Formal production sign-off certificate approved and Ed25519-signed by both CEO and Super Admin in `docs/final/GO_LIVE_SIGNOFF.md`.

// End of STEP_PLAN_250.md