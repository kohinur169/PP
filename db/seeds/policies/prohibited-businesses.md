<!-- path: db/seeds/policies/prohibited-businesses.md -->

# KD Solution IT Underwriting, Merchant Acceptance & Prohibited/Restricted Businesses Policy

**Document Classification:** Mandatory Merchant Acceptance Standard & Industry Classification Policy  
**Effective Date:** November 1, 2026  
**Governing Frameworks:** Visa Core Rules & Product and Service Rules, Mastercard Rules, Card Network High-Risk Programs (VFMP, ECP, BRAM), and FinCEN MSB Guidelines  
**Policy Version:** 1.0  

---

## 1. Underwriting Philosophy & Merchant Acceptance Standard
KD Solution IT operates as a registered Payment Facilitator (PayFac) partnering with acquiring banks and card networks. To safeguard platform liquidity, protect consumer cardholders, and comply with acquiring bank sponsor mandates, every applicant undergoes comprehensive merchant underwriting prior to gateway provisioning.

Merchants are categorized into three distinct operational domains:
1. **Unrestricted / Standard Commercial Categories:** Traditional e-commerce, software-as-a-service (SaaS), professional services, digital goods, and verified retail merchandising.
2. **Restricted High-Risk Categories:** Regulated business models requiring elevated underwriting, executive approval, enhanced rolling reserves, and Tier 1 or Tier 3 processing caps.
3. **Strictly Prohibited Categories:** Business models, goods, services, and transaction types that KD Solution IT will not support under any circumstances.

---

## 2. Strictly Prohibited Business Models & MCC Catalog
The following business activities and associated Merchant Category Codes (MCC) are strictly barred from onboarding, processing, or gateway connectivity:

| Prohibited Category | Prohibited MCC Codes | Regulatory & Brand Rationale |
| :--- | :--- | :--- |
| **Weapons, Firearms & Ammunition** | `5999` (Specialty), `7999` | Regulated arms trafficking, federal licensing barriers, safety liability. |
| **Illegal Drugs, Paraphernalia & Illicit Substances** | `5912` (Unlicensed), `5122` | Schedule I/II controlled substances, synthetic narcotics, federal illegality. |
| **Adult Content & Pornographic Services** | `5967`, `7273`, `7841` | Mastercard BRAM & Visa adult content monitoring, reputational risk. |
| **Unlicensed Gambling, Sports Betting & Lotteries** | `7995`, `7801`, `7802` | Unlawful Internet Gambling Enforcement Act (UIGEA) and state licensing bans. |
| **Unregulated Crypto Mixers & Binary Options** | `6051`, `6211` | FinCEN money transmission violations, unregistered speculative securities. |
| **Multi-Level Marketing (MLM) & Pyramid Schemes** | `5968` (Direct Marketing) | Deceptive marketing practices, FTC enforcement, extreme chargeback ratios. |
| **Counterfeit Merchandise & Copyright Infringement** | `5999`, `5699` | Trademark counterfeiting, intellectual property theft, brand termination. |
| **Deceptive Negative Option & Hidden Subscriptions** | `5968`, `5969` | Unfair or Deceptive Acts or Practices (UDAP), FTC Restore Online Shoppers' Confidence Act. |

---

## 3. Restricted Business Categories Requiring Enhanced Underwriting
Merchants operating in the following commercial sectors may be approved on a selective basis subject to Enhanced Due Diligence (EDD), required state/federal licensing, and mandatory risk mitigation reserves:

1. **Licensed Telemedicine & Online Pharmacy (MCC 5122 / 5912):**
   - Requires verified NABP (National Association of Boards of Pharmacy) accreditation and state pharmacy licenses.
   - Mandatory 10% rolling reserve held for ninety (90) days.
2. **Nutraceuticals, Ingestible Supplements & Cosmetics (MCC 5499 / 5999):**
   - Must provide complete product ingredient dossiers, FDA cGMP compliance certificates, and clean chargeback history.
3. **Travel Agencies, Tour Operators & Timeshares (MCC 4722 / 7011):**
   - Due to extended fulfillment horizons (travel booked months in advance), requires proof of bonding, seller of travel registration, and tiered settlement holds.
4. **Regulated Debt Collection Agencies (MCC 7322):**
   - Requires state debt collection licensing and third-party consumer protection compliance audits.

---

## 4. Automated Onboarding Gating & Misclassification Penalties
1. **Automated Submission Interception:**
   - The platform onboarding engine validates merchant MCC selections against the automated compliance catalog. Any submission selecting a prohibited MCC is halted instantly with an automated rejection notice.
2. **Prohibition on MCC Misclassification:**
   - Attempting to circumvent underwriting rules by misrepresenting business activities (e.g. classifying online gambling as digital consulting or adult content as web development) constitutes bank fraud under 18 U.S.C. § 1344.
3. **Penalties for Deceptive Onboarding:**
   - Immediate gateway termination with zero notice.
   - Forfeiture of all processing proceeds to the card network indemnity escrow fund.
   - Immediate reporting to the card brand MATCH / TMF (Terminated Merchant File) system.
   - Pass-through of all card brand non-compliance fines (minimum $25,000 per violation).
