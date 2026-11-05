<!-- path: docs/security/CDE_ISOLATION.md -->

# Cardholder Data Environment (CDE) Complete Isolation Architecture (PCI-DSS SAQ A)

This architecture specification outlines the physical and logical boundaries governing Cardholder Data Environment (CDE) isolation across the KD Solution IT platform.

---

## 1. Compliance Scope: PCI-DSS Self-Assessment Questionnaire A (SAQ A)

The KD Solution IT platform is strictly architected and maintained within the scope of **PCI-DSS SAQ A**:
- **Zero Card Data on Platform Servers**: Raw Primary Account Numbers (PANs), Card Verification Values (CVVs/CVCs), and expiration dates never touch, transmit through, or reside on platform servers, memory caches, or databases.
- **Client-Side Iframe Isolation**: Card entry fields are completely hosted within out-of-origin iframes provided by Level 1 PCI-DSS compliant payment service providers:
  - **NMI Collect.js**: Hosted fields hosted directly on `https://secure.nmi.com/`
  - **Stripe Elements**: Hosted fields hosted directly on `https://js.stripe.com/`
  - **Rainforest Embedded Components**: Hosted on `https://sandbox.rainforestpay.com/` / `https://api.rainforestpay.com/`
  - **Airwallex Embedded Fields**: Hosted on `https://demo.airwallex.com/` / `https://api.airwallex.com/`
- **One-Time Tokenization**: Platform client forms receive solely ephemeral, single-use, non-reversible tokens (e.g. `tok_xxx` or `pm_xxx`).

---

## 2. Technical Safeguards & Implementation Measures

### A. Automated Codebase AST Scanner (`scripts/scan-pan-leakage.ts`)
To prevent accidental introduction of native HTML input elements capturing card details:
1. Continuous integration executes `tsx scripts/scan-pan-leakage.ts`.
2. Scans all TypeScript, TSX, JSX, and HTML files across `app/`, `components/`, and `lib/`.
3. Forbids any native `<input>` elements bearing names or IDs such as `cardNumber`, `card_number`, `pan`, `cvv`, `cvc`, or `expiry`.
4. Build fails immediately if any violation is detected.

### B. Strict Content Security Policy (CSP) Headers (`middleware.ts`)
Edge middleware automatically injects restrictive CSP headers:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://secure.nmi.com https://js.stripe.com; frame-src 'self' https://secure.nmi.com https://js.stripe.com https://hooks.stripe.com https://sandbox.rainforestpay.com https://api.rainforestpay.com https://demo.airwallex.com https://api.airwallex.com; connect-src 'self' https://secure.nmi.com https://api.stripe.com https://sandbox.rainforestpay.com https://api.rainforestpay.com https://api-demo.airwallex.com https://api.airwallex.com https://api.sandbox.payoneer.com https://api.payoneer.com;
```
This physically prevents malicious scripts from loading unapproved iframe origins or exfiltrating data outside authorized payment gateways.

### C. Server-Side Inbound Payload Scanner (`lib/security/pan-detector.ts`)
1. All incoming API payloads are inspected against regex patterns matching 13–19 consecutive numeric characters.
2. Candidate sequences are validated using the Luhn checksum algorithm (`isLuhnValid`).
3. If a valid PAN pattern is identified, the system raises an immediate security warning and rejects the payload to prevent accidental CDE scope contamination.

---

## 3. Incident Response & Scope Breach Protocol

If a raw PAN is detected by the server-side scanner or audit monitoring:
1. **Immediate Ingestion Block**: The request is aborted with HTTP 400 without persisting to any database or log file.
2. **Log Redaction**: Security logs record only the last 4 digits (e.g. `•••• 1234`) and timestamp. Raw numbers are never written to disk.
3. **Security Team Alert**: An alert is dispatched to the Platform Compliance Officer and Super Admin for immediate investigation.
