# // path: plan_generator/group9.py
# Phase 15 (Steps 211 - 220), Phase 16 (Steps 221 - 228), and Phase 17 (Steps 229 - 236)

GROUP_9 = [
    # Phase 15: Public API, Developer Sandbox & E-commerce Plugins (211 - 220)
    {
        "number": "211",
        "title": "Merchant Public API Architecture & Masked Key Management",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build public API infrastructure allowing merchants to generate publishable and secret keys with masked display.",
        "description": "Construct merchant API credentials module in `lib/api/keys.ts`. Merchants generate publishable keys (`pk_live_...`) and secret keys (`sk_live_...`). Hash secret keys with Argon2id; store only masked string (`••••••••••••abcd`). Never show secret key again after initial generation.",
        "substeps": [
            ("211.1", "Create `api_keys` table storing `company_id`, `key_prefix`, `secret_hash`, `last4`, `is_test`, `is_active`."),
            ("211.2", "Verify sub-merchant plan contains `public_api` entitlement before allowing key creation."),
            ("211.3", "Provide one-time copy modal displaying full secret key strictly upon creation."),
            ("211.4", "Provide key revocation and regeneration controls with immediate database invalidation.")
        ],
        "files": ["// path: db/migrations/071_create_api_keys.sql", "// path: lib/api/keys.ts", "// path: app/(merchant)/developers/api-keys/page.tsx"],
        "verification": "Generate API key; verify full secret displays once, refreshes to masked string, and secret hash persists in database."
    },
    {
        "number": "212",
        "title": "Bearer Token Authentication, HMAC Signatures & Rate Limiting",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build public API authentication middleware verifying Bearer tokens, enforcing rate limits, and audit logging calls.",
        "description": "Implement public API middleware in `lib/api/auth.ts`. Validate `Authorization: Bearer sk_...` headers against `api_keys` table. Enforce tier-based rate limiting (100 requests/minute for standard merchants). Audit log every API call with latency and response status.",
        "substeps": [
            ("212.1", "Implement `authenticateApiRequest(req)` extracting and verifying API bearer token."),
            ("212.2", "Apply Redis/memory token bucket rate limiter returning HTTP 429 Too Many Requests when cap exceeded."),
            ("212.3", "Inject authenticated company tenant context into database session for strict RLS isolation."),
            ("212.4", "Add unit tests verifying invalid or revoked API keys return HTTP 401 Unauthorized.")
        ],
        "files": ["// path: lib/api/auth.ts", "// path: lib/api/rate-limit.ts", "// path: tests/api/auth.test.ts"],
        "verification": "Call API with valid bearer token; verify response succeeds; test with invalid token and verify 401 Unauthorized."
    },
    {
        "number": "213",
        "title": "Store Payment Intent & Checkout Session API",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build public e-commerce checkout session API (`POST /v1/checkout/sessions`) for online store payments.",
        "description": "Construct store checkout API in `app/api/v1/checkout/sessions/route.ts`. Accept store order details (amount, currency USD, order_id, line_items, return_url, cancel_url). Return session ID and hosted checkout redirect URL for online store payment completion.",
        "substeps": [
            ("213.1", "Define checkout session request schema in `lib/validation/checkout-session.ts`."),
            ("213.2", "Create `POST /api/v1/checkout/sessions` route generating hosted checkout session."),
            ("213.3", "Return JSON: `{ session_id: 'cs_...', checkout_url: 'https://.../pay/cs_...' }`."),
            ("213.4", "Handle success and cancel redirects back to merchant storefront with cryptographic signature.")
        ],
        "files": ["// path: app/api/v1/checkout/sessions/route.ts", "// path: lib/validation/checkout-session.ts", "// path: tests/api/checkout-session.test.ts"],
        "verification": "Post order payload to `/v1/checkout/sessions`; verify JSON returns valid checkout session URL."
    },
    {
        "number": "214",
        "title": "Developer Sandbox & Complete Test Mode Isolation Environment",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build Developer Sandbox and Test Mode environment completely isolating test data from live production data.",
        "description": "Per KD Solution IT architectural rules: every merchant has Test/Sandbox mode with separate credentials (`sk_test_...`, `pk_test_...`). Test payments move zero real money. Invoices, payment links, and store integrations can be fully exercised in test mode. Test data never mixes with live data.",
        "substeps": [
            ("214.1", "Add `is_test BOOLEAN DEFAULT false` column to all transaction, invoice, and customer tables."),
            ("214.2", "Partition database queries and API routing based on active `is_test` context."),
            ("214.3", "Build test mode toggle switch on merchant dashboard header with clear visual amber banner."),
            ("214.4", "Write tests verifying test mode payments do not debit live bank accounts or credit real balances.")
        ],
        "files": ["// path: lib/sandbox/context.ts", "// path: components/sandbox/TestModeBanner.tsx", "// path: tests/sandbox/isolation.test.ts"],
        "verification": "Toggle to Test Mode; create test invoice and charge; verify transaction is flagged `is_test=true` and live balance is untouched."
    },
    {
        "number": "215",
        "title": "Simulated Webhooks Dispatcher for Merchant Integration Testing",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build developer webhook simulator allowing merchants to trigger simulated payment and dispute webhooks.",
        "description": "Construct webhook simulator in `app/(merchant)/developers/webhooks/page.tsx`. Allow developers to dispatch mock webhook events (`payment.succeeded`, `payment.failed`, `dispute.opened`, `refund.processed`) to their configured test endpoint with valid HMAC signature.",
        "substeps": [
            ("215.1", "Create `merchant_webhook_endpoints` table storing `url`, `secret`, `is_test`, `is_active`."),
            ("215.2", "Implement webhook simulation dispatcher generating signed HMAC-SHA256 headers (`KD-Signature`)."),
            ("215.3", "Build simulation UI with event selector, payload editor, and immediate response status inspector."),
            ("215.4", "Add unit tests verifying developer test endpoints receive well-formed signed payloads.")
        ],
        "files": ["// path: app/(merchant)/developers/webhooks/page.tsx", "// path: lib/sandbox/simulate-webhook.ts", "// path: tests/sandbox/webhook-sim.test.ts"],
        "verification": "Trigger simulated `payment.succeeded` event; verify destination endpoint receives webhook with valid signature."
    },
    {
        "number": "216",
        "title": "Official Shopify App Architecture & OAuth Handshake Client",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build official Shopify Partner App architecture with automated OAuth handshake and merchant credential linkage.",
        "description": "Implement Shopify App integration under `app/shopify/`. Handle Shopify OAuth install flow: merchant installs app from Shopify App Store, logs in with platform credentials, and links store automatically. Store Shopify access tokens securely.",
        "substeps": [
            ("216.1", "Create `shopify_installations` table tracking `shop_domain`, `access_token`, `company_id`, `installed_at`."),
            ("216.2", "Implement OAuth handshake routes `app/shopify/auth/route.ts` and `app/shopify/callback/route.ts`."),
            ("216.3", "Verify Shopify HMAC parameters on all incoming install and redirect requests."),
            ("216.4", "Write tests verifying OAuth callback links store domain to authenticated sub-merchant company ID.")
        ],
        "files": ["// path: app/shopify/auth/route.ts", "// path: app/shopify/callback/route.ts", "// path: lib/shopify/oauth.ts"],
        "verification": "Simulate Shopify install request; verify HMAC validates, OAuth completes, and store records link."
    },
    {
        "number": "217",
        "title": "Shopify Hosted Payment Extension & Callback Handler",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build Shopify Payments App extension handling hosted payment redirects and order completion callbacks.",
        "description": "Construct Shopify Payments App extension in `lib/shopify/payments.ts`. When customer checks out on Shopify: redirect to KD Solution IT hosted checkout, process payment, and notify Shopify via Payments App API (`paymentSessionResolve` or `paymentSessionReject`).",
        "substeps": [
            ("217.1", "Implement Shopify payment session handler in `app/api/shopify/payment/route.ts`."),
            ("217.2", "Render hosted payment page matching Shopify order details and currency."),
            ("217.3", "Call Shopify GraphQL API `paymentSessionResolve` upon payment success to complete Shopify order."),
            ("217.4", "Handle refund and dispute callbacks syncing status between platform and Shopify admin.")
        ],
        "files": ["// path: app/api/shopify/payment/route.ts", "// path: lib/shopify/payments.ts", "// path: tests/shopify/payments.test.ts"],
        "verification": "Execute test Shopify checkout redirect; verify payment completes and Shopify GraphQL confirms order resolution."
    },
    {
        "number": "218",
        "title": "Official WooCommerce Plugin Architecture & Settings Page",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Develop official WooCommerce WordPress PHP plugin package with administrative settings screen.",
        "description": "Build production-ready WooCommerce plugin in `plugins/woocommerce-kd-pay/`. Provide WordPress settings screen: API Publishable Key, Secret Key, Test Mode toggle, and Webhook Secret. Automatically register KD Pay as active WooCommerce payment gateway.",
        "substeps": [
            ("218.1", "Create WordPress plugin entry file `plugins/woocommerce-kd-pay/woocommerce-kd-pay.php`."),
            ("218.2", "Implement `WC_Gateway_KD_Pay` class extending `WC_Payment_Gateway`."),
            ("218.3", "Build admin settings form for API credentials and test mode configuration."),
            ("218.4", "Package plugin into downloadable zip archive for merchant download (`kd-solution-pay-woo.zip`).")
        ],
        "files": ["// path: plugins/woocommerce-kd-pay/woocommerce-kd-pay.php", "// path: plugins/woocommerce-kd-pay/class-wc-gateway-kd-pay.php", "// path: plugins/woocommerce-kd-pay/README.md"],
        "verification": "Verify PHP syntax and WooCommerce gateway class registration in plugin codebase."
    },
    {
        "number": "219",
        "title": "WooCommerce Checkout Gateway & Webhook Verification Handler",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Implement WooCommerce checkout redirect, order note logging, and signature-verified webhook listener.",
        "description": "Implement checkout processing in WooCommerce plugin. On checkout: call platform `/v1/checkout/sessions`, redirect customer to hosted checkout, listen for platform webhook on payment success, verify HMAC signature, update WooCommerce order to `Processing`, and add transaction note.",
        "substeps": [
            ("219.1", "Implement `process_payment(order_id)` calling platform API and returning redirect URL."),
            ("219.2", "Implement WooCommerce webhook endpoint `wc-api=kd_pay_webhook` verifying signature."),
            ("219.3", "Update WooCommerce order status and record platform charge ID in order notes."),
            ("219.4", "Handle failed payments and cancellations, restoring WooCommerce cart and inventory.")
        ],
        "files": ["// path: plugins/woocommerce-kd-pay/includes/class-kd-pay-checkout.php", "// path: plugins/woocommerce-kd-pay/includes/class-kd-pay-webhook.php"],
        "verification": "Simulate WooCommerce checkout session; verify order notes update on simulated webhook callback."
    },
    {
        "number": "220",
        "title": "Interactive OpenAPI / Swagger Documentation & Developer Portal",
        "phase": "Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Shopify/WooCommerce)",
        "objective": "Build interactive OpenAPI 3.1 / Swagger documentation and developer portal under `app/(public)/docs/api/`.",
        "description": "Construct developer documentation in `app/(public)/docs/api/`. Provide interactive OpenAPI 3.1 specification, code samples (cURL, Node.js, Python, PHP), request/response schemas, error code dictionaries, and webhook verification guides.",
        "substeps": [
            ("220.1", "Define comprehensive OpenAPI 3.1 specification in `docs/api/openapi.json`."),
            ("220.2", "Embed interactive Swagger UI / Scalar component in `app/(public)/docs/api/page.tsx`."),
            ("220.3", "Provide copyable code snippets for store session creation and webhook signature validation."),
            ("220.4", "Document error code dictionary and rate limiting specifications.")
        ],
        "files": ["// path: docs/api/openapi.json", "// path: app/(public)/docs/api/page.tsx", "// path: components/docs/CodeSnippet.tsx"],
        "verification": "Navigate to `/docs/api`; verify interactive API documentation renders with runnable code examples."
    },

    # Phase 16: Email System, Notifications & Template Engine (221 - 228)
    {
        "number": "221",
        "title": "Dual-Driver Email Sending Engine (SMTP & Provider API)",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Build flexible email sending engine supporting SMTP and provider API drivers with single active configuration.",
        "description": "Implement email sending engine in `lib/email/index.ts`. Support dual drivers: standard SMTP (nodemailer) and provider REST API (Resend, SendGrid, Postmark). One sending method is active at a time. Store credentials encrypted at rest.",
        "substeps": [
            ("221.1", "Define `EmailDriver` interface with `sendEmail(options)` method in `lib/email/types.ts`."),
            ("221.2", "Implement `SmtpEmailDriver` using `nodemailer` with TLS verification."),
            ("221.3", "Implement `ApiEmailDriver` connecting to email provider REST API."),
            ("221.4", "Create provider factory in `lib/email/factory.ts` resolving active driver from database settings.")
        ],
        "files": ["// path: lib/email/types.ts", "// path: lib/email/smtp.ts", "// path: lib/email/api.ts", "// path: lib/email/factory.ts"],
        "verification": "Send test email via mock driver; verify message delivery payload conforms to standard email interface."
    },
    {
        "number": "222",
        "title": "Super Admin Email Settings with Mandatory Test Email Gate",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Build Super Admin email configuration console requiring successful test email receipt before activation.",
        "description": "Construct email settings in `app/(office)/super-admin/email/`. Super Admin enters SMTP/API credentials. Per platform rule: activating new email configuration requires successful live test email send and verification first. Encrypt email secrets and show masked.",
        "substeps": [
            ("222.1", "Create `email_settings` table storing `driver_type`, `encrypted_credentials`, `is_active`, `is_verified`."),
            ("222.2", "Build email configuration UI with 'Send Test Email' button."),
            ("222.3", "Enforce business rule: prevent saving configuration as active until test email returns HTTP 200 delivery success."),
            ("222.4", "Audit log email configuration updates and test sends in `audit_logs`.")
        ],
        "files": ["// path: app/(office)/super-admin/email/page.tsx", "// path: db/migrations/072_email_settings.sql", "// path: lib/email/admin.ts"],
        "verification": "Enter new SMTP configuration; verify system blocks activation toggle until live test email verifies successfully."
    },
    {
        "number": "223",
        "title": "Super Admin Editable Email Template Engine with Placeholders",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Build editable email template engine allowing Super Admin to customize subject, HTML, and text templates.",
        "description": "Construct template engine in `lib/email/templates.ts`. Store email templates in `email_templates` table. Allow Super Admin to edit subject and body with dynamic placeholders (e.g. `{{merchant_name}}`, `{{amount}}`, `{{invoice_url}}`). Provide live preview tool.",
        "substeps": [
            ("223.1", "Create `email_templates` table storing `slug`, `subject`, `html_body`, `text_body`, `variables JSONB`."),
            ("223.2", "Build template editor in `app/(office)/super-admin/email/templates/` with live syntax highlighting and preview."),
            ("223.3", "Implement template compiler in `lib/email/compile.ts` substituting variables safely."),
            ("223.4", "Seed all system notification templates in `db/seeds/email-templates.ts`.")
        ],
        "files": ["// path: db/migrations/073_email_templates.sql", "// path: lib/email/templates.ts", "// path: app/(office)/super-admin/email/templates/page.tsx"],
        "verification": "Edit welcome email template in admin UI; verify test render correctly substitutes dynamic variables."
    },
    {
        "number": "224",
        "title": "Transactional Email Queue Worker & Exponential Backoff Retries",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Build asynchronous email delivery queue with background worker and exponential backoff retry logic.",
        "description": "Implement email queue in `lib/email/queue.ts`. Offload email sending to background worker to prevent slowing down request handlers. Record delivery status, provider message ID, and retry failed sends up to 3 times with exponential backoff.",
        "substeps": [
            ("224.1", "Create `email_queue` table tracking `template_slug`, `recipient`, `payload`, `status`, `retry_count`, `next_retry_at`."),
            ("224.2", "Implement background worker processing queued emails and calling active email driver."),
            ("224.3", "Implement exponential backoff retry: retry after 1 min, 5 mins, and 30 mins upon delivery failure."),
            ("224.4", "Log final delivery failures and alert office team if queue failure rate spikes.")
        ],
        "files": ["// path: db/migrations/074_email_queue.sql", "// path: lib/email/queue.ts", "// path: tests/email/queue.test.ts"],
        "verification": "Enqueue test email; verify worker processes queue, dispatches email, and records provider message ID."
    },
    {
        "number": "225",
        "title": "Mandatory Security & Identity Notification Templates Implementation",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Implement automated transactional notification templates for authentication, security locks, and KYC decisions.",
        "description": "Construct security notification templates: Welcome & Email Verification, Password Reset, Login Lockout Alert (2 failed attempts), New Device Detected Alert, KYC Submission Confirmation, KYC Approved, KYC Rejected, and Office Account Unlock Notice.",
        "substeps": [
            ("225.1", "Implement templates: `auth.welcome`, `auth.verify-email`, `auth.password-reset`, `auth.lockout-alert`."),
            ("225.2", "Implement templates: `auth.new-device`, `kyc.submitted`, `kyc.approved`, `kyc.rejected`, `auth.unlocked`."),
            ("225.3", "Design clean, mobile-responsive HTML email layouts with platform logo and security advice footer."),
            ("225.4", "Write tests verifying all security events trigger corresponding email enqueue actions.")
        ],
        "files": ["// path: lib/email/templates/security.ts", "// path: tests/email/security-templates.test.ts"],
        "verification": "Trigger account lockout; verify `auth.lockout-alert` email enqueues with accurate IP and lockout duration."
    },
    {
        "number": "226",
        "title": "Billing, Invoicing & Payment Notification Templates Implementation",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Implement automated transactional notification templates for invoices, payments, refunds, disputes, and payouts.",
        "description": "Construct financial notification templates: Invoice Sent to Client, Payment Received Confirmation, Payment Failed Notice, Refund Issued, Dispute Opened Warning (24h SLA), Dispute Midpoint Alert, Payout Dispatched, and Settlement Funds Released.",
        "substeps": [
            ("226.1", "Implement templates: `invoice.sent`, `payment.received`, `payment.failed`, `refund.issued`."),
            ("226.2", "Implement templates: `dispute.opened`, `dispute.reminder`, `payout.sent`, `settlement.released`."),
            ("226.3", "Include itemized payment summaries, transaction IDs, and direct dashboard action links in templates."),
            ("226.4", "Add unit tests verifying financial notifications render correct monetary amounts in USD.")
        ],
        "files": ["// path: lib/email/templates/financial.ts", "// path: tests/email/financial-templates.test.ts"],
        "verification": "Simulate payment received; verify `payment.received` email renders correct USD amount and receipt link."
    },
    {
        "number": "227",
        "title": "Subscription Due Warning, Suspension & Restoration Email Engine",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Implement subscription lifecycle email notifications: 7-day warning, service stop notice, and service restore notice.",
        "description": "Construct subscription billing notifications: (1) 7-day advance renewal warning with due date and amount; (2) Due-date billing failure and service suspension notice with pay link; (3) Payment received and service restoration confirmation notice.",
        "substeps": [
            ("227.1", "Implement templates: `billing.7day-warning`, `billing.service-suspended`, `billing.service-restored`."),
            ("227.2", "Hook notifications into subscription billing background scheduler."),
            ("227.3", "Provide direct, zero-friction payment link in suspension email directing merchant to billing pay page."),
            ("227.4", "Write tests verifying 7-day warning dispatches exactly 7 days prior to renewal.")
        ],
        "files": ["// path: lib/email/templates/subscription.ts", "// path: tests/email/subscription-templates.test.ts"],
        "verification": "Trigger subscription warning worker; verify 7-day warning email enqueues for due merchants."
    },
    {
        "number": "228",
        "title": "Domain Authentication (SPF, DKIM, DMARC) & Marketing Subdomain Setup",
        "phase": "Phase 16: Email System, Notifications & Template Engine",
        "objective": "Document and validate email domain authentication (SPF, DKIM, DMARC) with separate marketing sending subdomain.",
        "description": "Establish domain reputation architecture in `docs/email/DOMAIN_AUTHENTICATION.md`. Require SPF, DKIM (2048-bit), and strict DMARC (`p=reject`) on transactional sending domain. Configure separate subdomain (e.g. `mail.kdsolution.it`) for marketing/newsletters as volume grows.",
        "substeps": [
            ("228.1", "Create `docs/email/DOMAIN_AUTHENTICATION.md` with exact DNS record templates for SPF, DKIM, and DMARC."),
            ("228.2", "Implement automated DNS record validator checking SPF and DMARC publication before launch."),
            ("228.3", "Enforce separation: transactional emails send from root domain, marketing/blog emails from dedicated subdomain."),
            ("228.4", "Add pre-launch checklist gate verifying domain authentication passes external validation.")
        ],
        "files": ["// path: docs/email/DOMAIN_AUTHENTICATION.md", "// path: scripts/verify-email-dns.ts"],
        "verification": "Run DNS verification script; verify SPF, DKIM, and DMARC validation checklist passes cleanly."
    },

    # Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog (229 - 236)
    {
        "number": "229",
        "title": "Support Ticketing Subsystem with Secure File Attachments",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Build support ticketing system allowing merchants to open tickets, attach files, and receive email replies.",
        "description": "Construct support ticketing module in `lib/support/tickets.ts`. Merchants submit tickets with category, priority, and encrypted file attachments. Support agents assign tickets, update status (`open`, `in_progress`, `waiting_client`, `resolved`), and communicate via email.",
        "substeps": [
            ("229.1", "Create `support_tickets` and `ticket_messages` tables with UUIDv7 primary keys and company isolation."),
            ("229.2", "Build merchant ticket interface (`app/(merchant)/support/`) with conversation thread view."),
            ("229.3", "Support encrypted file attachments (screenshots, invoices) using storage adapter."),
            ("229.4", "Send email notifications to merchant upon agent reply with direct reply-by-web link.")
        ],
        "files": ["// path: db/migrations/075_support_tickets.sql", "// path: lib/support/tickets.ts", "// path: app/(merchant)/support/page.tsx"],
        "verification": "Open support ticket with file attachment; verify ticket persists, agent can view and reply, and merchant receives notification."
    },
    {
        "number": "230",
        "title": "Support SLA Compliance Engine (1-Day Urgent / 72-Hour Payment)",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Build support SLA compliance monitor enforcing 1-business-day urgent response and 72-hour payment resolution.",
        "description": "Per KD Solution IT support service levels: monetary urgent tickets receive first response within 1 business day; stuck payment inquiries receive final resolution within 72 hours. Track SLA timers, auto-escalate breached tickets, and record SLA compliance percentage.",
        "substeps": [
            ("230.1", "Compute SLA deadlines on ticket creation based on category (monetary urgent = 24h business, stuck payment = 72h)."),
            ("230.2", "Build SLA tracking indicators in Support dashboard (`app/(office)/support/tickets/`)."),
            ("230.3", "Trigger automated supervisor alerts at 75% SLA countdown elapsed."),
            ("230.4", "Generate monthly SLA compliance report measuring on-time response and resolution rates.")
        ],
        "files": ["// path: lib/support/sla.ts", "// path: app/(office)/support/sla-metrics/page.tsx", "// path: tests/support/sla.test.ts"],
        "verification": "Create urgent monetary ticket; verify system sets 1-business-day SLA deadline and tracks countdown."
    },
    {
        "number": "231",
        "title": "Global Dismissible Popup Announcement Engine",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Build platform announcement engine displaying popup notices across dashboards with user dismiss tracking.",
        "description": "Construct announcements system in `lib/announcements/index.ts`. Super Admin publishes announcements with title, content, target roles, and active date range. Popup displays across merchant and office dashboards; once dismissed by a user, it never appears again for that user.",
        "substeps": [
            ("231.1", "Create `announcements` and `announcement_dismissals` tables tracking user dismissals."),
            ("231.2", "Build Super Admin announcement publisher (`app/(office)/super-admin/announcements/`)."),
            ("231.3", "Create client modal component `<AnnouncementPopup announcement={...} />` checking dismissal state."),
            ("231.4", "Add unit tests verifying dismissed announcement is never returned in user active announcements query.")
        ],
        "files": ["// path: db/migrations/076_announcements.sql", "// path: lib/announcements/index.ts", "// path: components/announcements/AnnouncementPopup.tsx"],
        "verification": "Publish announcement; view as merchant; dismiss popup; refresh page and verify popup does not re-appear."
    },
    {
        "number": "232",
        "title": "Public Status Page & Real-Time Incident Reporting Subsystem",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Build public status page displaying real-time system health and publishing incident updates and subscriber alerts.",
        "description": "Construct public status page at `app/(public)/status/page.tsx`. Display component health: Web Application, Payment Processing, Webhook Ingestion, Public API, Database. Allow Super Admin to publish incident announcements and notify email subscribers.",
        "substeps": [
            ("232.1", "Create `status_incidents` and `status_subscribers` tables in database."),
            ("232.2", "Implement automated health ping endpoints checking database, storage, and gateway connectivity."),
            ("232.3", "Build public status page UI (`app/(public)/status/page.tsx`) with historical uptime indicators."),
            ("232.4", "Provide subscriber email alert broadcast when an incident is published or resolved.")
        ],
        "files": ["// path: app/(public)/status/page.tsx", "// path: db/migrations/077_status_page.sql", "// path: lib/status/incidents.ts"],
        "verification": "Navigate to `/status`; verify system component health cards render and incident feed displays cleanly."
    },
    {
        "number": "233",
        "title": "Headless CMS Architecture for All Public Platform Pages",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Build headless CMS architecture allowing Super Admin and Blogger roles to edit public content without code changes.",
        "description": "Construct CMS engine in `lib/cms/index.ts`. All public marketing and informational pages are editable via CMS. Store page content, sections, titles, and SEO metadata in `cms_pages` table. Provide live editor and version history in office console.",
        "substeps": [
            ("233.1", "Create `cms_pages` table storing `slug`, `title`, `sections JSONB`, `seo_meta JSONB`, `author_id`."),
            ("233.2", "Build visual CMS section editor in `app/(office)/blogger/cms/` and Super Admin console."),
            ("233.3", "Implement dynamic page renderer matching public URL slugs to active CMS page records."),
            ("233.4", "Audit log all CMS edits with before/after diffs in `audit_logs`.")
        ],
        "files": ["// path: db/migrations/078_cms_pages.sql", "// path: lib/cms/index.ts", "// path: app/(office)/blogger/cms/page.tsx"],
        "verification": "Edit public page content via CMS; refresh public URL and verify new content renders immediately."
    },
    {
        "number": "234",
        "title": "Public Core Pages (Home, Product, Company, Legal, Contact) with Turnstile",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Implement public marketing website: Home, Product, Company, Support, Contact, and Lead forms with Turnstile.",
        "description": "Deploy core public website routes under `app/(public)/`. Build: Homepage with value proposition, Product features, Company about page, Support directory, and Contact/Lead forms protected by Cloudflare Turnstile anti-bot verification.",
        "substeps": [
            ("234.1", "Create public pages: `app/(public)/page.tsx` (Home), `app/(public)/product/page.tsx`, `app/(public)/company/page.tsx`."),
            ("234.2", "Create contact and lead capture form `app/(public)/contact/page.tsx` with Turnstile widget."),
            ("234.3", "Enforce partner display naming rules: 'Global Payout Partners' and 'Local Payment Methods via Licensed Partners'."),
            ("234.4", "Verify all public pages comply with WCAG AA accessibility and mobile responsiveness.")
        ],
        "files": ["// path: app/(public)/page.tsx", "// path: app/(public)/product/page.tsx", "// path: app/(public)/contact/page.tsx"],
        "verification": "Submit contact form with Turnstile token; verify lead captures in database and automated email triggers."
    },
    {
        "number": "235",
        "title": "Public Transparent Pricing Page with 30-Day Version Notice",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Build public Pricing page showing transparent fee schedule with mandatory 30-day advance notice for price revisions.",
        "description": "Deploy public pricing at `app/(public)/pricing/page.tsx`. Display transparent price list: platform fee %, processor fees, payout fees, chargeback fees, and refund fees. Per platform policy: any new price must be announced 30 days prior. Track pricing versions with effective dates.",
        "substeps": [
            ("235.1", "Create `pricing_versions` table storing fee schedules, approval sign-offs, and effective dates."),
            ("235.2", "Build public pricing table displaying transparent breakdown of who pays which fee."),
            ("235.3", "Display advance notice banner if a pending pricing version is scheduled to take effect in next 30 days."),
            ("235.4", "Enforce dual approval: pricing revisions require joint sign-off from Super Admin and CEO.")
        ],
        "files": ["// path: app/(public)/pricing/page.tsx", "// path: db/migrations/079_pricing_versions.sql", "// path: lib/cms/pricing.ts"],
        "verification": "Visit `/pricing`; verify complete fee schedule renders transparently and effective date version is visible."
    },
    {
        "number": "236",
        "title": "SEO Metadata, Dynamic Sitemap & Schema.org Generator",
        "phase": "Phase 17: Support Ticketing, Announcements, Status Page & Public CMS/Blog",
        "objective": "Build automated SEO metadata engine, dynamic sitemap (`sitemap.xml`), and Schema.org structured JSON-LD data.",
        "description": "Implement SEO infrastructure in `app/sitemap.ts` and `app/robots.ts`. Dynamically generate sitemap including all public CMS pages, legal policies, and blog articles. Inject OpenGraph tags, Twitter cards, and Schema.org FinancialService JSON-LD structured data.",
        "substeps": [
            ("236.1", "Implement `app/sitemap.ts` dynamically fetching public pages and blog posts."),
            ("236.2", "Implement `app/robots.ts` permitting public indexing while blocking `/api/`, `/(merchant)/`, and `/(office)/`."),
            ("236.3", "Inject Schema.org `FinancialService` and `Organization` JSON-LD data in public layout."),
            ("236.4", "Add unit tests verifying sitemap generates valid XML with proper canonical URLs.")
        ],
        "files": ["// path: app/sitemap.ts", "// path: app/robots.ts", "// path: components/seo/JsonLd.tsx"],
        "verification": "Request `/sitemap.xml`; verify valid XML response indexing all public routes and excluding private dashboards."
    }
]

print(f"Group 9 loaded: {len(GROUP_9)} steps.")
