# // path: plan_generator/group1.py
# Phase 1 (Steps 001 - 015) and Phase 2 (Steps 016 - 030)

GROUP_1 = [
    # Phase 1: Project Setup, Tooling & Platform Architecture (001 - 015)
    {
        "number": "001",
        "title": "Next.js 14/15 App Router & Strict TypeScript Setup",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Initialize the enterprise Next.js App Router repository with TypeScript configured in maximum strict mode, absolute path aliases, and baseline directory structure.",
        "description": "Establish the foundational runtime and build environment using Next.js with React Server Components (RSC) enabled by default. Enforce TypeScript strictness with noImplicitAny, strictNullChecks, and exactOptionalPropertyTypes to guarantee compile-time type safety across all platform modules.",
        "substeps": [
            ("001.1", "Initialize Next.js project with App Router, TypeScript, and ESLint in root directory."),
            ("001.2", "Configure `tsconfig.json` with strict mode, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`, and path aliases (`@/*` mapping to `./*`)."),
            ("001.3", "Create standard project directories: `app/`, `components/`, `lib/`, `db/`, `types/`, `docs/`, and `tests/`."),
            ("001.4", "Configure package scripts for `dev`, `build`, `start`, `lint`, and `typecheck`.")
        ],
        "files": ["// path: tsconfig.json", "// path: package.json", "// path: next.config.js"],
        "verification": "Run `npm run typecheck` and `npm run build` to ensure clean zero-error compilation with zero implicit any types."
    },
    {
        "number": "002",
        "title": "Tailwind CSS, Design System Primitives & UI Component Library",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Set up Tailwind CSS, Radix UI headless primitives, Lucide icons, and accessible responsive design tokens tailored for Asian and global merchant workflows.",
        "description": "Establish a consistent, high-performance UI foundation using Tailwind CSS and Radix UI. Ensure lightweight bundle sizes, zero runtime CSS-in-JS overhead, WCAG AA compliance, responsive mobile/desktop layouts, and light/dark theme contrast tokens.",
        "substeps": [
            ("002.1", "Install and configure Tailwind CSS, PostCSS, Autoprefixer, and `@tailwindcss/forms`."),
            ("002.2", "Define enterprise color palette, typography, borders, and spacing tokens in `tailwind.config.ts`."),
            ("002.3", "Install Radix UI primitives for dialogs, dropdowns, tooltips, popovers, and accordions."),
            ("002.4", "Create reusable atomic UI components in `components/ui/` (Button, Input, Select, Badge, Card, Modal, Table).")
        ],
        "files": ["// path: tailwind.config.ts", "// path: app/globals.css", "// path: components/ui/Button.tsx", "// path: components/ui/Input.tsx"],
        "verification": "Verify all UI primitives render correctly in responsive viewports with zero console warnings and pass accessibility linter."
    },
    {
        "number": "003",
        "title": "English-Only Centralized String Dictionary & i18n Guard",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Enforce strict English-only platform standard with all user-facing strings centralized in `lib/i18n/strings/en.ts` and automated static analysis guards.",
        "description": "Per KD Solution IT platform rules, all UI copy, error messages, seed data, notifications, and code comments must be strictly in English. Centralize all string keys in a strongly typed dictionary to prevent untranslated strings, typos, and hardcoded literals.",
        "substeps": [
            ("003.1", "Create `lib/i18n/strings/en.ts` with structured namespaces for auth, billing, compliance, kyc, checkout, and admin."),
            ("003.2", "Implement typed string lookup utility `t(key, params)` with compile-time key validation."),
            ("003.3", "Develop an ESLint rule or pre-commit AST scanner forbidding hardcoded English/non-English text literals in JSX/TSX."),
            ("003.4", "Add unit tests verifying string completeness, placeholder substitution, and missing key detection.")
        ],
        "files": ["// path: lib/i18n/strings/en.ts", "// path: lib/i18n/index.ts", "// path: tests/i18n/strings.test.ts"],
        "verification": "Run AST scanner script to confirm no raw string literals exist outside the centralized dictionary and tests pass."
    },
    {
        "number": "004",
        "title": "Decimal Money Math & Fixed Precision (numeric(18,4)) Engine",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Build a zero-floating-point-error financial calculation library using fixed decimal precision and standard USD formatting.",
        "description": "Implement a financial math engine built on `decimal.js` or `bignumber.js` enforcing PostgreSQL `numeric(18,4)` compliance. Ban JavaScript native floating point math for all money calculations (fees, taxes, reserves, splits, refunds, and ledger debits/credits).",
        "substeps": [
            ("004.1", "Install `decimal.js` and configure global precision to 18 digits with 4 decimal places rounding (HALF_EVEN/Banker's rounding)."),
            ("004.2", "Create `lib/money/money.ts` with immutable methods: `add`, `sub`, `mul`, `div`, `round`, `compare`, and `allocate`."),
            ("004.3", "Implement USD currency formatter `formatUSD(amount)` producing standard currency representations."),
            ("004.4", "Write comprehensive unit test suite covering rounding edge cases, fractional cents, and multi-party fee splits.")
        ],
        "files": ["// path: lib/money/money.ts", "// path: lib/money/types.ts", "// path: tests/money/money.test.ts"],
        "verification": "Run unit tests verifying 100% precision on splitting $100 across 3 parties with exact penny conservation and zero precision loss."
    },
    {
        "number": "005",
        "title": "Multi-Vector Input Sanitization Pipeline",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Construct a universal sanitization engine defending against XSS, SQLi, CSRF, SSRF, header injection, null bytes, path traversal, and Unicode homograph exploits.",
        "description": "Create a unified security middleware and utility layer that sanitizes all incoming payloads before reaching validation and database queries. Normalize Unicode using NFC, strip null bytes (`\\0`), remove path traversal markers (`../`), and sanitize HTML using DOMPurify.",
        "substeps": [
            ("005.1", "Implement `sanitizeString(input)` handling null bytes, Unicode NFC normalization, and control characters."),
            ("005.2", "Implement HTML sanitization using `isomorphic-dompurify` with strict attribute allowlists."),
            ("005.3", "Create SSRF protection utility validating outbound HTTP URLs against private IP ranges (RFC 1918, loopbacks, link-local, cloud metadata)."),
            ("005.4", "Create request pipeline wrapper in `lib/security/sanitize.ts` with deep object recursive sanitization.")
        ],
        "files": ["// path: lib/security/sanitize.ts", "// path: lib/security/ssrf.ts", "// path: tests/security/sanitize.test.ts"],
        "verification": "Execute security test suite verifying rejection of XSS vectors, null byte truncation, AWS metadata URLs (169.254.169.254), and directory traversal attempts."
    },
    {
        "number": "006",
        "title": "Zod Validation Framework for Client & Server APIs",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Establish unified Zod schema definitions with automatic client-side and server-side request/response validation.",
        "description": "Standardize all data ingestion across HTTP endpoints, server actions, webhooks, and forms using Zod. Create reusable primitives for UUIDv7, email, phone (E.164), monetary strings, country codes (ISO 3166-1 alpha-2), and MCC codes.",
        "substeps": [
            ("006.1", "Define core Zod schema primitives in `lib/validation/primitives.ts` (UUIDv7, MoneyString, CountryCode, CurrencyCode, SafeText)."),
            ("006.2", "Create server request validator middleware `validateRequest(schema)` returning standard RFC 7807 error responses."),
            ("006.3", "Implement React Hook Form resolver integration using `@hookform/resolvers/zod`."),
            ("006.4", "Write schema validation unit tests verifying boundary values, invalid types, and error message formatting.")
        ],
        "files": ["// path: lib/validation/primitives.ts", "// path: lib/validation/middleware.ts", "// path: tests/validation/primitives.test.ts"],
        "verification": "Ensure invalid payloads return structured HTTP 422 errors with precise field path pointers and clean error messages."
    },
    {
        "number": "007",
        "title": "Structured Logging & Correlation ID Tracing",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Build high-performance JSON structured logger attaching correlation IDs, tenant IDs, actor IDs, and Sentry context to all events.",
        "description": "Implement enterprise structured logging using Pino or Winston formatting to stdout in JSON. Enforce automatic correlation tracing with `x-correlation-id` headers across API boundaries, server actions, database queries, and background tasks.",
        "substeps": [
            ("007.1", "Create `lib/logger/logger.ts` configuring JSON output, timestamping, log levels (debug, info, warn, error, fatal)."),
            ("007.2", "Implement correlation ID middleware generating UUIDv7 trace IDs and attaching them to request async local storage."),
            ("007.3", "Ensure sensitive fields (passwords, card tokens, API secrets, Tax IDs) are automatically redacted in log serializes."),
            ("007.4", "Integrate log handler with Sentry breadcrumbs for error tracking.")
        ],
        "files": ["// path: lib/logger/logger.ts", "// path: lib/logger/context.ts", "// path: lib/logger/redact.ts"],
        "verification": "Trigger test requests and verify JSON log output includes correlationId, companyId, and confirms full masking of sensitive keys."
    },
    {
        "number": "008",
        "title": "Error Handling Framework & Custom Error Hierarchy",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Develop a centralized application error hierarchy mapping internal exceptions to secure, sanitized client responses.",
        "description": "Create a robust error architecture subclassing standard Error into AppError, ValidationError, AuthenticationError, AuthorizationError, ConcurrencyError, LedgerError, and GatewayError. Prevent internal stack trace leakage to external callers.",
        "substeps": [
            ("008.1", "Define custom error classes in `lib/errors/index.ts` with HTTP status codes, error codes, and operational flags."),
            ("008.2", "Implement global error boundary component in Next.js App Router (`app/error.tsx`, `app/global-error.tsx`)."),
            ("008.3", "Create API error response formatter transforming exceptions into RFC 7807 Problem Details JSON format."),
            ("008.4", "Configure automated Sentry capture for non-operational or unexpected 500 errors.")
        ],
        "files": ["// path: lib/errors/index.ts", "// path: app/error.tsx", "// path: lib/errors/handler.ts"],
        "verification": "Simulate validation, authentication, and database failure scenarios; verify clean client JSON response without stack traces."
    },
    {
        "number": "009",
        "title": "Payment Idempotency Engine & Distributed Locking",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Implement an idempotency key engine for payment operations to prevent duplicate charges, concurrent race conditions, and double-settlement.",
        "description": "Require `Idempotency-Key` headers on all mutating payment, refund, and payout APIs. Use Redis or database advisory locks to ensure concurrent identical requests await the primary execution and receive cached identical responses.",
        "substeps": [
            ("009.1", "Create `idempotency_keys` table tracking key, company_id, request_hash, response_payload, status, and expires_at."),
            ("009.2", "Implement `withIdempotency(key, handler)` middleware managing locking (PENDING, COMPLETED, FAILED)."),
            ("009.3", "Hash incoming request body and verify payload matches original request when reusing key; reject mismatches with HTTP 422."),
            ("009.4", "Add unit tests simulating simultaneous concurrent requests with identical keys verifying exactly one execution.")
        ],
        "files": ["// path: lib/idempotency/index.ts", "// path: db/migrations/001_idempotency.sql", "// path: tests/idempotency/idempotency.test.ts"],
        "verification": "Run concurrent race test with 10 threads; verify only 1 charge executes and 9 receive cached response with HTTP 200/201."
    },
    {
        "number": "010",
        "title": "Optimistic Concurrency Control Engine",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Implement optimistic locking across all editable records using version columns to eliminate lost update anomalies.",
        "description": "Ensure every editable entity (merchant profiles, invoices, gateway configs, risk tiers, and ledger accounts) increments a `version` column on update. Detect conflicting concurrent mutations and return explicit HTTP 409 Conflict errors.",
        "substeps": [
            ("010.1", "Define standard TypeScript entity interface with `version: number`."),
            ("010.2", "Create `executeOptimisticUpdate(table, id, expectedVersion, data)` database utility function."),
            ("010.3", "Implement conflict detection logic: if rows updated equals 0, throw ConcurrencyError(HTTP 409)."),
            ("010.4", "Add client-side UX feedback pattern notifying user of stale data and offering safe reload/merge.")
        ],
        "files": ["// path: lib/db/concurrency.ts", "// path: tests/db/concurrency.test.ts"],
        "verification": "Test concurrent edits to same invoice; verify first write succeeds (version 1->2) and second write raises HTTP 409."
    },
    {
        "number": "011",
        "title": "Multi-Environment Configuration & .env.example Validation",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Enforce strict runtime environment variable validation with complete `.env.example` template and zero hardcoded secrets.",
        "description": "Create strict Zod environment schema in `lib/config/env.ts` verifying all required secrets, API keys, database URLs, and feature flags on startup. Crash immediately with descriptive errors if any production variable is missing or malformed.",
        "substeps": [
            ("011.1", "Define comprehensive environment Zod schema in `lib/config/env.ts` separating server and public variables."),
            ("011.2", "Create `.env.example` documenting every required variable with descriptive placeholders and zero sensitive values."),
            ("011.3", "Implement startup validation hook in `next.config.js` and server initialization to prevent running with invalid config."),
            ("011.4", "Add environment variable presence check script for CI/CD pipelines.")
        ],
        "files": ["// path: lib/config/env.ts", "// path: .env.example", "// path: scripts/validate-env.ts"],
        "verification": "Run `npm run build` with missing required environment variables; verify build fails immediately with explicit list of missing keys."
    },
    {
        "number": "012",
        "title": "Sentry Error Monitoring & Performance Tracing Setup",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Configure Sentry SDK for client, server, and edge runtimes with PII scrubbing, release tracking, and performance budgets.",
        "description": "Integrate `@sentry/nextjs` for real-time exception tracking across Vercel and Netlify deployments. Configure `beforeSend` hooks to redact credit card tokens, bank account numbers, passwords, and KYC personal data.",
        "substeps": [
            ("012.1", "Install `@sentry/nextjs` and configure `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`."),
            ("012.2", "Implement PII scrubbing sanitizers in `beforeSend` removing authorization headers, card tokens, and email bodies."),
            ("012.3", "Configure release tagging matching Git commit SHA and environment (development, staging, production)."),
            ("012.4", "Set up sample rates: 1.0 for errors, 0.1 for performance transactions to maintain light runtime overhead.")
        ],
        "files": ["// path: sentry.client.config.ts", "// path: sentry.server.config.ts", "// path: sentry.edge.config.ts"],
        "verification": "Trigger test exception; verify Sentry receives event with correlationId and verified zero sensitive PII in breadcrumbs."
    },
    {
        "number": "013",
        "title": "Cloudflare Turnstile Anti-Bot Verification Engine",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Build invisible Cloudflare Turnstile CAPTCHA integration protecting public signup, login, password reset, and contact forms.",
        "description": "Implement privacy-preserving bot detection using Cloudflare Turnstile. Create reusable client component and server verification helper verifying tokens against Cloudflare API with client IP validation and fail-closed logic.",
        "substeps": [
            ("013.1", "Create `components/security/TurnstileWidget.tsx` client component handling token acquisition and refresh."),
            ("013.2", "Implement `verifyTurnstileToken(token, clientIp)` in `lib/security/turnstile.ts` with timeout and retry."),
            ("013.3", "Create server action/route middleware rejecting requests missing valid Turnstile verification."),
            ("013.4", "Add mock Turnstile bypass strictly in local development/test mode with explicit environment flag.")
        ],
        "files": ["// path: components/security/TurnstileWidget.tsx", "// path: lib/security/turnstile.ts", "// path: tests/security/turnstile.test.ts"],
        "verification": "Test public signup endpoint; verify missing/invalid Turnstile token is rejected with HTTP 403 Forbidden."
    },
    {
        "number": "014",
        "title": "Light Runtime Deployment Configuration for Vercel and Netlify",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Configure deployment manifests for Vercel and Netlify ensuring identical runtime behavior, security headers, and light edge compute load.",
        "description": "Set up dual deployment configurations (`vercel.json` and `netlify.toml`). Enforce strict Content Security Policy (CSP), HSTS, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy. Offload heavy PDF/email rendering to background workers.",
        "substeps": [
            ("014.1", "Create `vercel.json` with memory limits, function regions (Singapore/Tokyo for Asian latency), and security headers."),
            ("014.2", "Create `netlify.toml` with build settings, headers, redirects, and environment variable bindings."),
            ("014.3", "Implement Content Security Policy (CSP) header generator in `middleware.ts` supporting Collect.js and Stripe iframes."),
            ("014.4", "Configure bundle analyzer and build budgets to guarantee serverless cold starts remain under 500ms.")
        ],
        "files": ["// path: vercel.json", "// path: netlify.toml", "// path: middleware.ts"],
        "verification": "Inspect HTTP response headers on preview server; verify CSP, HSTS, and X-Frame-Options: DENY are present and valid."
    },
    {
        "number": "015",
        "title": "First-Line Path Comment Linter & Automated Tooling Pipeline",
        "phase": "Phase 1: Project Setup, Tooling & Platform Architecture",
        "objective": "Establish automated linter enforcing repository standard requiring `// path: relative/path/to/file` on line 1 of every file.",
        "description": "Create a custom linter and pre-commit hook that verifies every source file (.ts, .tsx, .js, .sql, .md, .css) begins with an accurate relative path comment. Ensure full compliance with KD Solution IT documentation standards.",
        "substeps": [
            ("015.1", "Create Node.js script `scripts/lint-path-comments.ts` scanning repository files for correct line 1 path comments."),
            ("015.2", "Implement auto-fix mode (`--fix`) to automatically insert or update path comments based on file path."),
            ("015.3", "Configure Husky pre-commit hook and npm script `npm run lint:paths`."),
            ("015.4", "Add GitHub Actions CI check step verifying 100% path comment coverage.")
        ],
        "files": ["// path: scripts/lint-path-comments.ts", "// path: .husky/pre-commit", "// path: package.json"],
        "verification": "Run `npm run lint:paths`; verify all repository files pass with zero path mismatch errors."
    },

    # Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines (016 - 030)
    {
        "number": "016",
        "title": "Supabase PostgreSQL Setup & Connection Pool Configuration",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Configure Supabase PostgreSQL database connection pooling using PgBouncer/Supabase pooler for transaction and session modes.",
        "description": "Establish reliable, low-latency database connectivity supporting high-concurrency serverless execution. Configure transaction-mode pooling for standard mutations and session-mode pooling for prepared statements and listen/notify channels.",
        "substeps": [
            ("016.1", "Create `lib/db/client.ts` initializing Supabase client and direct PostgreSQL connection pool via `postgres` or `pg`."),
            ("016.2", "Configure connection limits, idle timeouts, and retry logic for serverless execution environments."),
            ("016.3", "Implement database health check utility `checkDbHealth()` verifying connectivity and pool latency."),
            ("016.4", "Add connection error interceptor logging telemetry and reporting pool exhaustion to Sentry.")
        ],
        "files": ["// path: lib/db/client.ts", "// path: lib/db/health.ts", "// path: tests/db/client.test.ts"],
        "verification": "Run health check query; verify response under 50ms and seamless reconnect on dropped connections."
    },
    {
        "number": "017",
        "title": "PostgreSQL UUIDv7 Extension & Generator Functions",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Deploy time-ordered UUIDv7 generation function in PostgreSQL and TypeScript for high-performance B-tree index locality.",
        "description": "Implement UUID version 7 as the mandatory primary key type for all database tables. Combine 48-bit UNIX millisecond timestamp with 74 bits of cryptographically strong randomness to ensure temporal clustering and zero B-tree fragmentation.",
        "substeps": [
            ("017.1", "Create SQL migration `002_uuidv7_function.sql` defining PostgreSQL function `generate_uuid_v7()`."),
            ("017.2", "Create TypeScript client library `lib/db/uuidv7.ts` generating identical UUIDv7 strings application-side."),
            ("017.3", "Implement UUIDv7 extractor utility retrieving timestamp from any valid UUIDv7 identifier."),
            ("017.4", "Add unit tests verifying monotonic ordering and collision resistance across 100,000 rapid iterations.")
        ],
        "files": ["// path: db/migrations/002_uuidv7_function.sql", "// path: lib/db/uuidv7.ts", "// path: tests/db/uuidv7.test.ts"],
        "verification": "Generate 1,000 UUIDs and verify exact chronological sort order and compliance with RFC 9562."
    },
    {
        "number": "018",
        "title": "Base Table Standard Columns & Timestamp Triggers Migration",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Establish mandatory base columns and automated updated_at timestamp triggers across all database tables.",
        "description": "Per KD Solution IT architectural mandate, every table must contain: `id UUIDv7`, `company_id UUIDv7`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`, and `version INT`. Create reusable database functions and triggers.",
        "substeps": [
            ("018.1", "Create SQL migration `003_base_columns_and_triggers.sql` defining reusable updated_at timestamp trigger function."),
            ("018.2", "Create SQL helper function enforcing standard column constraints on table creation."),
            ("018.3", "Define TypeScript `BaseEntity` interface and abstract repository base class reflecting standard columns."),
            ("018.4", "Write database test verifying automatic update of `updated_at` on row mutation.")
        ],
        "files": ["// path: db/migrations/003_base_columns_and_triggers.sql", "// path: types/entity.ts", "// path: lib/db/repository.ts"],
        "verification": "Mutate sample row; confirm `updated_at` updates automatically and `version` is properly initialized to 1."
    },
    {
        "number": "019",
        "title": "Row Level Security (RLS) Default-Deny Policy Setup",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Enable Row Level Security on all PostgreSQL tables with an ironclad default-deny policy preventing cross-tenant data leaks.",
        "description": "Activate PostgreSQL RLS (`ENABLE ROW LEVEL SECURITY`) and enforce default denial (`FORCE ROW LEVEL SECURITY`) across all existing and future tables. Require explicit policy grant rules for every query operation.",
        "substeps": [
            ("019.1", "Create SQL migration `004_enable_rls_default_deny.sql` applying `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`."),
            ("019.2", "Apply `ALTER TABLE ... FORCE ROW LEVEL SECURITY` ensuring table owners and superusers cannot bypass policies by mistake."),
            ("019.3", "Create automated database migration linter script verifying every new migration explicitly enables RLS."),
            ("019.4", "Write integration test attempting unauthenticated query; verify zero rows returned (default deny).")
        ],
        "files": ["// path: db/migrations/004_enable_rls_default_deny.sql", "// path: scripts/lint-rls.ts", "// path: tests/db/rls.test.ts"],
        "verification": "Run query without tenant session headers; verify database returns empty result set or access denied."
    },
    {
        "number": "020",
        "title": "PostgreSQL Tenant Session Variable Infrastructure",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Build session context injector setting `app.current_company_id` and `app.current_user_id` inside PostgreSQL transaction blocks.",
        "description": "Implement parameterized session variable setter executing `SET LOCAL app.current_company_id = '...'` at the start of each transaction. Base all tenant-isolated RLS policies on `current_setting('app.current_company_id', true)`.",
        "substeps": [
            ("020.1", "Create SQL helper functions `set_tenant_context(company_id, user_id)` and `clear_tenant_context()` in PostgreSQL."),
            ("020.2", "Implement transactional database wrapper `withTenantContext(companyId, userId, fn)` in `lib/db/tenant.ts`."),
            ("020.3", "Create global RLS policy template checking `company_id = current_setting('app.current_company_id')::uuid`."),
            ("020.4", "Write tests verifying complete isolation between tenant A and tenant B inside identical connection pool connections.")
        ],
        "files": ["// path: db/migrations/005_tenant_session_functions.sql", "// path: lib/db/tenant.ts", "// path: tests/db/tenant-isolation.test.ts"],
        "verification": "Execute concurrent queries for Company 1 and Company 2; verify neither can access rows belonging to the other."
    },
    {
        "number": "021",
        "title": "Companies & Sub-Merchant Tenant Schema Migration",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Create core `companies` table modeling sub-merchant tenants with legal attributes, country controls, and risk tiers.",
        "description": "Design and migrate the central tenant table storing sub-merchant identity: legal business name, trade name, business type, registration number, country of incorporation, operating address, MCC code, platform fee overrides, and risk tier (1, 2, or 3).",
        "substeps": [
            ("021.1", "Create SQL migration `006_create_companies_table.sql` with full standard base columns and indexes."),
            ("021.2", "Add fields: `legal_name`, `dba_name`, `country`, `mcc`, `risk_tier`, `status` (draft, under_review, active, suspended, closed)."),
            ("021.3", "Add financial settings fields: `custom_fee_percent`, `custom_hold_days`, `reserve_percent`, `reserve_hold_days`."),
            ("021.4", "Create RLS policy permitting sub-merchants to view own company and office roles to view across tenants.")
        ],
        "files": ["// path: db/migrations/006_create_companies_table.sql", "// path: types/company.ts", "// path: lib/db/companies.ts"],
        "verification": "Verify table schema, constraints, indexes, and successful RLS isolation on company record queries."
    },
    {
        "number": "022",
        "title": "Users & Staff Identities Schema Migration",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Create `users` table supporting merchant owners and office staff with lockout counters, status, and security metadata.",
        "description": "Establish the global user identities table storing email, password hash, phone hash, full legal name, failed login attempt counters, locked_until timestamp, 2FA secret reference, is_staff flag, and status (pending_verification, active, locked, suspended).",
        "substeps": [
            ("022.1", "Create SQL migration `007_create_users_table.sql` with UUIDv7 primary keys and standard base columns."),
            ("022.2", "Add indexes on `email` (lowercase unique), `phone_hash`, and `status`."),
            ("022.3", "Include security columns: `failed_attempts INT DEFAULT 0`, `locked_until TIMESTAMPTZ`, `password_changed_at TIMESTAMPTZ`."),
            ("022.4", "Implement RLS policies allowing users to read/update only their own identity record.")
        ],
        "files": ["// path: db/migrations/007_create_users_table.sql", "// path: types/user.ts", "// path: lib/db/users.ts"],
        "verification": "Verify unique constraints on email, default zero failed attempts, and RLS enforcement."
    },
    {
        "number": "023",
        "title": "Company Memberships & Multi-Tenant Linkage Schema",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Create `company_members` join table establishing role assignments, permissions, and tenant associations.",
        "description": "Model the relationship between users and companies. Support single-owner sub-merchant accounts and office staff assignments with explicit roles (super_admin, ceo, compliance_kyc, finance_ops, support, blogger, owner).",
        "substeps": [
            ("023.1", "Create SQL migration `008_create_company_members_table.sql` with foreign keys to users and companies."),
            ("023.2", "Add columns: `user_id`, `company_id`, `role`, `status` (active, invited, revoked), `invited_at`, `accepted_at`."),
            ("023.3", "Enforce unique constraint on `(user_id, company_id)` and one-owner-per-company business rule."),
            ("023.4", "Write database helper querying all active memberships and permissions for an authenticated user.")
        ],
        "files": ["// path: db/migrations/008_create_company_members_table.sql", "// path: types/membership.ts", "// path: lib/db/memberships.ts"],
        "verification": "Insert membership record; verify foreign key constraints and query membership by user ID."
    },
    {
        "number": "024",
        "title": "Hash-Chained Append-Only Audit Log Schema Migration",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Design and migrate the cryptographic hash-chained audit log table capturing every mutation across the platform.",
        "description": "Construct an append-only audit log table where each entry computes a SHA-256 hash chaining back to the previous entry's hash (`prev_hash`). Record sequence_id, company_id, actor_id, action, entity_type, entity_id, diff_payload, IP address, user agent, and cryptographic signature.",
        "substeps": [
            ("024.1", "Create SQL migration `009_create_audit_logs_table.sql` with BIGSERIAL sequence_id and UUIDv7 primary key."),
            ("024.2", "Add columns: `prev_hash VARCHAR(64)`, `current_hash VARCHAR(64)`, `signature VARCHAR(128)`, `actor_id UUID`, `action VARCHAR(100)`, `payload JSONB`."),
            ("024.3", "Add indexes on `company_id`, `action`, `entity_type`, `created_at`, and `sequence_id`."),
            ("024.4", "Define TypeScript interfaces for structured audit log payloads and event categories.")
        ],
        "files": ["// path: db/migrations/009_create_audit_logs_table.sql", "// path: types/audit.ts", "// path: lib/audit/types.ts"],
        "verification": "Verify table schema, indexing, and JSONB payload storage capability."
    },
    {
        "number": "025",
        "title": "Audit Log Tamper-Proofing Database Rules & Triggers",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Install PostgreSQL rules and triggers strictly forbidding UPDATE, DELETE, and TRUNCATE operations on `audit_logs`.",
        "description": "Ensure physical immutability of audit records at the database engine level. Create PostgreSQL rules raising fatal exceptions on any attempt to modify or truncate the audit log, preventing even malicious database administrators from tampering with history.",
        "substeps": [
            ("025.1", "Create SQL migration `010_audit_log_tamper_protection.sql` installing `BEFORE UPDATE` trigger raising exception."),
            ("025.2", "Install `BEFORE DELETE` trigger raising exception on any deletion attempt."),
            ("025.3", "Revoke TRUNCATE privileges on `audit_logs` table from all application and migration roles."),
            ("025.4", "Write database integration test attempting UPDATE and DELETE; verify PostgreSQL raises fatal constraint error.")
        ],
        "files": ["// path: db/migrations/010_audit_log_tamper_protection.sql", "// path: tests/db/audit-tamper.test.ts"],
        "verification": "Execute `DELETE FROM audit_logs`; verify operation fails with error `Audit logs are strictly append-only`."
    },
    {
        "number": "026",
        "title": "Ed25519 Cryptographic Audit Log Signing Engine",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Implement an Ed25519 asymmetric signing utility signing each audit log entry hash with platform private key.",
        "description": "Enhance audit log non-repudiation by signing each audit entry's SHA-256 hash using an Ed25519 private key stored in environment variables. Store the base64-encoded signature on the row to guarantee provenance and integrity.",
        "substeps": [
            ("026.1", "Implement `signAuditEntry(entryHash)` using Node.js `crypto.sign` with Ed25519 algorithm in `lib/security/audit-signer.ts`."),
            ("026.2", "Implement `verifyAuditSignature(entryHash, signature, publicKey)` verification utility."),
            ("026.3", "Create automated audit entry factory computing `current_hash = SHA256(prev_hash + sequence + payload)` and generating signature."),
            ("026.4", "Write unit test verifying signature generation and rejection of tampered payload.")
        ],
        "files": ["// path: lib/security/audit-signer.ts", "// path: lib/audit/signer.ts", "// path: tests/audit/signer.test.ts"],
        "verification": "Sign test audit payload; modify payload by 1 character and verify `verifyAuditSignature` returns false."
    },
    {
        "number": "027",
        "title": "Merkle Tree Audit Batch Aggregation Engine",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Build Merkle tree aggregation engine grouping daily audit logs into cryptographic Merkle roots for external anchoring.",
        "description": "Construct binary Merkle tree engine taking daily batch of audit log hashes as leaves, recursively hashing pairs using SHA-256, and calculating a single 32-byte Merkle root. Enable cryptographic proof-of-inclusion generation for any single log entry.",
        "substeps": [
            ("027.1", "Create `lib/security/merkle.ts` implementing `calculateMerkleRoot(leaves)` and `generateProof(leaves, index)`."),
            ("027.2", "Implement `verifyMerkleProof(root, leaf, proof)` verification algorithm."),
            ("027.3", "Create `audit_merkle_roots` table storing `batch_date`, `merkle_root`, `entry_count`, `first_sequence_id`, `last_sequence_id`."),
            ("027.4", "Write unit tests validating Merkle proof generation and verification across varying leaf counts (odd, even, single).")
        ],
        "files": ["// path: lib/security/merkle.ts", "// path: db/migrations/011_audit_merkle_roots.sql", "// path: tests/security/merkle.test.ts"],
        "verification": "Generate Merkle tree for 1,000 sample audit logs; verify valid proof accepts and altered leaf rejects."
    },
    {
        "number": "028",
        "title": "Audit Log Merkle Root Export & Cryptographic Verification API",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Build secure API and verification endpoint allowing compliance auditors to export and verify Merkle roots and audit proofs.",
        "description": "Expose authenticated office endpoints and public verification endpoint (`GET /api/compliance/audit/verify`) allowing independent verification of audit chain continuity, Ed25519 signatures, and Merkle root anchoring without disclosing underlying tenant PII.",
        "substeps": [
            ("028.1", "Create `app/api/compliance/audit/export/route.ts` exporting Merkle roots and signed batch manifests."),
            ("028.2", "Create `app/api/compliance/audit/verify/route.ts` validating individual audit entry proof against published Merkle root."),
            ("028.3", "Implement CLI verification tool `scripts/verify-audit-chain.ts` scanning entire database table for hash chain breaks."),
            ("028.4", "Add audit log export permissions guard restricting detailed exports to compliance_kyc and super_admin roles.")
        ],
        "files": ["// path: app/api/compliance/audit/export/route.ts", "// path: app/api/compliance/audit/verify/route.ts", "// path: scripts/verify-audit-chain.ts"],
        "verification": "Run `scripts/verify-audit-chain.ts` against seeded database; verify 100% hash chain continuity."
    },
    {
        "number": "029",
        "title": "Database Migration Runner & Forward/Rollback Testing Harness",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Build automated database migration runner verifying both forward migration and backward rollback on staging before deployment.",
        "description": "Per KD Solution IT release rules, every schema change requires a clean forward migration and an idempotent rollback script tested in sequence. Implement runner script executing up/down cycles and verifying database state cleanliness.",
        "substeps": [
            ("029.1", "Create migration runner `scripts/migrate.ts` supporting `--up`, `--down`, and `--test-cycle` flags."),
            ("029.2", "Maintain `_schema_migrations` tracking table recording migration name, checksum, applied_at, and execution_time_ms."),
            ("029.3", "Pair every `.up.sql` migration with a matching `.down.sql` rollback migration."),
            ("029.4", "Configure CI test running full forward migration from scratch followed by full rollback to ensure zero orphaned objects.")
        ],
        "files": ["// path: scripts/migrate.ts", "// path: db/migrations/README.md", "// path: tests/db/migration-cycle.test.ts"],
        "verification": "Execute `npm run migrate:test-cycle`; verify all migrations run up and down cleanly with exit code 0."
    },
    {
        "number": "030",
        "title": "Database Seed Engine & Super Admin Initial Provisioning Script",
        "phase": "Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines",
        "objective": "Create idempotent seed runner generating system parameters, country controls, default policies, and initial super_admin credentials.",
        "description": "Develop seed script initializing essential platform parameters. Provision the first super_admin account with mandatory 2FA setup flag, default system company tenant, global country availability flags, and baseline risk tier configurations.",
        "substeps": [
            ("030.1", "Create `db/seeds/index.ts` orchestrating seed execution in proper foreign key order."),
            ("030.2", "Implement `seedCountries()` loading ISO 3166-1 country catalog with sanctioned countries disabled by default."),
            ("030.3", "Implement `seedSuperAdmin()` creating system super_admin from environment variables with temporary password requiring reset."),
            ("030.4", "Add seed audit logging recording initial provisioning in `audit_logs`.")
        ],
        "files": ["// path: db/seeds/index.ts", "// path: db/seeds/countries.ts", "// path: db/seeds/super-admin.ts"],
        "verification": "Run `npm run db:seed`; verify super_admin user created, countries catalog populated, and audit log records created."
    }
]

print(f"Group 1 loaded: {len(GROUP_1)} steps.")
