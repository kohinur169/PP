# // path: plan_generator/group2.py
# Phase 3 (Steps 031 - 045) and Phase 4 (Steps 046 - 060)

GROUP_2 = [
    # Phase 3: Cryptography, Key Management & Secure Storage Layer (031 - 045)
    {
        "number": "031",
        "title": "CEO Master Key Custodianship & Environment Secrets Protocol",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Establish CEO cryptographic master key custodianship protocol, key derivation framework, and environment variable guards.",
        "description": "Implement platform key custody architecture where the CEO is the designated custodian of the master encryption key (`MASTER_ENCRYPTION_KEY`). Ensure key material resides strictly in server environment variables and is never persisted in plaintext.",
        "substeps": [
            ("031.1", "Create `lib/crypto/keys.ts` with HKDF (HMAC-based Key Derivation Function) deriving domain-specific subkeys for gateways, files, and PII."),
            ("031.2", "Implement key validity and entropy verification checking key length (minimum 256 bits) on startup."),
            ("031.3", "Create secure memory-scrubbing buffer wrapper clearing key material after cryptographic operations where possible."),
            ("031.4", "Document key custody and emergency recovery protocol in `docs/security/KEY_CUSTODIANSHIP.md`.")
        ],
        "files": ["// path: lib/crypto/keys.ts", "// path: docs/security/KEY_CUSTODIANSHIP.md", "// path: tests/crypto/keys.test.ts"],
        "verification": "Verify subkey derivation produces stable, cryptographically isolated keys for distinct domains and fails if master key is invalid."
    },
    {
        "number": "032",
        "title": "AES-256-GCM Envelope Encryption & Decryption Engine",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build authenticated symmetric encryption engine using AES-256-GCM with unique 96-bit IVs and authentication tags.",
        "description": "Construct high-performance encryption utilities in `lib/crypto/aes.ts`. Encrypt sensitive secrets (gateway API keys, webhook secrets, TaxCloud credentials, email secrets, stored card tokens) using AES-256-GCM, producing ciphertext containing IV, auth tag, and payload.",
        "substeps": [
            ("032.1", "Implement `encryptAesGcm(plaintext, key)` generating unique 12-byte IV and returning serialized `iv:authTag:ciphertext`."),
            ("032.2", "Implement `decryptAesGcm(encryptedPayload, key)` verifying 16-byte authentication tag before returning plaintext."),
            ("032.3", "Enforce strict error handling throwing DecryptionError without leaking plaintext or key details on auth tag mismatch."),
            ("032.4", "Write unit test verifying round-trip encryption/decryption and detection of single-bit ciphertext tampering.")
        ],
        "files": ["// path: lib/crypto/aes.ts", "// path: tests/crypto/aes.test.ts"],
        "verification": "Encrypt string, modify 1 byte of ciphertext or auth tag; verify decryption immediately throws authentication error."
    },
    {
        "number": "033",
        "title": "Masked Display & Sensitive Value Formatting Utility",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build universal masking utility displaying only last 4 characters and last updated timestamp for all secrets.",
        "description": "Enforce platform security rule: after initial saving, a secret or gateway key is never shown again in full. Create masking utilities displaying strings like `••••••••••••••••3a9f` and recording `updated_at` time for admin verification.",
        "substeps": [
            ("033.1", "Create `lib/crypto/mask.ts` implementing `maskSecret(value, visibleSuffixLength = 4)`."),
            ("033.2", "Implement card number mask `maskCardNumber(last4, brand)` and bank account mask `maskBankAccount(last4)`."),
            ("033.3", "Create React UI component `<MaskedSecretDisplay value={maskedValue} lastUpdated={timestamp} />`."),
            ("033.4", "Add unit tests verifying input strings shorter than visible suffix length are safely redacted without leaks.")
        ],
        "files": ["// path: lib/crypto/mask.ts", "// path: components/security/MaskedSecretDisplay.tsx", "// path: tests/crypto/mask.test.ts"],
        "verification": "Pass API key `sk_live_9876543210abcdef` to maskSecret; verify output is `••••••••••••cdef` and never reveals prefix or body."
    },
    {
        "number": "034",
        "title": "Automated Key Rotation Pipeline for Stored Credentials",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Implement credential rotation procedure allowing re-encryption of gateway keys and credentials under a new master key.",
        "description": "Build rotation utility in `lib/crypto/rotate.ts` supporting key rollover. Allow adding a new key version, testing active connection, re-encrypting all database records with new key, and removing old key version with full audit logging.",
        "substeps": [
            ("034.1", "Design encrypted payload envelope supporting key version header (`v1:iv:tag:cipher`, `v2:iv:tag:cipher`)."),
            ("034.2", "Implement batch re-encryption script scanning encrypted columns and updating to latest key version in transaction."),
            ("034.3", "Integrate pre-rotation connection test ensuring new keys are valid before committing database updates."),
            ("034.4", "Record key rotation event in `audit_logs` including actor ID, key version transition, and affected record count.")
        ],
        "files": ["// path: lib/crypto/rotate.ts", "// path: scripts/rotate-keys.ts", "// path: tests/crypto/rotate.test.ts"],
        "verification": "Execute test rotation from Key V1 to Key V2 on sample gateway credentials; verify clean decryption under V2 and audit log entry."
    },
    {
        "number": "035",
        "title": "PII HMAC-SHA256 Blind Indexing & Document Hashing Utilities",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build blind indexing utilities hashing identity document numbers, tax IDs, and bank account fingerprints for duplicate detection.",
        "description": "Enable duplicate detection without storing or querying plaintext PII. Implement HMAC-SHA256 blind indexing with a dedicated secret key to generate deterministic fingerprints for passport numbers, national IDs, tax numbers, and bank account details.",
        "substeps": [
            ("035.1", "Create `lib/crypto/hash.ts` implementing `generateBlindIndex(normalizedValue, domainKey)` using HMAC-SHA256."),
            ("035.2", "Implement normalization helpers stripping spaces, hyphens, and converting to uppercase before hashing."),
            ("035.3", "Implement bank account fingerprinting combining routing/SWIFT code and normalized account number."),
            ("035.4", "Add unit tests verifying identical values produce matching blind hashes and different values produce distinct hashes.")
        ],
        "files": ["// path: lib/crypto/hash.ts", "// path: tests/crypto/hash.test.ts"],
        "verification": "Hash various formatted SSNs and passports; verify identical normalized IDs produce identical blind index hashes."
    },
    {
        "number": "036",
        "title": "Unified Object Storage Adapter Interface Specification",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Define standard TypeScript interface for cloud storage adapters with tenant-separated paths and signed URL capabilities.",
        "description": "Specify the contract in `lib/storage/types.ts` for cloud object storage. Ensure identical API signatures across Supabase Storage and Amazon S3, supporting encrypted upload, stream download, signed URL generation, and deletion.",
        "substeps": [
            ("036.1", "Define `StorageAdapter` interface with methods: `uploadFile`, `getSignedUrl`, `deleteFile`, and `checkHealth`."),
            ("036.2", "Define `StorageUploadOptions` with `companyId`, `category` (kyc, invoices, disputes, logos), and `encryption` options."),
            ("036.3", "Define strict path conventions: `companies/{companyId}/{category}/{fileId}_{filename}` to guarantee tenant isolation."),
            ("036.4", "Create mock storage adapter implementation for local testing and CI pipelines.")
        ],
        "files": ["// path: lib/storage/types.ts", "// path: lib/storage/mock.ts"],
        "verification": "Verify TypeScript compiles mock adapter fulfilling all interface methods without type errors."
    },
    {
        "number": "037",
        "title": "Supabase Storage Adapter Implementation",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build production Supabase Storage adapter fulfilling `StorageAdapter` interface with tenant path segregation.",
        "description": "Implement Supabase Storage client in `lib/storage/supabase.ts` using `@supabase/supabase-js`. Support private bucket operations, pre-encrypted stream uploads, short-lived signed URLs, and file deletion.",
        "substeps": [
            ("037.1", "Implement `SupabaseStorageAdapter` class connecting to Supabase private storage bucket."),
            ("037.2", "Implement `uploadFile` handling buffer/stream uploads with tenant-isolated path generation."),
            ("037.3", "Implement `getSignedUrl` generating signed download URLs with configurable expiration (default 15 minutes)."),
            ("037.4", "Add error handling mapping Supabase storage errors to standard `StorageError` classes.")
        ],
        "files": ["// path: lib/storage/supabase.ts", "// path: tests/storage/supabase.test.ts"],
        "verification": "Upload sample test file via Supabase adapter; verify file resides in private bucket and signed URL downloads successfully."
    },
    {
        "number": "038",
        "title": "Amazon S3 Storage Adapter Implementation",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build Amazon S3 storage adapter fulfilling `StorageAdapter` interface using AWS SDK v3 with signed URL generation.",
        "description": "Implement Amazon S3 client in `lib/storage/s3.ts` using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Support private bucket uploads, multipart large file uploads, server-side encryption headers, and presigned GET URLs.",
        "substeps": [
            ("038.1", "Implement `S3StorageAdapter` class initializing S3Client with credentials from environment variables."),
            ("038.2", "Implement `uploadFile` using PutObjectCommand with ContentType and tenant-isolated S3 key path."),
            ("038.3", "Implement `getSignedUrl` using `getSignedUrl` helper with GetObjectCommand and 15-minute expiration."),
            ("038.4", "Implement `deleteFile` using DeleteObjectCommand and verify idempotency.")
        ],
        "files": ["// path: lib/storage/s3.ts", "// path: tests/storage/s3.test.ts"],
        "verification": "Upload file using S3 adapter; verify presigned URL retrieves file and expires after configured interval."
    },
    {
        "number": "039",
        "title": "Zero-Core-Rewrite Storage Provider Factory",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Implement dynamic storage provider factory selecting active adapter via `STORAGE_PROVIDER` environment variable.",
        "description": "Create storage provider factory in `lib/storage/index.ts`. Switch seamlessly between Supabase Storage and Amazon S3 based on configuration (`STORAGE_PROVIDER=supabase` vs `STORAGE_PROVIDER=s3`), enabling deployment on Vercel, Netlify, or AWS without changing application code.",
        "substeps": [
            ("039.1", "Create `getStorageAdapter()` singleton factory resolving active adapter from environment."),
            ("039.2", "Validate storage credentials for selected provider on startup and fail immediately if misconfigured."),
            ("039.3", "Enforce ban on server-local disk storage (`/tmp` or local filesystem) across all deployment targets."),
            ("039.4", "Add unit test verifying factory instantiates correct adapter class based on environment flag.")
        ],
        "files": ["// path: lib/storage/index.ts", "// path: tests/storage/factory.test.ts"],
        "verification": "Toggle `STORAGE_PROVIDER` between 'supabase' and 's3'; verify factory loads correct adapter without code changes."
    },
    {
        "number": "040",
        "title": "File Upload Validation, Magic Byte Sniffing & Size Guards",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build strict file upload validator checking file size limits, MIME types, and verifying true file types via magic bytes.",
        "description": "Prevent malicious file uploads (executables, PHP scripts, SVGs with embedded scripts) by inspecting actual file binary headers (magic bytes) using `file-type`. Enforce strict size limits (10MB for KYC docs, 2MB for logos, 20MB for dispute packs).",
        "substeps": [
            ("040.1", "Create `lib/storage/validator.ts` inspecting buffer magic bytes with `file-type` library."),
            ("040.2", "Define strict allowed MIME types per category: KYC (PDF, PNG, JPEG), Logos (PNG, JPEG, WEBP), Disputes (PDF, ZIP, PNG, JPEG)."),
            ("040.3", "Validate file size against configured category limits and reject oversized uploads with HTTP 413."),
            ("040.4", "Add unit tests verifying rejection of renamed `.exe` files disguised as `.pdf` or `.jpg`.")
        ],
        "files": ["// path: lib/storage/validator.ts", "// path: tests/storage/validator.test.ts"],
        "verification": "Attempt upload of fake PDF containing executable binary header; verify validator rejects upload with HTTP 422."
    },
    {
        "number": "041",
        "title": "Pre-Upload File Encryption Pipeline (AES-256-GCM)",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build client/server pre-upload encryption pipeline encrypting all file payloads with AES-256-GCM before object storage transfer.",
        "description": "Per KD Solution IT security policy, every uploaded file (KYC identity documents, trade licenses, utility bills, dispute evidence) must be AES-256-GCM encrypted prior to transmission to cloud storage. Ensure zero unencrypted files exist in cloud buckets.",
        "substeps": [
            ("041.1", "Implement `encryptFileBuffer(fileBuffer, companyKey)` producing encrypted binary stream and metadata header."),
            ("041.2", "Implement `decryptFileBuffer(encryptedBuffer, companyKey)` decrypting on retrieval during authorized access."),
            ("041.3", "Compute SHA-256 integrity hash of original unencrypted file for tamper detection and audit logs."),
            ("041.4", "Write tests verifying round-trip file buffer encryption/decryption preserving byte-for-byte fidelity.")
        ],
        "files": ["// path: lib/storage/file-encryption.ts", "// path: tests/storage/file-encryption.test.ts"],
        "verification": "Upload sample PDF; download raw object from cloud storage bucket and verify it is completely unreadable ciphertext."
    },
    {
        "number": "042",
        "title": "File Metadata Schema & Company Isolation Migration",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Create `files` metadata table tracking storage provider, file hash, size, MIME type, company_id, and encryption parameters.",
        "description": "Migrate database table `files` cataloging all uploaded assets with standard UUIDv7 primary keys, `company_id`, `storage_provider`, `storage_path`, `file_hash`, `size_bytes`, `mime_type`, `category`, and strict RLS tenant isolation policies.",
        "substeps": [
            ("042.1", "Create SQL migration `012_create_files_table.sql` with foreign key to companies and standard base columns."),
            ("042.2", "Add columns: `storage_provider VARCHAR(20)`, `storage_path TEXT`, `file_hash VARCHAR(64)`, `size_bytes BIGINT`, `mime_type VARCHAR(100)`."),
            ("042.3", "Install RLS policies preventing sub-merchants from accessing files belonging to other companies."),
            ("042.4", "Create database access helpers in `lib/db/files.ts`.")
        ],
        "files": ["// path: db/migrations/012_create_files_table.sql", "// path: types/file.ts", "// path: lib/db/files.ts"],
        "verification": "Verify table structure, constraints, and verify tenant A cannot query file metadata belonging to tenant B."
    },
    {
        "number": "043",
        "title": "Short-Lived Signed Download URL Generator & Access Logger",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build secure file download handler issuing 15-minute signed URLs with mandatory audit log tracking on every access.",
        "description": "Implement file download endpoint (`GET /api/files/[id]/download`). Verify requester role and tenant membership, generate a 15-minute expiring signed URL, decrypt on the fly if needed, and write an immutable entry into `audit_logs`.",
        "substeps": [
            ("043.1", "Implement `generateSecureDownloadUrl(fileId, userId)` in `lib/storage/signed-url.ts`."),
            ("043.2", "Enforce tenant and role check: verify user owns file or holds compliance_kyc / super_admin role."),
            ("043.3", "Record `FILE_ACCESSED` event in `audit_logs` capturing fileId, actorId, ipAddress, and timestamp."),
            ("043.4", "Add unit tests verifying expired signed URLs cannot be reused after 15 minutes.")
        ],
        "files": ["// path: lib/storage/signed-url.ts", "// path: app/api/files/[id]/download/route.ts", "// path: tests/storage/download.test.ts"],
        "verification": "Request download URL for sensitive KYC doc; verify signed URL generated and audit log entry created."
    },
    {
        "number": "044",
        "title": "Secure File Deletion, Crypto-Shredding & Retention Pipeline",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Implement secure deletion and crypto-shredding engine complying with 7-year regulatory retention mandates.",
        "description": "Construct file lifecycle management engine in `lib/storage/retention.ts`. Enforce 7-year retention for KYC, transaction, and dispute documents. For expired or legally deleted files, delete object from storage and crypto-shred metadata and encryption keys.",
        "substeps": [
            ("044.1", "Create `softDeleteFile(fileId, actorId)` marking `deleted_at` timestamp without immediate physical removal."),
            ("044.2", "Implement regulatory retention checker blocking deletion of records younger than 7 years."),
            ("044.3", "Implement `cryptoShredFile(fileId)` destroying document key material and overwriting metadata on approved disposal."),
            ("044.4", "Write tests verifying retention guard prevents deletion of active merchant KYC documents.")
        ],
        "files": ["// path: lib/storage/retention.ts", "// path: tests/storage/retention.test.ts"],
        "verification": "Attempt deletion of 1-year-old KYC file; verify system rejects deletion due to 7-year retention rule."
    },
    {
        "number": "045",
        "title": "Storage Integrity Scanner & Health Checker Utility",
        "phase": "Phase 3: Cryptography, Key Management & Secure Storage Layer",
        "objective": "Build automated integrity scanner verifying cloud storage objects match database checksums and detecting bit rot.",
        "description": "Create automated maintenance scanner in `scripts/check-storage.ts`. Compute SHA-256 hashes of stored files, compare against database `file_hash`, and alert office team immediately on missing objects or checksum mismatches.",
        "substeps": [
            ("045.1", "Implement batch scanner iterating file metadata records and verifying cloud object existence."),
            ("045.2", "Download and calculate checksums for sampled records, asserting equality with database `file_hash`."),
            ("045.3", "Generate health report detailing total stored gigabytes, missing objects, and verification status."),
            ("045.4", "Configure automated weekly scheduled job triggering storage integrity scan.")
        ],
        "files": ["// path: scripts/check-storage.ts", "// path: lib/storage/health.ts"],
        "verification": "Run `npm run storage:check`; verify scanner processes all records and outputs clean verification report."
    },

    # Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile (046 - 060)
    {
        "number": "046",
        "title": "Merchant & Staff Registration Endpoint with Turnstile Guard",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build merchant registration API protected by Cloudflare Turnstile, email normalization, and rate limiting.",
        "description": "Create `POST /api/auth/register` validating incoming merchant signup data. Enforce Turnstile bot verification, normalize email (lowercase, trim), check password breach database, create user record, and dispatch verification email.",
        "substeps": [
            ("046.1", "Define registration Zod schema in `lib/validation/auth.ts` requiring email, password, full legal name, and Turnstile token."),
            ("046.2", "Implement route handler `app/api/auth/register/route.ts` validating Turnstile token via `verifyTurnstileToken`."),
            ("046.3", "Enforce strict IP rate limiting (maximum 5 registration attempts per hour per IP) via Upstash/memory store."),
            ("046.4", "Write integration test verifying successful registration and rejection of invalid Turnstile tokens.")
        ],
        "files": ["// path: app/api/auth/register/route.ts", "// path: lib/validation/auth.ts", "// path: tests/auth/register.test.ts"],
        "verification": "Submit registration with valid Turnstile token; verify user created with status `pending_verification`."
    },
    {
        "number": "047",
        "title": "Argon2id Password Hashing & HaveIBeenPwned Breach Checker",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Implement Argon2id password hashing and HaveIBeenPwned k-Anonymity API breach detection.",
        "description": "Enforce high-strength password policy (minimum 12 characters, uppercase, lowercase, numbers, symbols, zxcvbn score >= 3). Hash passwords using Argon2id. Check candidate passwords against HaveIBeenPwned API using SHA-1 k-Anonymity to reject breached credentials.",
        "substeps": [
            ("047.1", "Implement `hashPassword(password)` and `verifyPassword(password, hash)` using `argon2` (Argon2id profile)."),
            ("047.2", "Implement `checkBreachedPassword(password)` in `lib/auth/pwned.ts` querying HIBP k-Anonymity range API."),
            ("047.3", "Integrate zxcvbn complexity scoring requiring minimum score of 3 for merchant/staff passwords."),
            ("047.4", "Add unit tests verifying rejection of common breached passwords (e.g. 'P@ssword1234!').")
        ],
        "files": ["// path: lib/auth/password.ts", "// path: lib/auth/pwned.ts", "// path: tests/auth/password.test.ts"],
        "verification": "Attempt registration with known breached password; verify system rejects with error `Password has been compromised in public breaches`."
    },
    {
        "number": "048",
        "title": "Cryptographic Email Verification Token Engine",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build secure email verification engine using high-entropy random tokens with 24-hour expiration.",
        "description": "Create email verification system in `lib/auth/email-verify.ts`. Generate cryptographically secure 256-bit random tokens, store SHA-256 token hash in `email_verification_tokens` table, and send verification link. Verify tokens and activate account upon consumption.",
        "substeps": [
            ("048.1", "Create SQL migration `013_create_email_verification_tokens.sql` storing `user_id`, `token_hash`, `expires_at`, `used_at`."),
            ("048.2", "Implement `generateEmailVerificationToken(userId)` returning one-time URL token."),
            ("048.3", "Create route `GET /api/auth/verify-email?token=...` verifying token hash, activating user, and marking token used."),
            ("048.4", "Add unit tests verifying expired or previously used tokens cannot activate an account.")
        ],
        "files": ["// path: db/migrations/013_create_email_verification_tokens.sql", "// path: lib/auth/email-verify.ts", "// path: app/api/auth/verify-email/route.ts"],
        "verification": "Generate token, visit verification endpoint; confirm user status transitions to `active`."
    },
    {
        "number": "049",
        "title": "Anti-Enumeration Login API with Strict Rate Limiting",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build secure login endpoint with anti-account-enumeration defenses and IP/account rate limits.",
        "description": "Implement `POST /api/auth/login`. Defend against account enumeration attacks: return identical generic error messages (`Invalid credentials`) and run dummy password hash comparisons when an email does not exist to ensure constant-time response latency.",
        "substeps": [
            ("049.1", "Create login handler in `app/api/auth/login/route.ts` validating Turnstile token and credentials."),
            ("049.2", "Implement constant-time authentication flow executing dummy Argon2id verification if user record not found."),
            ("049.3", "Enforce IP rate limit (maximum 10 attempts per minute per IP) and audit log all failed attempts."),
            ("049.4", "Write tests measuring timing differences between existing and non-existing email logins to ensure <20ms variance.")
        ],
        "files": ["// path: app/api/auth/login/route.ts", "// path: lib/auth/login.ts", "// path: tests/auth/login-timing.test.ts"],
        "verification": "Test login with valid vs non-existent email; verify identical error message and indistinguishable response duration."
    },
    {
        "number": "050",
        "title": "Persistent 2-Hour Account Lockout on 2 Consecutive Failed Attempts",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Implement database-persisted account lockout locking accounts for 2 hours after exactly 2 consecutive failed attempts.",
        "description": "Enforce KD Solution IT authentication rule: 2 consecutive failed password or 2FA attempts immediately lock the account for 2 hours. Store failed counter and `locked_until` in the database so locks survive server restarts. Block password resets during active lock.",
        "substeps": [
            ("050.1", "Implement `recordFailedLoginAttempt(userId)` incrementing `failed_attempts` in `users` table."),
            ("050.2", "If `failed_attempts >= 2`, set `locked_until = NOW() + INTERVAL '2 hours'` and dispatch lockout security email."),
            ("050.3", "Enforce lockout guard: reject authentication attempts while `locked_until > NOW()` even with correct password."),
            ("050.4", "Block password reset initiation and forbid clearing lock by changing password while locked.")
        ],
        "files": ["// path: lib/auth/lockout.ts", "// path: tests/auth/lockout.test.ts"],
        "verification": "Enter 2 incorrect passwords; verify account locks for 2 hours, correct password is rejected, and lockout email is dispatched."
    },
    {
        "number": "051",
        "title": "Office Unlock Workflow with Mandatory Email Verification",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build administrative unlock workflow requiring office authorization and confirmed email contact with account owner.",
        "description": "Implement office account unlock mechanism in `lib/office/unlock.ts`. Allow authorized staff (compliance_kyc or super_admin) to unlock a locked account only after confirming contact with the owner by email. Reset counter, clear lock, and audit log.",
        "substeps": [
            ("051.1", "Create `POST /api/office/users/[id]/unlock` endpoint requiring step-up reauthentication from staff."),
            ("051.2", "Require mandatory confirmation checkbox: 'I confirm direct contact with account owner has been verified'."),
            ("051.3", "Reset `failed_attempts = 0` and `locked_until = NULL` in database transaction."),
            ("051.4", "Write `USER_UNLOCKED_BY_OFFICE` entry to `audit_logs` capturing staff actorId, target userId, and reason.")
        ],
        "files": ["// path: app/api/office/users/[id]/unlock/route.ts", "// path: lib/office/unlock.ts", "// path: tests/office/unlock.test.ts"],
        "verification": "Unlock locked account from office dashboard; verify user can log in immediately and audit log records action."
    },
    {
        "number": "052",
        "title": "Mandatory 2FA TOTP Enrollment & QR Code Generator",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Implement mandatory Time-based One-Time Password (TOTP) two-factor authentication for all account roles.",
        "description": "Enforce mandatory 2FA enrollment across all users (merchants and staff). Generate standard RFC 6238 TOTP secrets, provide authenticator QR codes, verify enrollment code before activating 2FA, and encrypt TOTP secrets at rest using AES-256-GCM.",
        "substeps": [
            ("052.1", "Install `otplib` and `qrcode` libraries in `lib/auth/totp.ts`."),
            ("052.2", "Implement `generateTotpSecret(userId)` generating 20-byte base32 secret and encrypted storage."),
            ("052.3", "Create `POST /api/auth/2fa/verify-enrollment` validating user's first 6-digit code before enabling 2FA."),
            ("052.4", "Create middleware interceptor redirecting non-2FA-enrolled users to mandatory 2FA setup page on login.")
        ],
        "files": ["// path: lib/auth/totp.ts", "// path: app/api/auth/2fa/setup/route.ts", "// path: components/auth/TotpEnrollment.tsx"],
        "verification": "Enroll test user with Google Authenticator/Authy; verify valid 6-digit TOTP code completes setup."
    },
    {
        "number": "053",
        "title": "Encrypted Backup Codes Generation & Single-Use Consumption",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build single-use backup recovery codes generator allowing merchants to access accounts if TOTP device is lost.",
        "description": "Generate 10 cryptographically random 8-character alphanumeric backup codes during 2FA enrollment. Store argon2id/bcrypt hashes of backup codes in `user_backup_codes` table. Allow merchants to regenerate fresh codes in advance from security settings.",
        "substeps": [
            ("053.1", "Create SQL migration `014_create_backup_codes_table.sql` with `user_id`, `code_hash`, `used_at`, `created_at`."),
            ("053.2", "Implement `generateBackupCodes(userId)` returning 10 plain codes to user while storing hashes in database."),
            ("053.3", "Implement backup code consumption logic during login: verify code hash, mark used, and prevent replay."),
            ("053.4", "Provide settings button allowing merchants to regenerate 10 fresh codes, invalidating all old codes.")
        ],
        "files": ["// path: db/migrations/014_create_backup_codes_table.sql", "// path: lib/auth/backup-codes.ts", "// path: tests/auth/backup-codes.test.ts"],
        "verification": "Use backup code during login; verify code works once and is immediately marked used and cannot be re-used."
    },
    {
        "number": "054",
        "title": "Office 2FA Reset Workflow for Lost Credentials",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Implement formal office 2FA reset procedure when merchant exhausts or loses all backup codes and authenticator device.",
        "description": "Per KD Solution IT protocol: when backup codes are lost, merchant contacts support by email and submits identity documents for manual verification. Upon approval by office staff, reset 2FA and force fresh TOTP setup on next login.",
        "substeps": [
            ("054.1", "Create `office_2fa_reset_requests` table tracking ticket_id, user_id, verification_docs, reviewed_by, status."),
            ("054.2", "Implement office approval action clearing existing TOTP secret and backup codes."),
            ("054.3", "Flag user record with `must_setup_2fa = true` forcing mandatory 2FA enrollment on immediate next login."),
            ("054.4", "Log `2FA_RESET_BY_OFFICE` in `audit_logs` with reviewer ID, verification document references, and timestamp.")
        ],
        "files": ["// path: db/migrations/015_office_2fa_resets.sql", "// path: lib/office/2fa-reset.ts", "// path: app/(office)/compliance/2fa-resets/page.tsx"],
        "verification": "Execute office 2FA reset; verify user can log in with password and is immediately forced into fresh 2FA setup."
    },
    {
        "number": "055",
        "title": "LR-022 Session Engine with HttpOnly Secure SameSite=Strict Cookies",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build session management engine enforcing LR-022 protocol with HttpOnly, Secure, and SameSite=Strict cookies.",
        "description": "Implement high-security session management in `lib/auth/session.ts`. Store session state in `sessions` table. Issue session-bound cookies configured strictly as `HttpOnly`, `Secure`, `SameSite=Strict`, and path `/`. Bind every cookie strictly to its internal session record.",
        "substeps": [
            ("055.1", "Create SQL migration `016_create_sessions_table.sql` with `session_id UUIDv7`, `user_id`, `token_hash`, `device_id`, `expires_at`."),
            ("055.2", "Implement `createSession(userId, deviceContext)` setting encrypted session cookie."),
            ("055.3", "Implement session validator extracting and verifying session cookie on every request in Next.js middleware."),
            ("055.4", "Write tests verifying cookie attributes comply with HttpOnly, Secure, and SameSite=Strict.")
        ],
        "files": ["// path: db/migrations/016_create_sessions_table.sql", "// path: lib/auth/session.ts", "// path: tests/auth/session.test.ts"],
        "verification": "Inspect Set-Cookie header on login; verify presence of HttpOnly, Secure, and SameSite=Strict flags."
    },
    {
        "number": "056",
        "title": "Per-Device Proof Key & Hardware Fingerprinting Engine",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Implement client-side device proof key and browser fingerprinting detecting unrecognized devices.",
        "description": "Generate unique device fingerprint and client proof key on device initialization. Track recognized devices in `user_devices` table. Detect logins from new devices, require step-up verification, and dispatch instant security email alerts.",
        "substeps": [
            ("056.1", "Create `user_devices` table storing `user_id`, `device_fingerprint`, `proof_key`, `first_seen_at`, `last_ip`."),
            ("056.2", "Implement device recognition utility comparing incoming device fingerprint and IP against known devices."),
            ("056.3", "If new device detected, dispatch `NEW_DEVICE_LOGIN_ALERT` email and require email confirmation code."),
            ("056.4", "Add unit tests verifying device fingerprint matching and new device alert triggering.")
        ],
        "files": ["// path: db/migrations/017_create_user_devices.sql", "// path: lib/auth/device.ts", "// path: tests/auth/device.test.ts"],
        "verification": "Simulate login from new user agent and IP; verify device flagged as new and alert email dispatched."
    },
    {
        "number": "057",
        "title": "Rotating Session Tokens & Family Invalidation on Replay Detection",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build rotating session token mechanism that invalidates entire session family immediately if a replayed token is detected.",
        "description": "Implement token rotation on sensitive operations or periodic intervals. Maintain parent-child session lineage (`session_family_id`). If an old already-consumed session token is presented (indicating cookie theft/replay), immediately revoke all sessions in that family.",
        "substeps": [
            ("057.1", "Add `session_family_id` and `is_revoked` columns to `sessions` table."),
            ("057.2", "Implement `rotateSession(currentSessionId)` generating new token and marking previous token consumed."),
            ("057.3", "Implement replay detection: if a consumed token is presented, mark entire `session_family_id` revoked immediately."),
            ("057.4", "Write integration test simulating stolen cookie replay; verify all related sessions terminated instantly.")
        ],
        "files": ["// path: lib/auth/rotation.ts", "// path: tests/auth/token-replay.test.ts"],
        "verification": "Replay an expired rotated session cookie; verify all sessions for that user family are revoked and user is logged out."
    },
    {
        "number": "058",
        "title": "Step-Up Reauthentication Engine for Sensitive Office Operations",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Enforce step-up reauthentication requiring fresh password or 2FA verification for high-privilege operations.",
        "description": "Require fresh reauthentication (within previous 5 minutes) before permitting: gateway API key changes, payout approvals, KYC final approvals, and account unlocks. Track `last_reauth_at` timestamp in session and challenge user when expired.",
        "substeps": [
            ("058.1", "Implement `requireStepUpAuth(session, maxAgeSeconds = 300)` guard middleware."),
            ("058.2", "Create modal UI component `<StepUpAuthModal onVerified={callback} />` prompting for password or 2FA."),
            ("058.3", "Create `POST /api/auth/step-up` validating fresh credentials and updating `last_reauth_at`."),
            ("058.4", "Write tests verifying sensitive gateway management endpoints reject requests with stale reauthentication.")
        ],
        "files": ["// path: lib/auth/step-up.ts", "// path: components/auth/StepUpAuthModal.tsx", "// path: tests/auth/step-up.test.ts"],
        "verification": "Attempt to reveal or edit gateway keys after 10 minutes of inactivity; verify step-up challenge is displayed."
    },
    {
        "number": "059",
        "title": "Instant Session Invalidation API & Global Kill-Switch",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build single-session logout and global account session revocation API terminating all active logins immediately.",
        "description": "Create session revocation endpoints in `app/api/auth/logout/route.ts` and `app/api/auth/revoke-all/route.ts`. Invalidate session records in PostgreSQL and clear client cookies. Terminate all active logins instantly on password change or security alert.",
        "substeps": [
            ("059.1", "Implement `logout(sessionId)` deleting session record and expiring client cookie."),
            ("059.2", "Implement `revokeAllSessions(userId)` revoking all active sessions across all devices for that user."),
            ("059.3", "Trigger `revokeAllSessions` automatically upon password change or office security intervention."),
            ("059.4", "Write test verifying user with 3 active browser sessions is terminated across all browsers upon calling `revokeAllSessions`.")
        ],
        "files": ["// path: app/api/auth/logout/route.ts", "// path: app/api/auth/revoke-all/route.ts", "// path: lib/auth/session-kill.ts"],
        "verification": "Invoke `revoke-all`; verify subsequent requests from any active browser are immediately redirected to login."
    },
    {
        "number": "060",
        "title": "Password Reset Flow with Turnstile & Lockout Immunity Guard",
        "phase": "Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile",
        "objective": "Build secure password reset flow protected by Turnstile, time-limited reset tokens, and locked-account immunity guards.",
        "description": "Implement password recovery workflow (`/forgot-password` and `/reset-password`). Verify Turnstile, generate 1-hour secure reset token, dispatch email link, enforce strong password policy on update, and guarantee that locked accounts cannot bypass 2-hour locks via reset.",
        "substeps": [
            ("060.1", "Create `password_reset_tokens` table tracking `user_id`, `token_hash`, `expires_at`, `used_at`."),
            ("060.2", "Implement `POST /api/auth/forgot-password` generating token and sending email with generic success response."),
            ("060.3", "Enforce lockout guard: if account currently locked (`locked_until > NOW()`), refuse token creation or consumption."),
            ("060.4", "Implement `POST /api/auth/reset-password` updating password hash, revoking all sessions, and invalidating token.")
        ],
        "files": ["// path: db/migrations/018_create_password_reset_tokens.sql", "// path: app/api/auth/forgot-password/route.ts", "// path: app/api/auth/reset-password/route.ts"],
        "verification": "Request password reset; verify token works once within 1 hour and is rejected if account is in 2-hour lockout."
    }
]

print(f"Group 2 loaded: {len(GROUP_2)} steps.")
