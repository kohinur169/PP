<!-- path: db/seeds/policies/sanctions-pep.md -->

# KD Solution IT Sanctions (OFAC / UN / EU / UK HMT) & Politically Exposed Persons (PEP) Screening Policy

**Document Classification:** Mandatory Global Sanctions Compliance Policy & PEP Enhanced Due Diligence Standard  
**Effective Date:** November 1, 2026  
**Governing Authorities:** US Department of the Treasury (OFAC), UN Security Council, European Commission (EEAS), UK HM Treasury (OFSI), and FATF Recommendations 6 & 12  
**Policy Version:** 1.0  

---

## 1. Global Sanctions Framework & Mandatory Scope
KD Solution IT enforces strict, comprehensive, and continuous compliance with international economic and trade sanctions. As a global payment facilitator, the platform is legally bound to prevent sanctioned natural persons, entities, vessels, and jurisdictions from accessing financial processing services.

1. **Covered Global Sanctions Lists:**
   - **United States:** OFAC Specially Designated Nationals (SDN) and Blocked Persons List, Foreign Sanctions Evaders (FSE), Sectoral Sanctions Identifications (SSI), and Non-SDN Consolidated Sanctions Lists (31 CFR Parts 500-599).
   - **United Nations:** United Nations Security Council Consolidated Sanctions List enacted pursuant to Chapter VII of the UN Charter.
   - **European Union:** European Union Consolidated Financial Sanctions List maintained by the European External Action Service (EEAS).
   - **United Kingdom:** UK HM Treasury Office of Financial Sanctions Implementation (OFSI) Consolidated List of Asset Freeze Targets.
2. **Comprehensive Embargoed Jurisdictions:**
   - Complete processing prohibition on any transaction, entity, or individual located in or operating from comprehensively sanctioned territories: Cuba, Iran, North Korea, Syria, Russia, and the occupied regions of Ukraine (Crimea, Donetsk, Luhansk, Kherson, and Zaporizhzhia).

---

## 2. Daily Automated Screening & Continuous Monitoring
1. **Onboarding Screening Gate:** Every merchant legal entity, registered trade name (DBA), director, control person, and declared Ultimate Beneficial Owner (UBO ≥ 25%) is screened against all international watchlists prior to account activation.
2. **Daily Batch Delta Screening:** The platform executes automated daily delta re-screening of all active merchants and associated beneficial owners against updated watchlist manifests published by OFAC, UN, EU, and UK authorities.
3. **Transaction-Level Real-Time Screening:** Consumer billing names, corporate buyers, and payout recipient banking details are screened in real time against automated watchlist heuristics.

---

## 3. Politically Exposed Persons (PEP) & Enhanced Due Diligence (EDD)
In accordance with Financial Action Task Force (FATF) Recommendation 12 and international AML directives:

1. **PEP Definition:** A Politically Exposed Person is an individual who is or has been entrusted with prominent public functions, including:
   - **Tier 1 PEPs:** Heads of State, Heads of Government, Senior Politicians, Cabinet Ministers, and Ambassadors.
   - **Tier 2 PEPs:** Senior Judicial Officers, High-Ranking Military Command, Senior Executives of State-Owned Enterprises (SOEs), and Central Bank Governors.
   - **Tier 3 PEPs:** Senior Officials of International Organizations (UN, IMF, World Bank, WTO).
   - **Relatives & Close Associates (RCAs):** Spouses, registered domestic partners, parents, siblings, children, and known close commercial associates of any individual qualifying as a PEP.
2. **Mandatory Enhanced Due Diligence (EDD):**
   - PEP status does not constitute an automatic bar to processing; however, any merchant having a PEP as a director or beneficial owner requires formal senior executive sign-off by the Chief Compliance Officer and Chief Executive Officer.
   - Mandatory verification of Source of Wealth (SoW) and Source of Funds (SoF).
   - Ongoing monthly compliance review and tightened velocity limits.

---

## 4. Confirmed Positive Match: Immediate Account Freeze & Fund Blocking
1. **Automated Gateway Freeze:** Upon confirmation of an active, true-positive match against an OFAC, UN, EU, or UK asset freeze list:
   - The merchant gateway credentials and API keys are revoked with zero grace period.
   - All pending transaction authorizations, batch captures, and outgoing payout transfers are blocked immediately.
2. **Fiduciary Fund Segregation & Escrow:**
   - Blocked merchant funds are placed into a segregated, blocked fiduciary holding account in full compliance with 31 CFR § 501.201.
   - No funds may be returned to the merchant, offset against fees, or transferred without express licensing authorization from the relevant sanctions authority (e.g. OFAC Specific License).
3. **Regulatory Disclosure Mandate:**
   - Confirmed sanctions matches and blocked assets are reported to OFAC within ten (10) business days via the OFAC Sanctions Reporting Portal, and to relevant national authorities in the EU and UK.

---

## 5. False Positive Disambiguation Protocol & Merchant Appeals
KD Solution IT recognizes that common phonetic naming conventions, transliterations, and broad geographic aliases can produce false positive screening hits.

1. **Merchant Disambiguation Rights:** Any merchant or beneficial owner flagged for a potential sanctions match is entitled to submit an identity disambiguation package to the Compliance Officer.
2. **Required Disambiguation Documentation:**
   - Certified copy of unexpired government passport showing full legal name, date of birth, and place of birth.
   - Certified proof of residential address issued within ninety (90) days.
   - Proof of nationality and secondary national identification (tax ID, citizenship certificate).
3. **Disambiguation Review SLA:**
   - The Compliance Department reviews disambiguation dossiers within two (2) business days. Where evidence confirms identity differentiation (e.g. distinct date of birth, distinct nationality, or different national ID), the alert is officially cleared as a verified False Positive and logged in the immutable audit ledger.
   - Where identity ambiguity persists, the Compliance Officer refers the dossier to legal counsel and appropriate government helplines (e.g. OFAC Compliance Hotline).
