<!-- path: docs/security/KEY_CUSTODIANSHIP.md -->

# KD Solution IT: CEO Master Key Custodianship & Secrets Protocol

## 1. Executive Summary & Policy Overview

The KD Solution IT Multi-Tenant Payment Facilitator Platform implements a strict cryptographic key hierarchy. Per executive governance rules:

1. **Designated Custodian:** The **Chief Executive Officer (CEO)** is the primary custodian of the Master Encryption Key (`MASTER_ENCRYPTION_KEY`).
2. **Environment Variable Isolation:** Key material exists **strictly in server environment variables** during process runtime. It is **never** persisted in databases, disk storage, application logs, or source code repositories.
3. **Domain Subkey Derivation:** The master key is never used directly for encryption. Instead, domain-specific subkeys are derived via **HKDF (RFC 5869)** with SHA-256 HMAC for each cryptographic subsystem (`gateways`, `pii`, `files`, `webhooks`, `tokens`, `ledger`).
4. **Memory Hygiene:** All raw key buffers are immediately zeroized using memory-scrubbing primitives (`zeroizeBuffer`, `withSecureBuffer`) to minimize in-memory exposure windows.

---

## 2. Master Key Architecture & Specifications

### Key Parameters
- **Algorithm Family:** HMAC-based Key Derivation Function (HKDF) / AES-256-GCM
- **Minimum Key Entropy:** 256 bits (32 bytes)
- **Supported Encodings:**
  - 64-character Hexadecimal string (recommended)
  - 44-character Base64 string
  - Raw 32-byte binary buffer

### Validation Rules
- Keys shorter than 256 bits trigger an immediate startup halt (`MasterKeyValidationError`).
- In production (`NODE_ENV === 'production'`), platform initialization fails immediately if `MASTER_ENCRYPTION_KEY` is not present in the environment.

---

## 3. Cryptographic Domain Isolation Matrix

| Domain | Scope & Data Handled | HKDF Info Prefix | Subkey Length |
|---|---|---|---|
| `gateways` | Gateway API credentials (NMI, Payoneer, Rainforest, Stripe Connect, Airwallex) | `kd-solution-payfac:gateways:<ctx>` | 256 bits (32B) |
| `pii` | Customer & Merchant PII (National ID, Tax ID, Bank Account Numbers) | `kd-solution-payfac:pii:<ctx>` | 256 bits (32B) |
| `files` | Encrypted KYC identity documents, passport scans, incorporation certificates | `kd-solution-payfac:files:<ctx>` | 256 bits (32B) |
| `webhooks` | Merchant and platform webhook signing secrets | `kd-solution-payfac:webhooks:<ctx>` | 256 bits (32B) |
| `tokens` | Ephemeral payment card tokens and sensitive session tokens | `kd-solution-payfac:tokens:<ctx>` | 256 bits (32B) |
| `ledger` | Double-entry ledger audit hashes and signed reconciliation checkpoints | `kd-solution-payfac:ledger:<ctx>` | 256 bits (32B) |

---

## 4. Key Custody & Emergency Recovery Protocol

### Dual-Custody Ceremony
In the event of CEO unavailability or catastrophic infrastructure re-provisioning:
1. The **Master Key** is generated or split using a 2-of-3 Shamir's Secret Sharing threshold scheme:
   - **Share 1:** Held by the **Chief Executive Officer (CEO)**.
   - **Share 2:** Held by the **Chief Compliance Officer (CCO)**.
   - **Share 3:** Stored in a physical offline safety deposit box in an insured banking institution in Singapore.
2. Reassembly requires presence of at least 2 key custodians.

### Annual Key Rotation Procedure
1. CEO authorizes key rotation schedule.
2. New master key is injected into production environment under `MASTER_ENCRYPTION_KEY_NEXT`.
3. Background re-encryption runner decrypts all stored secrets using current subkeys and re-encrypts using newly derived subkeys.
4. Old key is deprecated, verified zeroized, and retired.

---

## 5. Memory Scrubbing & Defensive Coding Standards

All cryptographic operations consuming key material must adhere to the scoped execution pattern:

```typescript
import { withDerivedKey } from '@/lib/crypto/keys';

const ciphertext = withDerivedKey('gateways', (key) => {
  return encryptAesGcm(secretData, key);
});
// 'key' buffer is automatically overwritten with zeroes (zeroized) upon exiting withDerivedKey.
```
