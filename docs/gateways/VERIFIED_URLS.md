<!-- path: docs/gateways/VERIFIED_URLS.md -->

# KD Solution IT: Verified Payment Gateway Documentation & Sandbox Portal Registry

This registry records the official, authoritative developer documentation URLs, API endpoints, sandbox testing portals, and webhook specification resources for all five payment processor adapters integrated into the KD Solution IT platform.

---

## 1. Network Merchants Inc. (NMI)
- **Primary Developer Portal**: [https://docs.nmi.com/](https://docs.nmi.com/)
- **Direct Post API Specification**: [https://docs.nmi.com/apis/direct-post/](https://docs.nmi.com/apis/direct-post/)
- **Collect.js Hosted Tokenization Script**:
  - Production & Sandbox: `https://secure.nmi.com/token/Collect.js`
  - Integration Guide: [https://docs.nmi.com/merchants/collectjs/](https://docs.nmi.com/merchants/collectjs/)
- **Sandbox Testing Portal**: [https://secure.nmi.com/](https://secure.nmi.com/)
- **Direct Post Gateway Endpoint**:
  - Sandbox & Live: `https://secure.nmi.com/api/transact.php`
- **Supported Payment Features**:
  - Dual-action Auth & Capture (`type=auth`, `type=capture`)
  - Direct Sale (`type=sale`)
  - Customer Vault (`customer_vault=add_customer`)
  - Partial & Full Refunds (`type=refund`)
  - Webhook Notification Endpoint: `POST /api/webhooks/payment/nmi`

---

## 2. Stripe Connect
- **Primary Developer Portal**: [https://docs.stripe.com/](https://docs.stripe.com/)
- **Stripe Connect Documentation**: [https://docs.stripe.com/connect](https://docs.stripe.com/connect)
- **Custom & Express Connected Accounts**: [https://docs.stripe.com/connect/accounts](https://docs.stripe.com/connect/accounts)
- **PaymentIntents Destination Charges**: [https://docs.stripe.com/connect/destination-charges](https://docs.stripe.com/connect/destination-charges)
- **Sandbox Testing Portal**: [https://dashboard.stripe.com/test](https://dashboard.stripe.com/test)
- **Stripe CLI Webhook Forwarding Tool**:
  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/payment/stripe
  ```
- **Supported Payment Features**:
  - PaymentIntents API with automatic 3DS / SCA
  - Application Fees (`application_fee_amount`)
  - Transfer reversals and merchant refunds
  - Standard (T+2) and Instant Payouts

---

## 3. Rainforest Payments
- **Primary Developer Portal**: [https://docs.rainforestpay.com/](https://docs.rainforestpay.com/)
- **SaaS / Embedded PayFac Architecture**: [https://docs.rainforestpay.com/docs/embedded-components](https://docs.rainforestpay.com/docs/embedded-components)
- **Merchant Onboarding & KYB Flow**: [https://docs.rainforestpay.com/docs/merchant-onboarding](https://docs.rainforestpay.com/docs/merchant-onboarding)
- **Sandbox Testing Portal**: [https://sandbox.rainforestpay.com/](https://sandbox.rainforestpay.com/)
- **API Base URLs**:
  - Sandbox: `https://sandbox.rainforestpay.com/v1/`
  - Production: `https://api.rainforestpay.com/v1/`
- **Webhooks & Cryptographic Signature Verification**:
  - HMAC-SHA256 with `x-rainforest-signature` header
  - Webhook Notification Endpoint: `POST /api/webhooks/payment/rainforest`

---

## 4. Airwallex
- **Primary Developer Portal**: [https://www.airwallex.com/docs/](https://www.airwallex.com/docs/)
- **Global Acquiring & Embedded Checkout**: [https://www.airwallex.com/docs/payments](https://www.airwallex.com/docs/payments)
- **Global Payouts & Multi-Currency Settlement**: [https://www.airwallex.com/docs/payouts](https://www.airwallex.com/docs/payouts)
- **Sandbox Testing Portal**: [https://demo.airwallex.com/](https://demo.airwallex.com/)
- **API Base URLs**:
  - Sandbox: `https://api-demo.airwallex.com/api/v1/`
  - Production: `https://api.airwallex.com/api/v1/`
- **Supported Payment Features**:
  - PaymentIntents API with 3DSv2 challenge
  - Dynamic currency conversion with guaranteed USD numeric(18,4) settlement
  - Automated local bank transfers across 130+ jurisdictions

---

## 5. Payoneer
- **Primary Developer Portal**: [https://developer.payoneer.com/](https://developer.payoneer.com/)
- **Mass Payouts API Specification**: [https://developer.payoneer.com/docs/mass-payouts/](https://developer.payoneer.com/docs/mass-payouts/)
- **Payee Onboarding & Status Synchronization**: [https://developer.payoneer.com/docs/payee-onboarding/](https://developer.payoneer.com/docs/payee-onboarding/)
- **Sandbox Testing Portal**: [https://login.sandbox.payoneer.com/](https://login.sandbox.payoneer.com/)
- **API Base URLs**:
  - Sandbox: `https://api.sandbox.payoneer.com/v2/programs/`
  - Production: `https://api.payoneer.com/v2/programs/`
- **Webhooks & IPN Verification**:
  - HMAC-SHA256 signature and program bearer verification tokens
  - Webhook Notification Endpoint: `POST /api/webhooks/payment/payoneer`

---

## Architectural Guarantees & Scope Isolation
1. **USD Numeric(18,4) Exclusivity**: Regardless of regional gateway currencies, all transactions settle into platform balances in USD numeric(18,4).
2. **PCI-DSS SAQ A Invariant**: Cardholder Data Environment (CDE) isolation is strictly enforced. Card numbers, CVVs, and expiry dates are handled exclusively by NMI Collect.js and Stripe Elements hosted iframes.
3. **Fail-Closed Routing**: Transactions without an exact matching routing rule in `payment_routing_rules` are rejected per Step 123 fail-closed security policy.
