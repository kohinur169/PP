# // path: plan_generator/group8.py
# Phase 13 (Steps 186 - 200) and Phase 14 (Steps 201 - 210)

GROUP_8 = [
    # Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links (186 - 200)
    {
        "number": "186",
        "title": "Professional Invoice Data Model & Numbering Generator",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Design professional invoice schema with sequential numbering generator and custom prefix support.",
        "description": "Migrate invoice schema in `db/migrations/060_create_invoices.sql`. Follow standard US and international commercial invoice formats. Support customizable invoice prefix (e.g. `INV-2026-`), sequential integer counter per merchant, currency USD only, issue date, due date, terms, and notes.",
        "substeps": [
            ("186.1", "Create `invoices` table with `company_id`, `client_id`, `invoice_number`, `status`, `subtotal`, `tax_total`, `total`."),
            ("186.2", "Implement sequential numbering generator using PostgreSQL sequences or atomic company counters."),
            ("186.3", "Ensure invoice numbers are unique per sub-merchant company tenant."),
            ("186.4", "Add indexes on `company_id`, `client_id`, `status`, and `due_date`.")
        ],
        "files": ["// path: db/migrations/060_create_invoices.sql", "// path: types/invoice.ts", "// path: lib/invoices/numbering.ts"],
        "verification": "Create 3 sequential invoices for merchant; verify invoice numbers increment monotonically (INV-0001, INV-0002, INV-0003)."
    },
    {
        "number": "187",
        "title": "Global Standard Invoice Formatting, Line Items & Multi-Tier Discounts",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build invoice line items manager supporting item descriptions, quantities, unit prices, and line/invoice discounts.",
        "description": "Construct line items schema and UI in `components/invoices/LineItemsEditor.tsx`. Support line item ordering, quantity, rate in USD `numeric(18,4)`, percentage or fixed discounts, tax TIC codes, line item subtotals, and overall invoice discount calculation.",
        "substeps": [
            ("187.1", "Create `invoice_items` table storing `invoice_id`, `description`, `quantity`, `unit_price`, `discount`, `total`."),
            ("187.2", "Calculate line items and invoice totals using `numeric(18,4)` Decimal math."),
            ("187.3", "Build interactive line items table with drag-and-drop row reordering in invoice builder."),
            ("187.4", "Write tests verifying discount and tax calculations conserve penny precision.")
        ],
        "files": ["// path: db/migrations/061_invoice_items.sql", "// path: components/invoices/LineItemsEditor.tsx", "// path: lib/invoices/totals.ts"],
        "verification": "Add 3 line items with 10% discount; verify subtotal, discount, and grand total calculate exactly."
    },
    {
        "number": "188",
        "title": "Invoice Lifecycle State Machine & Editing Lock on Paid Records",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build invoice status state machine and enforce physical immutability locking once an invoice is paid.",
        "description": "Implement invoice state machine in `lib/invoices/state-machine.ts`. Status workflow: `draft` -> `sent` -> `viewed` -> `partially_paid` -> `paid` -> `overdue` -> `void`. Crucial rule: once an invoice is marked paid, lock all fields against any further editing or deletion.",
        "substeps": [
            ("188.1", "Define invoice status transition rules in `lib/invoices/state-machine.ts`."),
            ("188.2", "Install database trigger blocking UPDATE on `invoices` where status is `paid`, except for void/reversal audit flags."),
            ("188.3", "Provide invoice duplicate and void operations with automated audit logging."),
            ("188.4", "Write tests verifying attempt to edit line items of a paid invoice throws `LockedInvoiceError`.")
        ],
        "files": ["// path: lib/invoices/state-machine.ts", "// path: db/migrations/062_invoice_lock_trigger.sql", "// path: tests/invoices/state-machine.test.ts"],
        "verification": "Pay invoice; attempt to change price or line items; verify system blocks modification and returns HTTP 400."
    },
    {
        "number": "189",
        "title": "Partial Payment Acceptance Engine (Minimum USD $20 Threshold)",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build partial payment engine allowing installment payments with mandatory minimum of USD $20 per payment.",
        "description": "Implement partial payment processing in `lib/invoices/partial-payments.ts`. Allow customers to pay invoices in parts. Enforce platform rule: partial payment amount must be at least USD $20.0000. Track remaining balance; transition status to `partially_paid` until final balance reaches zero.",
        "substeps": [
            ("189.1", "Implement `processInvoicePartialPayment(invoiceId, amount)` checking `amount >= 20.0000`."),
            ("189.2", "Reject partial payment attempts under $20 with `MinimumPartialPaymentError`."),
            ("189.3", "Update `amount_paid` and compute `remaining_balance` atomically in transaction."),
            ("189.4", "When `remaining_balance === 0`, transition status to `paid` and lock invoice.")
        ],
        "files": ["// path: lib/invoices/partial-payments.ts", "// path: tests/invoices/partial-payments.test.ts"],
        "verification": "Attempt $15 partial payment; verify rejection; submit $25 payment on $100 invoice; verify remaining balance is $75."
    },
    {
        "number": "190",
        "title": "High-Fidelity Server-Side PDF Invoice Generation Pipeline",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build background worker generating professional PDF invoices and storing encrypted files in object storage.",
        "description": "Implement PDF generator in `lib/pdf/invoice-pdf.ts` using `@react-pdf/renderer` or headless browser. Offload rendering to background worker to maintain light serverless runtime load. Encrypt generated PDF with AES-256-GCM and store in object storage.",
        "substeps": [
            ("190.1", "Design clean PDF template `<InvoicePdfDocument invoice={invoice} company={company} />`."),
            ("190.2", "Implement background job rendering PDF stream without blocking HTTP request thread."),
            ("190.3", "Upload encrypted PDF to object storage and link file ID to invoice record."),
            ("190.4", "Provide secure signed download URL on client token portal and merchant dashboard.")
        ],
        "files": ["// path: lib/pdf/invoice-pdf.ts", "// path: components/pdf/InvoicePdfDocument.tsx", "// path: tests/pdf/invoice-pdf.test.ts"],
        "verification": "Generate PDF for invoice; verify PDF renders with accurate line items, merchant logo, and downloads cleanly."
    },
    {
        "number": "191",
        "title": "Estimates & Quotes Architecture with Automated Expiration Rules",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build Estimates & Quotes workflow supporting client review, expiration timestamps, and void states.",
        "description": "Construct quotes module in `lib/estimates/index.ts`. Statuses: `draft`, `sent`, `viewed`, `accepted`, `declined`, `expired`, `void`. If client declines estimate or expiration timestamp passes, automatically transition estimate status to `void`.",
        "substeps": [
            ("191.1", "Create `estimates` and `estimate_items` tables mirroring invoice data structures."),
            ("191.2", "Implement background worker checking expiring estimates and setting status to `void`."),
            ("191.3", "Provide client decline button on tokenized estimate link setting status to `void` immediately."),
            ("191.4", "Write tests verifying declined or expired estimates cannot be converted or accepted.")
        ],
        "files": ["// path: db/migrations/063_create_estimates.sql", "// path: lib/estimates/index.ts", "// path: app/(merchant)/estimates/page.tsx"],
        "verification": "Decline estimate via client portal; verify status transitions to `void` and cannot be re-opened."
    },
    {
        "number": "192",
        "title": "Digital Signature & Legal E-Sign Audit Evidence Capture Engine",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build legal electronic signature engine capturing signer name, email, consent checkbox, IP, geo, device, and hash.",
        "description": "Implement digital signature engine in `lib/estimates/signature.ts`. When client accepts estimate, capture: signer legal name, email, mandatory consent checkbox record, timestamp, IP address, geo-location, browser fingerprint, and SHA-256 document hash for legal non-repudiation.",
        "substeps": [
            ("192.1", "Create `estimate_signatures` table storing all 8 forensic evidence fields with document hash."),
            ("192.2", "Build signature pad and consent UI component in `components/estimates/SignaturePad.tsx`."),
            ("192.3", "Generate cryptographic signature certificate appended to accepted estimate PDF."),
            ("192.4", "Add unit tests verifying missing consent checkbox or invalid document hash blocks acceptance.")
        ],
        "files": ["// path: db/migrations/064_estimate_signatures.sql", "// path: lib/estimates/signature.ts", "// path: components/estimates/SignaturePad.tsx"],
        "verification": "Sign estimate; verify database stores signer name, IP, device fingerprint, timestamp, and document hash."
    },
    {
        "number": "193",
        "title": "Estimate-to-Invoice Conversion & Payment Link Auto-Generation",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build automated estimate-to-invoice converter generating invoice and payment link immediately upon client e-signature.",
        "description": "Implement conversion workflow in `lib/estimates/convert.ts`. As soon as estimate receives valid digital signature: automatically clone items into a new invoice, assign invoice number, generate tokenized payment link, and redirect client directly to payment checkout.",
        "substeps": [
            ("193.1", "Implement `convertEstimateToInvoice(estimateId)` in database transaction."),
            ("193.2", "Clone line items, client details, and discounts from estimate into new invoice."),
            ("193.3", "Generate tokenized invoice payment link and send email notice to merchant and client."),
            ("193.4", "Redirect client browser directly to payment checkout page (`pay/[id]`).")
        ],
        "files": ["// path: lib/estimates/convert.ts", "// path: tests/estimates/convert.test.ts"],
        "verification": "Sign estimate; verify system converts estimate to invoice, displays payment link, and redirects to checkout."
    },
    {
        "number": "194",
        "title": "Recurring Invoice Schedule Engine & Batch Generator",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build recurring invoice scheduling engine generating recurring invoices on weekly, monthly, or annual schedules.",
        "description": "Construct recurring billing manager in `lib/invoices/recurring.ts`. Merchants configure schedule: client ID, line items, interval (weekly, monthly, quarterly, annual), start date, end date, and auto-send options. Background worker generates invoices on schedule.",
        "substeps": [
            ("194.1", "Create `recurring_invoice_schedules` table tracking `company_id`, `client_id`, `interval`, `next_run_date`, `status`."),
            ("194.2", "Implement batch worker running daily at 00:00 UTC generating scheduled invoices."),
            ("194.3", "Dispatch generated invoice link automatically to client email if auto-send is enabled."),
            ("194.4", "Write tests verifying next run date advances accurately across month boundaries and leap years.")
        ],
        "files": ["// path: db/migrations/065_recurring_schedules.sql", "// path: lib/invoices/recurring.ts", "// path: app/(merchant)/recurring/page.tsx"],
        "verification": "Create monthly recurring schedule; trigger worker; verify invoice is generated and `next_run_date` advances 1 month."
    },
    {
        "number": "195",
        "title": "Non-Retry Failed Recurring Payment Policy & Client Reminder Queue",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Enforce non-retry policy on failed recurring payments and schedule automated overdue client reminders.",
        "description": "Per KD Solution IT billing rules: when recurring payment fails, there is NO automatic silent retry. Mark invoice as due or overdue immediately, dispatch reminder emails to client at configured intervals, and notify merchant to take needed action.",
        "substeps": [
            ("195.1", "If recurring payment fails: set invoice status to `overdue`; forbid automated card retry loop."),
            ("195.2", "Enqueue structured client reminder emails at +1 day, +3 days, and +7 days after due date."),
            ("195.3", "Alert sub-merchant dashboard displaying failed recurring invoice in action required list."),
            ("195.4", "Add unit tests verifying zero automated card re-charge attempts occur after initial failure.")
        ],
        "files": ["// path: lib/invoices/reminders.ts", "// path: tests/invoices/no-retry.test.ts"],
        "verification": "Simulate failed recurring charge; verify invoice marks overdue, zero retry occurs, and reminder email enqueues."
    },
    {
        "number": "196",
        "title": "Tokenized Client Link Access Engine (i/[token] & e/[token])",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build tokenized link engine generating cryptographically secure URLs under `i/[token]` and `e/[token]`.",
        "description": "Implement token generator in `lib/client-portal/tokens.ts`. Generate 256-bit cryptographically random tokens for invoices (`/i/[token]`) and estimates (`/e/[token]`). Clients access full interactive views and checkout without login. Defend against enumeration.",
        "substeps": [
            ("196.1", "Create `document_tokens` table mapping high-entropy tokens to `invoice_id` or `estimate_id` with expiration."),
            ("196.2", "Implement token resolver route fetching document and verifying active status."),
            ("196.3", "Enforce strict rate limiting on tokenized routes to prevent brute-force token guessing."),
            ("196.4", "Write tests verifying invalid or expired tokens return clean 404 without leaking document IDs.")
        ],
        "files": ["// path: lib/client-portal/tokens.ts", "// path: db/migrations/066_document_tokens.sql", "// path: tests/client-portal/tokens.test.ts"],
        "verification": "Access invoice via `/i/[token]`; verify invoice loads without login prompt and invalid token returns 404."
    },
    {
        "number": "197",
        "title": "Paid Invoice Link Locking & Receipt Mode Enforcement",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Enforce rule: once an invoice is fully paid, its tokenized link permanently locks against payment and displays receipt.",
        "description": "Per KD Solution IT platform rules: once an invoice is fully paid through its tokenized link, that link no longer accepts payment. Opening it displays the paid state, payment timestamp, and downloadable receipt. A partly paid invoice accepts only the remaining amount.",
        "substeps": [
            ("197.1", "In tokenized invoice route `app/(client)/i/[token]/page.tsx`, check payment status on load."),
            ("197.2", "If `status === 'paid'`, hide payment form and render read-only paid receipt with PDF download."),
            ("197.3", "If `status === 'partially_paid'`, clamp maximum checkout amount to exact remaining balance."),
            ("197.4", "Add unit tests verifying payment submission on fully paid invoice token is rejected with HTTP 400.")
        ],
        "files": ["// path: app/(client)/i/[token]/page.tsx", "// path: tests/client-portal/paid-locking.test.ts"],
        "verification": "Open tokenized link of paid invoice; verify payment button is disabled and paid receipt is displayed."
    },
    {
        "number": "198",
        "title": "General Reusable Payment Links & Plan-Gated Hosted Checkout",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build reusable payment links engine allowing merchants to generate shareable payment links when included in plan.",
        "description": "Construct payment links module in `lib/payment-links/index.ts`. Allow merchants to create fixed or custom amount payment links with custom descriptions. Enforce plan entitlement: service is usable only when included in merchant active plan.",
        "substeps": [
            ("198.1", "Create `payment_links` table storing `company_id`, `slug`, `title`, `amount`, `is_active`, `redirect_url`."),
            ("198.2", "Verify merchant plan contains `payment_links` entitlement before allowing link creation."),
            ("198.3", "Build public payment link checkout route `app/(checkout)/link/[slug]/page.tsx`."),
            ("198.4", "Add unit tests verifying deactivated payment links reject checkout attempts.")
        ],
        "files": ["// path: db/migrations/067_payment_links.sql", "// path: lib/payment-links/index.ts", "// path: app/(checkout)/link/[slug]/page.tsx"],
        "verification": "Generate reusable payment link; open link in incognito browser; verify checkout page loads and processes payment."
    },
    {
        "number": "199",
        "title": "Sub-Merchant Invoice Branding & Custom Logo Engine",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build invoice branding engine allowing merchants to upload business logo, set colors, and configure footer notes.",
        "description": "Implement branding engine in `lib/branding/index.ts`. Allow merchants to upload logo (PNG/JPEG <= 2MB), set primary brand color, and configure custom invoice footer notes. Reflect branding across invoice web views, PDFs, and checkout if entitled in plan.",
        "substeps": [
            ("199.1", "Create `merchant_branding` table storing `company_id`, `logo_file_id`, `primary_color`, `footer_note`."),
            ("199.2", "Build branding settings screen (`app/(merchant)/settings/branding/page.tsx`) with live invoice preview."),
            ("199.3", "Inject merchant branding into web invoice templates and PDF generator."),
            ("199.4", "Fall back to default KD Solution IT platform branding if merchant plan excludes custom branding.")
        ],
        "files": ["// path: db/migrations/068_merchant_branding.sql", "// path: lib/branding/index.ts", "// path: app/(merchant)/settings/branding/page.tsx"],
        "verification": "Upload merchant logo and primary color; verify invoice view displays merchant logo and custom color scheme."
    },
    {
        "number": "200",
        "title": "Bulk Client & Product Catalog CSV Import Tool with Row Error Reporting",
        "phase": "Phase 13: Invoicing, Estimates, Recurring Billing & Payment Links",
        "objective": "Build high-performance CSV import tool importing clients and products with detailed row-by-row error reporting.",
        "description": "Construct CSV data importer in `lib/import/csv.ts`. Allow bulk import of clients and product/service catalogs. Process row by row: import all valid rows successfully into database while reporting invalid rows with exact row numbers and error reasons.",
        "substeps": [
            ("200.1", "Implement CSV parsing engine using `papaparse` with streaming support for large files."),
            ("200.2", "Validate each row against client/product Zod schemas, collecting errors by row index."),
            ("200.3", "Execute batch insert for valid rows in transaction; generate downloadable CSV of failed rows with error column."),
            ("200.4", "Build import UI (`app/(merchant)/import/`) with drag-and-drop upload and progress indicator.")
        ],
        "files": ["// path: lib/import/csv.ts", "// path: app/(merchant)/import/page.tsx", "// path: tests/import/csv.test.ts"],
        "verification": "Upload CSV with 8 valid rows and 2 invalid rows; verify 8 rows import and UI highlights errors on rows 4 and 9."
    },

    # Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine (201 - 210)
    {
        "number": "201",
        "title": "Sub-Merchant Refund Management Interface & Reversible Ledger Poster",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build refund management interface supporting full and partial refunds with automatic double-entry ledger reversals.",
        "description": "Construct refund engine in `lib/payment/refund.ts`. Merchants request full or partial refund from dashboard (`app/(merchant)/refunds/`). Validate available balance, submit refund to payment processor, and post reversing ledger journal upon success.",
        "substeps": [
            ("201.1", "Create `refunds` table storing `payment_id`, `company_id`, `amount`, `reason`, `gateway_refund_id`, `status`."),
            ("201.2", "Post refund ledger journal: Debit Merchant Available Balance, Credit Processor Receivable."),
            ("201.3", "Update payment status to `refunded` (full) or `partially_refunded` with residual balance."),
            ("201.4", "Audit log all refund requests, approvals, and gateway execution in `audit_logs`.")
        ],
        "files": ["// path: db/migrations/069_create_refunds.sql", "// path: lib/payment/refund.ts", "// path: app/(merchant)/refunds/page.tsx"],
        "verification": "Execute partial refund of $30 on $100 payment; verify processor executes refund and ledger debits merchant balance."
    },
    {
        "number": "202",
        "title": "Platform Fee Refund Policy Switch (Return vs Retain Setting)",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build Super Admin platform fee refund policy switch configuring whether platform fee is returned or retained on refund.",
        "description": "Per KD Solution IT business rules: whether the platform processing fee is returned to merchant upon refund is configurable by Super Admin globally or per merchant. Ledger posting engine adjusts reversing entries based on active setting.",
        "substeps": [
            ("202.1", "Add `refund_platform_fee_policy` ('return' | 'retain') to platform and company settings."),
            ("202.2", "If policy is 'return': reverse Platform Fee Revenue debiting fee back to merchant balance."),
            ("202.3", "If policy is 'retain': leave Platform Fee Revenue intact and deduct full refund from merchant balance."),
            ("202.4", "Write tests verifying ledger entries accurately reflect active fee refund policy.")
        ],
        "files": ["// path: lib/payment/fee-refund-policy.ts", "// path: tests/payment/fee-refund.test.ts"],
        "verification": "Toggle fee refund policy to 'retain'; execute refund and verify platform fee remains credited to platform revenue."
    },
    {
        "number": "203",
        "title": "Multi-Gateway Dispute Webhook Ingestion & Tracking Subsystem",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build multi-gateway dispute ingestion engine capturing chargeback notifications and opening dispute records.",
        "description": "Implement dispute tracker in `lib/disputes/ingest.ts`. Ingest chargeback webhooks from Stripe, NMI, Rainforest, and Airwallex. Record dispute in `disputes` table with provider dispute ID, charge ID, disputed amount, reason code, and submission deadline.",
        "substeps": [
            ("203.1", "Create `disputes` table storing `company_id`, `payment_id`, `provider_dispute_id`, `amount`, `reason_code`, `deadline`."),
            ("203.2", "Parse card scheme dispute reason codes (Visa, Mastercard, Amex, Discover) into human-readable categories."),
            ("203.3", "Immediately freeze disputed amount from merchant Available Balance or Rolling Reserve."),
            ("203.4", "Audit log dispute notification and dispatch urgent alert email to merchant owner.")
        ],
        "files": ["// path: db/migrations/070_create_disputes.sql", "// path: lib/disputes/ingest.ts", "// path: tests/disputes/ingest.test.ts"],
        "verification": "Ingest test chargeback webhook; verify dispute record created, funds held, and alert email dispatched."
    },
    {
        "number": "204",
        "title": "24/48-Hour Merchant Timezone Dispute SLA & Alert Engine",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Enforce strict dispute response deadline of 24 hours (or 48h if configured) in merchant's own timezone with warning alerts.",
        "description": "Per KD Solution IT dispute policy: merchant response deadline is 24 hours in the merchant's own timezone (Super Admin can configure 48h). Send automated email warnings immediately at hour 0 and at midpoint (hour 12/24). If unanswered, auto-submit available evidence.",
        "substeps": [
            ("204.1", "Calculate deadline timestamp based on sub-merchant profile timezone: `NOW() + INTERVAL '24 hours'` (or 48h)."),
            ("204.2", "Dispatch immediate alert email at hour 0: 'URGENT: Chargeback Received - Action Required Within 24h'."),
            ("204.3", "Dispatch midpoint reminder email at hour 12: 'WARNING: 12 Hours Remaining to Submit Dispute Evidence'."),
            ("204.4", "Display prominent countdown timer banner on merchant dashboard while dispute is pending response.")
        ],
        "files": ["// path: lib/disputes/sla.ts", "// path: components/disputes/DisputeCountdownBanner.tsx", "// path: tests/disputes/sla.test.ts"],
        "verification": "Open dispute for Tokyo merchant; verify deadline calculates in JST timezone and midpoint alert fires at 12 hours."
    },
    {
        "number": "205",
        "title": "Merchant Dispute Response Portal & Document Upload Pipeline",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build merchant dispute response portal allowing rebuttal narrative entry and supporting document uploads.",
        "description": "Construct response portal in `app/(merchant)/disputes/[id]/page.tsx`. Provide rebuttal text editor, structured upload areas for proof of delivery, customer communications, refund policy acknowledgment, and tracking receipts with AES-256-GCM encryption.",
        "substeps": [
            ("205.1", "Build dispute response form in `app/(merchant)/disputes/[id]/page.tsx` with deadline countdown."),
            ("205.2", "Provide categorized file upload dropzones: Proof of Delivery, Communication Logs, Terms Acceptance."),
            ("205.3", "Encrypt all uploaded dispute evidence files with AES-256-GCM prior to cloud storage transfer."),
            ("205.4", "Audit log merchant evidence submission in `audit_logs`.")
        ],
        "files": ["// path: app/(merchant)/disputes/[id]/page.tsx", "// path: lib/disputes/response.ts", "// path: tests/disputes/response.test.ts"],
        "verification": "Submit dispute rebuttal narrative and delivery receipt; verify files encrypt and status updates to `under_review`."
    },
    {
        "number": "206",
        "title": "Structured Chargeback Evidence Pack Auto-Assembler",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build automated evidence pack assembler combining invoice, delivery proof, communications, and terms acceptance into single PDF.",
        "description": "Implement evidence pack compiler in `lib/disputes/evidence-pack.ts`. Automatically compile: (1) Original invoice PDF; (2) Carrier tracking delivery confirmation; (3) Client communication logs; (4) Timestamped Terms of Service acceptance record with IP and device hash.",
        "substeps": [
            ("206.1", "Implement `assembleEvidencePack(disputeId)` gathering all associated transaction records."),
            ("206.2", "Compile records into standardized card network evidence PDF with table of contents and cover page."),
            ("206.3", "Verify evidence pack complies with Visa and Mastercard dispute document formatting rules."),
            ("206.4", "Store compiled evidence pack in object storage and attach to compliance review queue.")
        ],
        "files": ["// path: lib/disputes/evidence-pack.ts", "// path: tests/disputes/evidence-pack.test.ts"],
        "verification": "Trigger evidence pack assembly; verify resulting PDF bundles invoice, delivery proof, and terms record."
    },
    {
        "number": "207",
        "title": "Compliance Four-Eye Dispute Review & Provider Submission Engine",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build Compliance review queue reviewing evidence pack before formal submission to payment processor.",
        "description": "Construct review queue under `app/(office)/compliance/disputes/`. Compliance officer inspects merchant evidence pack for legal adequacy, adds internal notes, approves submission, and triggers API upload to acquiring processor or card network portal.",
        "substeps": [
            ("207.1", "Build dispute review queue in `app/(office)/compliance/disputes/page.tsx`."),
            ("207.2", "Compliance officer reviews assembled evidence pack, verifying document clarity and rebuttal completeness."),
            ("207.3", "Submit approved evidence pack to gateway dispute API (Stripe, NMI, Rainforest, Airwallex)."),
            ("207.4", "Audit log compliance review decision and gateway submission timestamp in `audit_logs`.")
        ],
        "files": ["// path: app/(office)/compliance/disputes/page.tsx", "// path: lib/disputes/submit.ts", "// path: tests/disputes/submit.test.ts"],
        "verification": "Approve dispute evidence in compliance queue; verify adapter submits evidence pack to gateway sandbox."
    },
    {
        "number": "208",
        "title": "Chargeback Fee Deduction & Balance Offset Engine",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build chargeback fee deduction engine debiting Super Admin configured dispute fee from sub-merchant balance.",
        "description": "Implement dispute fee poster in `lib/disputes/chargeback-fee.ts`. When chargeback occurs: debit Super Admin configured chargeback fee (e.g. $15.00 USD) from sub-merchant balance and credit Account 4200 (Dispute Fee Revenue). Deduct losses from balance or reserve.",
        "substeps": [
            ("208.1", "Retrieve active chargeback fee amount configured by Super Admin (default $15.0000 USD)."),
            ("208.2", "Post double-entry journal: Debit Merchant Available Balance (Account 2000), Credit Dispute Fee Revenue (Account 4200)."),
            ("208.3", "If balance is insufficient, debit fee from Rolling Reserve (Account 2200)."),
            ("208.4", "Write tests verifying chargeback fee posts accurately and updates merchant statement breakdown.")
        ],
        "files": ["// path: lib/disputes/chargeback-fee.ts", "// path: tests/disputes/chargeback-fee.test.ts"],
        "verification": "Process chargeback; verify ledger debits $15 fee from merchant balance and records entry on settlement statement."
    },
    {
        "number": "209",
        "title": "Graduated Card Scheme Chargeback Monitoring & Penalty Framework",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build graduated chargeback monitoring program applying warning -> extra reserve -> suspension upon threshold breach.",
        "description": "Implement card network compliance framework in `lib/disputes/monitoring-program.ts`. Evaluate chargeback ratio: (1) Level 1 (>=0.3%): Warning notification and daily monitoring; (2) Level 2 (>=0.6%): Mandatory +5% rolling reserve and extended hold; (3) Level 3 (>=0.9%): Immediate processing suspension.",
        "substeps": [
            ("209.1", "Implement automated daily evaluation scanning sub-merchant 90-day chargeback rates."),
            ("209.2", "Trigger graduated intervention: Level 1 (warning), Level 2 (reserve escalation), Level 3 (suspension)."),
            ("209.3", "All threshold values are configurable by Super Admin with CEO confirmation."),
            ("209.4", "Audit log all graduated risk escalations and notify merchant with remediation checklist.")
        ],
        "files": ["// path: lib/disputes/monitoring-program.ts", "// path: tests/disputes/monitoring-program.test.ts"],
        "verification": "Simulate merchant breaching 0.6% dispute threshold; verify system escalates reserve by +5% and notifies merchant."
    },
    {
        "number": "210",
        "title": "Dispute Outcome Settlement & Ledger Reversal Finalizer",
        "phase": "Phase 14: Refunds, Chargebacks, Disputes & Evidence Pack Engine",
        "objective": "Build dispute outcome webhook finalizer releasing held funds on win or finalizing loss against held balance on loss.",
        "description": "Implement dispute outcome handler in `lib/disputes/outcome.ts`. Ingest provider outcome webhook: if Dispute WON: release held funds back to Merchant Available Balance; if Dispute LOST: finalize loss by posting chargeback loss journal against held funds.",
        "substeps": [
            ("210.1", "Process dispute won webhook: transition status to `won`, reverse dispute hold, credit Available Balance."),
            ("210.2", "Process dispute lost webhook: transition status to `lost`, debit held reserve, credit Processor Receivable."),
            ("210.3", "Notify sub-merchant by email with detailed outcome report from card network."),
            ("210.4", "Write tests verifying ledger balances correctly after dispute won vs dispute lost outcomes.")
        ],
        "files": ["// path: lib/disputes/outcome.ts", "// path: tests/disputes/outcome.test.ts"],
        "verification": "Simulate dispute won event; verify held funds return to merchant available balance with clean ledger journal."
    }
]

print(f"Group 8 loaded: {len(GROUP_8)} steps.")
