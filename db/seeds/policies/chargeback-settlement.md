<!-- path: db/seeds/policies/chargeback-settlement.md -->

# KD Solution IT Chargeback, Dispute, Refund & Settlement Policy

**Document Classification:** Mandatory Settlement Terms, Dispute Management & Risk Reserve Standard  
**Effective Date:** November 1, 2026  
**Governing Frameworks:** Visa Dispute Management Rules, Mastercard Dispute Resolution Rules, Visa Fraud & Dispute Monitoring Program (VDMP/VFMP), Mastercard Excessive Chargeback Program (ECP)  
**Policy Version:** 1.0  

---

## 1. Settlement Horizons, Rolling Reserves & Fiduciary Custody
All merchant processing settlements are processed through fiduciary segregated custodial accounts in accordance with platform liquidity standards.

1. **Mandatory Risk-Tiered Rolling Reserves:**
   - **Risk Tier 1 (High Risk / Extended Fulfillment):** Mandatory ten percent (10.00%) rolling reserve deducted from gross sales, held for ninety (90) calendar days from transaction date.
   - **Risk Tier 2 (Medium Risk / Standard E-commerce):** Mandatory five percent (5.00%) rolling reserve, held for sixty (60) calendar days.
   - **Risk Tier 3 (Low Risk / Immediate Digital Delivery):** Zero percent (0.00%) base reserve, subject to dynamic liquidity buffers if monthly velocity spikes occur.
2. **Settlement Holding Periods:**
   - Standard payout settlement schedules operate on a T+2 or T+3 business day rolling cycle. Newly activated merchants are subject to a mandatory seven (7) day initial payout settlement hold to allow preliminary dispute and chargeback seasoning.
3. **Fiduciary Reserve Segregation:**
   - All held rolling reserves remain the legal property of the merchant held in trust to offset future chargebacks, network fines, customer refunds, and platform fee liabilities. Reserves are automatically released to available merchant balance upon expiration of the holding term.

---

## 2. Dispute Evidence Submission SLAs & Response Mandates
When a consumer cardholder initiates a formal chargeback or inquiry through their issuing bank:

1. **Merchant Evidence Deadline (24-Hour SLA):**
   - The merchant must upload a complete, substantiated Evidence Pack (proof of delivery, signed delivery receipt, customer IP address, communications history, and terms acceptance) through the Merchant Portal within twenty-four (24) hours of dispute notification.
2. **Network Final Cut-Off (48 Hours):**
   - KD Solution IT compiles and transmits the representment package to acquiring bank sponsor and card brand networks within forty-eight (48) hours. Failure by the merchant to provide evidence within 24 hours forfeits the right of representment and results in immediate automated concession of the dispute.
3. **Compelling Evidence Standards:**
   - Evidence submissions must comply with Visa Compelling Evidence 3.0 (CE 3.0) and Mastercard Pre-Dispute Collaboration requirements, including prior undisputed transaction history on the same payment credential.

---

## 3. Dispute Fees, Fee Non-Refundability & Negative Balance Sweep
1. **Chargeback Assessment Fee:**
   - A non-refundable dispute fee of twenty-five dollars ($25.00 USD) is assessed for every chargeback filed against the merchant account, regardless of whether the merchant ultimately prevails in representment or arbitration.
2. **Platform Processing Fee Non-Refundability:**
   - In the event of a customer refund (full or partial) or chargeback reversal, original merchant interchange, network assessments, and platform gateway processing fees are non-refundable.
3. **Negative Balance Recovery & Fiduciary Indemnity:**
   - In the event chargebacks, refunds, and fees exceed available processing balances, the resulting negative balance becomes immediately due and payable. KD Solution IT maintains the legal right to execute automated ACH debit sweeps against the merchant's linked commercial settlement bank account or liquidate held rolling reserves.

---

## 4. Card Brand Chargeback Monitoring Programs & Early Warning Gates
KD Solution IT enforces strict chargeback ratio controls to protect platform sponsor BIN integrity and avoid card network sanction programs.

1. **Calculation Methodology:**
   - Chargeback Ratio = `(Total Chargeback Count in Calendar Month) / (Total Sales Transaction Count in Calendar Month)`
2. **Early Warning Threshold (> 0.30%):**
   - When a merchant's monthly chargeback ratio exceeds zero point three zero percent (0.30%), the platform issues an automated Early Warning Notice. The merchant must submit an action plan to reduce disputes within ten (10) business days, and rolling reserves may be increased.
3. **Card Network Critical Violation (> 0.90%):**
   - Merchants exceeding zero point nine zero percent (0.90%) or 100 disputes per month violate Visa VDMP and Mastercard ECP thresholds. Such merchants face immediate gateway processing restrictions, potential card brand penalty pass-throughs (up to $50 per dispute), and potential account termination with MATCH/TMF listing.
