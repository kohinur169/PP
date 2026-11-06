<!-- path: db/seeds/policies/aml-cft.md -->

# KD Solution IT Anti-Money Laundering (AML) & Counter-Terrorist Financing (CFT) Policy

**Document Classification:** Mandatory Regulatory Compliance Policy & Transaction Monitoring Standard  
**Effective Date:** November 1, 2026  
**Governing Regulations:** FinCEN Bank Secrecy Act (31 U.S.C. § 5311 et seq., 31 CFR Chapter X), USA PATRIOT Act (§ 352), FATF 40 Recommendations (Recs 10, 16, 20), and EU Directive 2018/1673 (AMLD6)  
**Policy Version:** 1.0  

---

## 1. Policy Statement, Governance & Independent Compliance Officer
KD Solution IT operates a zero-tolerance compliance posture regarding money laundering, terrorist financing, proliferation financing, fraud, and illicit fund transmission. 

1. **Independent Compliance Function:** The platform designates an independent Anti-Money Laundering Compliance Officer (AMLCO) holding certified credentials (CAMS, CRCM) who reports directly to the Chief Executive Officer and the Board of Directors. The AMLCO maintains uninhibited authority to freeze suspicious merchant accounts, terminate processing agreements, and submit mandatory regulatory disclosures.
2. **Annual Independent Audit:** KD Solution IT's AML/CFT program is subject to an annual independent third-party audit reviewing risk models, suspicious activity detection rates, rule thresholds, and regulatory reporting fidelity.
3. **Enterprise Risk Assessment:** Merchant underwriting and continuous transaction monitoring are calibrated across platform risk tiers (Tier 1: Low Risk, Tier 2: Medium Risk, Tier 3: High Risk) with dynamic velocity and ticket caps.

---

## 2. Automated Real-Time Transaction Monitoring & Velocity Limits
All transactions traversing the KD Solution IT processing gateway are inspected by an automated real-time heuristic and machine-learning risk engine prior to authorization and settlement.

1. **Velocity and Spike Thresholds:**
   - Sudden volume surges exceeding 300% of declared underwriting monthly volume trigger automated transaction holds.
   - Rapid-fire card authorizations (e.g. > 5 attempts within 60 seconds from identical IP or device fingerprint) indicate card testing or bot attacks and result in immediate gateway rate-limiting.
2. **Geographic & Routing Inconsistencies:**
   - High-velocity transactions originating from sanctioned or high-risk jurisdictions (FATF Blacklist/Greylist).
   - Inconsistencies between issuing bank country, device IP geolocation, and merchant declared fulfillment nexus.
3. **Dormancy Reactivation:**
   - Accounts inactive for sixty (60) or more days that suddenly process high-ticket or high-velocity sales are subjected to automated settlement hold pending merchant re-verification.

---

## 3. Comprehensive Red Flag Behavior Catalog
Merchants are strictly prohibited from engaging in, facilitating, or turning a blind eye to the following categorized money laundering typologies:

1. **Transaction Structuring & Smurfing:**
   - Systematically splitting transactions into sub-$10,000 or sub-$3,000 amounts specifically designed to evade mandatory Bank Secrecy Act reporting thresholds.
2. **Round-Tripping & Self-Transactions:**
   - Merchants processing credit card payments to themselves or associated legal entities using personal or related-party cards to simulate commercial activity or generate liquidity.
3. **Unlicensed Money Transmission & Cash Equivalents:**
   - Utilizing e-commerce checkout flows to facilitate peer-to-peer remittances, check cashing, prepaid card loading, cryptocurrency purchase arbitrage, or cash-back withdrawals without appropriate federal MSB and state money transmitter licensing.
4. **Mismatch Between Processing Volume and Physical Inventory:**
   - Merchant processing high volumes of luxury or physical goods without verifiable supplier invoices, drop-shipping agreements, or physical logistics capacity.
5. **Abnormal Refund & Reversal Patterns:**
   - Processing charges followed by requests for refunds to alternative payment methods (e.g. charge credit card, refund via wire or crypto), a textbook money laundering extraction typology.

---

## 4. Suspicious Activity Reporting (SAR) & Anti-Tipping-Off Protocol
1. **Mandatory SAR Filing:**
   - Where KD Solution IT identifies, suspects, or has reason to suspect that a transaction involves funds derived from illegal activity, is conducted to evade BSA regulations, or serves no apparent commercial purpose, a Suspicious Activity Report (FinCEN Form 111 / regional equivalent) is filed within thirty (30) calendar days.
2. **Strict Prohibition Against Tipping Off:**
   - In accordance with 31 U.S.C. § 5318(g)(2), KD Solution IT, its officers, employees, and agents are strictly prohibited under federal criminal penalty from notifying any merchant, customer, or third party that a SAR has been filed or that an account is under anti-money laundering investigation.
3. **Law Enforcement Cooperation:**
   - KD Solution IT cooperates fully with FinCEN, federal law enforcement, the Joint Chiefs of Global Tax Enforcement (J5), and international financial intelligence units (FIUs).

---

## 5. Record Retention, Merchant Attestation & Sanctions
1. **5-Year Record Retention Mandate:**
   - Complete transaction records, cardholder metadata, IP logs, customer dispute histories, and underwriting KYC/KYB dossiers are immutably archived for a minimum of five (5) years following the termination of the merchant relationship.
2. **Mandatory Underwriting Acknowledgment:**
   - Every merchant applicant must formally accept and bind their organization to this AML/CFT Policy as a mandatory precondition to gateway credential generation and payout enablement.
3. **Enforcement & Termination:**
   - Willful violations of this policy result in immediate account termination, perpetual placement on the MATCH / TMF (Terminated Merchant File) blacklist, forfeiture of held reserves where mandated by court order, and referral for criminal prosecution.
