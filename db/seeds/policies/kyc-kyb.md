<!-- path: db/seeds/policies/kyc-kyb.md -->

# KD Solution IT Customer & Merchant Due Diligence (KYC/KYB) Policy

**Document Classification:** Regulatory Legal Disclosure & Merchant Operating Policy  
**Effective Date:** November 1, 2026  
**Governing Standard:** FinCEN MSB Regulations (31 CFR Part 1022), EU AMLD5/AMLD6, and Card Brand Underwriting Mandates  
**Policy Version:** 1.0  

---

## 1. Regulatory Purpose and Objective
KD Solution IT operates as a secure multi-processor payment orchestration and merchant aggregation platform. In compliance with the Bank Secrecy Act (BSA), USA PATRIOT Act, FinCEN Customer Due Diligence (CDD) final rule, EU 5th and 6th Anti-Money Laundering Directives, and payment card brand (Visa, Mastercard, American Express) operating regulations, KD Solution IT enforces rigorous Know Your Customer (KYC) and Know Your Business (KYB) procedures before any merchant account may process charges or receive settlement payouts.

---

## 2. Know Your Business (KYB) Entity Requirements
Every corporate applicant, LLC, partnership, or registered sole proprietorship must provide authoritative proof of legal existence:
1. **Government Business Registration:** Articles of Incorporation, Certificate of Organization, or government registry extract issued within the preceding 12 months.
2. **Tax Identification Number:** Official IRS Letter 147C, Form CP 575 (for US entities), or registered national VAT/GST document (for European and international entities).
3. **Physical Operating Address Verification:** Active commercial lease agreement or utility invoice (telecom, electric, water) dated within 90 days. Virtual PO Boxes or mail-forwarding drop services are strictly prohibited without physical operating nexus.
4. **Active Commercial Bank Account:** Voided company check or formal bank verification letter confirming business account ownership matching the legal entity name exactly.

---

## 3. Know Your Customer (KYC) & Ultimate Beneficial Owner (UBO) Identification
In accordance with FinCEN CDD 31 CFR § 1010.230:
1. **Ownership Prongs (>= 25% Equity):** Every individual who owns, directly or indirectly, twenty-five percent (25%) or more of the equity interests of the legal entity merchant must be fully identified.
2. **Control Prong:** At least one natural person with significant responsibility to control, manage, or direct the legal entity (e.g., Chief Executive Officer, Chief Financial Officer, Managing Partner).
3. **Mandatory Identity Documentation:**
   - Unexpired government-issued photo ID (Passport, National Identity Card, or Driver's License).
   - Biometric selfie liveness challenge verified through automated anti-spoofing algorithms.
   - Residential proof of address (utility bill or bank statement within 90 days).
   - Date of birth and national identifier (SSN, ITIN, or National Identity Number).

---

## 4. Sanctions & Politically Exposed Persons (PEP) Screening
1. **Automated Cross-Referencing:** Every merchant entity, director, and UBO is screened prior to onboarding and continuously re-screened on a 24-hour cycle against:
   - OFAC Specially Designated Nationals (SDN) and Blocked Persons list.
   - United Nations Security Council Consolidated Sanctions List.
   - European Union Consolidated Financial Sanctions list.
   - UK HM Treasury Sanctions List.
   - Global PEP databases covering high-risk public figures and their immediate family members.
2. **Zero Tolerance Sanctions Freeze:** Any confirmed match to an active sanctions program triggers an immediate, unalterable block on account capability activation, payout disbursement, and payment acceptance.

---

## 5. Review Timelines and Underwriting Gating
1. **Standard Review Window:** Complete applications submitted with valid documentation are evaluated within 1 to 2 business days by the KD Solution IT Compliance & KYC team.
2. **Capability Activation Gates:**
   - **Stage 1 (Pending Verification):** Portal access enabled; API credentials in Sandbox Mode only.
   - **Stage 2 (Approved & Activated):** Live gateway processing activated; daily settlement schedule initiated.
   - **Stage 3 (Conditional / Rolling Reserve):** High-risk merchants (Risk Tier 3) activated subject to rolling reserve and fulfillment tracking gates.
3. **Annual Periodic Refresh:** Tier 1 and Tier 2 merchants undergo mandatory annual document re-certification; Tier 3 merchants are re-evaluated semi-annually.

---

## 6. Digital Record Retention & Audit Immutability
All collected KYC/KYB identity files and proof of address records are stored encrypted at rest using AES-256-GCM envelope encryption. Audit logs tracking every verification decision, approval, and rejection are cryptographically sealed in Ed25519 hash-chained append-only ledgers and retained for a minimum of five (5) years following merchant account termination.
