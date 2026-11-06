<!-- path: docs/gateways/TEST_CARDS.md -->

# Payment Gateway Test Cards & Sandbox Error Simulation Catalog

This reference catalog provides verified test card credentials, CVVs, expiration dates, and error simulation triggers for testing across all platform gateway adapters (NMI, Stripe Connect, Rainforest, Airwallex, and Payoneer).

---

## 1. Universal Successful Test Cards

| Brand | Card Number | Expiry Date | CVV | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **Visa** | `4000 0000 0000 0002` | Any future date (e.g. `12/28`) | `123` | Approved (Charge captured) |
| **Visa (Alternative)** | `4242 4242 4242 4242` | Any future date | `123` | Approved (Charge captured) |
| **Mastercard** | `5555 5555 5555 4444` | Any future date | `123` | Approved (Charge captured) |
| **American Express** | `3782 822463 10005` | Any future date | `1234` | Approved (Charge captured) |
| **Discover** | `6011 1111 1111 1117` | Any future date | `123` | Approved (Charge captured) |
| **JCB** | `3528 0000 0000 0007` | Any future date | `123` | Approved (Charge captured) |
| **China UnionPay** | `6200 0000 0000 0002` | Any future date | `123` | Approved (Charge captured) |

---

## 2. Gateway Error Simulation Cards & Response Triggers

### A. Stripe Connect Error Simulation
| Scenario | Test Card Number | Expected Gateway Error Code | HTTP Status |
| :--- | :--- | :--- | :--- |
| **Declined / General Failure** | `4000 0000 0000 0002` (with amount `$0.02`) | `card_declined` | `402` |
| **Insufficient Funds** | `4000 0000 0000 9995` | `insufficient_funds` | `402` |
| **Lost / Stolen Card** | `4000 0000 0000 0010` | `lost_card` | `402` |
| **Expired Card** | `4000 0000 0000 0069` | `expired_card` | `402` |
| **Incorrect CVV / CVC** | `4000 0000 0000 0127` | `incorrect_cvc` | `402` |
| **Fraud Trigger / High Risk** | `4000 0000 0000 0028` | `fraudulent` | `402` |
| **3DS Authentication Required** | `4000 0000 0000 3063` | `authentication_required` | `200 (Challenge)` |

---

### B. NMI Error Simulation (Collect.js & Direct Post)
In NMI sandbox mode, response error codes can be simulated via specific cents amounts on standard test cards:

| Simulation Scenario | Trigger Amount | NMI Response Text | Standardized Code |
| :--- | :--- | :--- | :--- |
| **Approved** | Any amount (except triggers below) | `1 (Approved)` | `APPROVED` |
| **Card Declined** | `$10.05` | `2 (Declined)` | `DECLINED` |
| **Insufficient Funds** | `$10.51` | `2 (Insufficient Funds)` | `INSUFFICIENT_FUNDS` |
| **Invalid Card Number** | `$10.14` | `3 (Invalid Card Number)` | `INVALID_ACCOUNT` |
| **Expired Card** | `$10.54` | `3 (Card Expired)` | `EXPIRED_CARD` |
| **Invalid CVV** | `$10.82` | `3 (CVV Failed)` | `INVALID_CVV` |
| **Gateway Timeout / Network** | `$10.91` | `3 (Gateway Timeout)` | `GATEWAY_TIMEOUT` |

---

### C. Rainforest Payments Simulation
Rainforest sandbox provides specific test payment method tokens:
- **Approved Card Token**: `pm_test_approved_visa`
- **Declined Card Token**: `pm_test_declined_insufficient_funds`
- **3DS Challenge Token**: `pm_test_3ds_required`
- **Expired Card Token**: `pm_test_declined_expired`

---

### D. Airwallex 3DSv2 Challenge Cards
| Airwallex Scenario | Test Card Number | Expected Behavior |
| :--- | :--- | :--- |
| **Frictionless 3DSv2 Approval** | `4000 0000 0000 3000` | Instantly authenticated and captured without prompt |
| **Challenge 3DSv2 Required** | `4000 0000 0000 3001` | Renders Airwallex 3DS modal challenge iframe |
| **3DSv2 Authentication Failed** | `4000 0000 0000 3002` | Fails challenge with `AUTHENTICATION_FAILED` |

---

## 3. Webhook Simulation CLI Commands

### Stripe Webhook Forwarding & Event Generation
```bash
# Listen and forward incoming webhooks to local endpoint
stripe listen --forward-to localhost:3000/api/webhooks/payment/stripe

# Trigger specific test event
stripe trigger payment_intent.succeeded
stripe trigger account.updated
stripe trigger charge.refunded
```

### Manual NMI Webhook HMAC Test Ingestion
```bash
BODY='{"event_type":"transaction.sale.success","transaction_id":"nmi_tx_mock_123","amount":"100.00"}'
SECRET="whsec_test_mock_secret"
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST http://localhost:3000/api/webhooks/payment/nmi \
  -H "Content-Type: application/json" \
  -H "nmi-signature: $SIG" \
  -d "$BODY"
```
