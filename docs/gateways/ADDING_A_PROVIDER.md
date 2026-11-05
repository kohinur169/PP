<!-- path: docs/gateways/ADDING_A_PROVIDER.md -->

# Architecture Guide: Adding a New Payment Processor Provider

KD Solution IT's PayFac architecture employs an Open-Closed extension model. Adding a new payment processor or alternative payment method (APM) requires zero modifications to existing checkout flows, ledger entries, or billing orchestrators.

---

## 1. Implement `PaymentProcessorAdapter`

Create a new file under `lib/processors/[provider-name].ts` implementing the standardized contract defined in `lib/processors/types.ts`:

```typescript
import {
  PaymentProcessorAdapter,
  AuthorizeRequest,
  ChargeResult,
  CaptureRequest,
  RefundRequest,
  RefundResult,
  PayoutRequest,
  PayoutResult,
  CreateSubMerchantRequest,
  SubMerchantResult,
  WebhookVerificationResult,
  GatewayConnectionTestResult,
  GatewayDeclinedError,
  GatewayInvalidRequestError,
  GatewayNetworkError,
  GatewayAuthError,
} from '@/lib/processors/types';

export class CustomPaymentAdapter implements PaymentProcessorAdapter {
  readonly providerSlug = 'custom_provider';
  readonly providerDisplayName = 'Custom Enterprise Gateway';

  async testConnection(): Promise<GatewayConnectionTestResult> {
    // Ping gateway health endpoint
  }

  async createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    // Provision merchant account / sub-merchant entity
  }

  async authorizePayment(request: AuthorizeRequest): Promise<ChargeResult> {
    // Process tokenized card or digital wallet authorization
  }

  async capturePayment(request: CaptureRequest): Promise<ChargeResult> {
    // Capture previously authorized charge
  }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    // Execute refund
  }

  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    // Execute payout or throw GatewayInvalidRequestError if payouts unsupported
  }

  async verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ): Promise<WebhookVerificationResult> {
    // Cryptographically verify inbound webhook signature (HMAC-SHA256 or RSA)
  }
}
```

---

## 2. Register Provider in `PaymentProcessorRegistry`

Register your adapter factory and capability matrix into `processorRegistry` in `lib/processors/registry.ts`:

```typescript
import { processorRegistry } from '@/lib/processors/registry';
import { CustomPaymentAdapter } from '@/lib/processors/custom';

processorRegistry.register(
  'custom_provider',
  () => new CustomPaymentAdapter({ apiKey: process.env['CUSTOM_PROVIDER_API_KEY'] }),
  {
    displayName: 'Custom Enterprise Gateway',
    description: 'Specialized enterprise processor supporting global cards and SEPA.',
    websiteUrl: 'https://custom-gateway.io',
    documentationUrl: 'https://docs.custom-gateway.io',
    capabilities: {
      cardAcceptance: true,
      eWallets: true,
      subMerchantCreation: true,
      payouts: false,
      hostedFields: true,
      recurringBilling: true,
      level2Level3Data: true,
      threeDSecure: true,
    },
    supportedCountries: ['US', 'CA', 'GB', 'DE', 'FR'],
    supportedCurrencies: ['USD', 'EUR', 'GBP'],
    clientLibraries: ['CustomPay.js'],
    isEnabled: true,
    defaultPriority: 50,
  }
);
```

---

## 3. Register Webhook Ingestion Route

Create an edge or Node.js route handler under `app/api/webhooks/payment/[provider-name]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { CustomPaymentAdapter } from '@/lib/processors/custom';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-signature') ?? '';
  const rawBody = await req.text();

  const adapter = new CustomPaymentAdapter();
  const verification = await adapter.verifyWebhook(
    rawBody,
    signature,
    process.env['CUSTOM_WEBHOOK_SECRET'] ?? ''
  );

  if (!verification.isValid) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  // Dispatch event to ledger worker or update submerchant status
  return NextResponse.json({ received: true }, { status: 200 });
}
```

---

## 4. Key Rules & Compliance Mandates

1. **Zero Raw Card Data**: The server must never receive unencrypted PAN, expiry, or CVV. Always use hosted fields or client-side tokens.
2. **PostgreSQL numeric(18,4)**: All currency calculations must utilize `Money` from `@/lib/money/money` and settle in USD.
3. **Tenant Row Level Security**: All merchant database lookups must respect `current_setting('app.current_tenant_id')`.
4. **Audit Logging**: Any credential rotation or configuration change must be recorded in `audit_logs` with cryptographic hash chaining.
