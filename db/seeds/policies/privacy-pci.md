<!-- path: db/seeds/policies/privacy-pci.md -->

# KD Solution IT Data Privacy (GDPR, CCPA) & PCI-DSS Level 1 Compliance Policy

**Document Classification:** Mandatory Global Data Privacy & Cardholder Security Standard  
**Effective Date:** November 1, 2026  
**Governing Regulations:** European Union GDPR (Regulation EU 2016/679), California Consumer Privacy Act as amended by CPRA (Cal. Civ. Code § 1798.100 et seq.), UK Data Protection Act, and PCI-DSS v4.0 (SAQ A Scope)  
**Policy Version:** 1.0  

---

## 1. Absolute PCI-DSS SAQ A Scope & Zero Cardholder Data Retention
KD Solution IT enforces strict physical, logical, and architectural isolation of payment cardholder data.

1. **SAQ A Compliance Posture:**
   - Under the Payment Card Industry Data Security Standard (PCI-DSS v4.0), KD Solution IT operates exclusively under the **Self-Assessment Questionnaire A (SAQ A)** validation framework.
2. **Provider-Hosted Fields Isolation:**
   - All primary account numbers (PAN), expiration dates, and card verification values (CVV/CVC/CID) are entered exclusively by consumers into payment gateway provider-hosted tokenization iframes (e.g. NMI Collect.js, Stripe Elements, Rainforest Secure Fields, and Airwallex Hosted Fields).
3. **Zero Card Data Ingestion:**
   - Cardholder data never touches, traverses, or resides on KD Solution IT web servers, API endpoints, application memory, log files, or database storage.
   - Only non-PCI, cryptographically secure surrogate tokens (e.g. `tok_xxx`), masked card representations (e.g. `**** **** **** 1234`), card brand labels, and expiry dates are stored for order reconciliation and recurring billing schedules.

---

## 2. Cryptographic Security & Pre-Upload File Encryption (AES-256-GCM)
All non-card sensitive merchant dossiers, government identification passports, beneficial ownership records, and bank statements are protected by military-grade cryptographic controls.

1. **Pre-Upload Envelope Encryption:**
   - Sensitive identity files are encrypted prior to object storage ingestion using **AES-256-GCM** authenticated symmetric encryption.
   - Each file utilizes a unique 96-bit cryptographic Initialization Vector (IV) and generates an immutable 128-bit authentication tag to guarantee confidentiality and prevent post-storage tampering.
2. **Key Hierarchy & Domain Separation:**
   - Storage encryption keys are derived through isolated domain separation (HMAC-based Key Derivation / HKDF) and managed via secure hardware security modules (HSM) with scheduled annual key rotation.
3. **Data in Transit:**
   - All external and internal communications enforce TLS 1.3 encryption with strict forward secrecy and HTTP Strict Transport Security (HSTS).

---

## 3. Global Privacy Regimes (GDPR & CCPA/CPRA Compliance)
KD Solution IT complies with the European Union General Data Protection Regulation (GDPR), UK GDPR, and the California Consumer Privacy Act (CCPA/CPRA).

1. **Legal Bases for Processing:**
   - Platform processing of merchant and consumer data is conducted under GDPR Article 6(1)(b) (performance of a contract), Article 6(1)(c) (statutory compliance with AML/BSA/tax mandates), and Article 6(1)(f) (legitimate interest in fraud detection and payment security).
2. **Data Subject Rights (DSR):**
   - Natural persons maintain the right to request access to personal data, rectification of inaccurate records, data portability, and restriction of unlawful processing.
3. **Right to Erasure ("Right to be Forgotten") & Statutory Retentions:**
   - While data subjects may request account deletion, GDPR Article 17(3)(b) explicitly exempts controllers where retention is necessary for compliance with a legal obligation.
   - Financial ledger entries, tax filings, transaction logs, and KYC/KYB underwriting dossiers are subject to a **mandatory seven (7) year statutory retention period** under federal tax law, Bank Secrecy Act rules, and anti-money laundering mandates. Erasure requests cannot extinguish these compulsory financial compliance records.

---

## 4. Data Subject Request (DSR) Protocol & Contact Disclosures
1. **DSR Submission Procedure:**
   - Data subjects and merchants may submit formal privacy inquiries or DSR requests by emailing our designated Data Protection Officer at `privacy.officer@kdsolution.it`.
2. **Verification & Response SLA:**
   - KD Solution IT validates the identity of the requesting party using multi-factor identity challenges and responds with a full determination within thirty (30) calendar days.
3. **Independent Supervisory Authority:**
   - Data subjects within the European Union have the right to lodge a complaint with their national Data Protection Authority (DPA) or the California Privacy Protection Agency (CPPA).
