// path: tests/phase1-verification.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { t } from '@/lib/i18n';
import { Money } from '@/lib/money';
import { sanitizeString, sanitizeObject, validateSafeUrl } from '@/lib/security';
import {
  UUIDv7Schema,
  MoneyStringSchema,
  CurrencyCodeSchema,
  EmailSchema,
  validateData,
} from '@/lib/validation';
import {
  Logger,
  runWithContext,
  getLogContext,
  redactString,
} from '@/lib/logger';
import {
  buildTenantSessionSql,
  validateTenantAccess,
  assertTenantAccess,
  withTenantTransaction,
  loadMigrationFiles,
} from '@/lib/database';
import path from 'node:path';

describe('Phase 1 Architecture End-to-End Verification (Step 011)', () => {
  it('should seamlessly integrate all Phase 1 foundations in a cohesive payment processing pipeline', async () => {
    // 1. INBOUND PAYLOAD & SANITIZATION (Step 003, Step 005)
    const dirtyMerchantInput = {
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      customerEmail: '  Buyer@example.com\0  ',
      description: "Invoice #101 <script>alert('xss')</script>",
      amount: '$1,250.50',
      currency: 'USD',
      callbackUrl: 'https://api.merchant.com/webhook',
    };

    // Sanitize inbound payload using multi-vector pipeline
    const sanitizedPayload = sanitizeObject(dirtyMerchantInput);
    expect(sanitizedPayload.description).toBe('Invoice #101');
    expect(sanitizedPayload.customerEmail).toBe('Buyer@example.com');

    // Verify webhook callback URL is safe from SSRF exploits
    const ssrfResult = validateSafeUrl(sanitizedPayload.callbackUrl);
    expect(ssrfResult.isValid).toBe(true);

    // 2. SCHEMA VALIDATION & NORMALIZATION (Step 006)
    const PaymentRequestSchema = z.object({
      tenantId: UUIDv7Schema,
      customerEmail: EmailSchema,
      description: z.string().min(1),
      amount: MoneyStringSchema,
      currency: CurrencyCodeSchema,
    });

    const validationResult = validateData(PaymentRequestSchema, sanitizedPayload);

    expect(validationResult.success).toBe(true);
    if (!validationResult.success) return;

    const validatedData = validationResult.data;
    expect(validatedData.amount).toBe('1250.5000');
    expect(validatedData.customerEmail).toBe('buyer@example.com');
    expect(validatedData.currency).toBe('USD');

    // 3. DECIMAL FINANCIAL MATH ENGINE (Step 004)
    const principal = new Money(validatedData.amount);
    const platformFeeRate = '0.0290'; // 2.9%
    const fixedFee = new Money('0.3000'); // $0.30

    const variableFee = principal.multiply(platformFeeRate);
    const totalFee = variableFee.add(fixedFee);
    const netPayout = principal.subtract(totalFee);

    expect(totalFee.toNumericString()).toBe('36.5645');
    expect(netPayout.toNumericString()).toBe('1213.9355');
    expect(principal.toDisplayString()).toBe('$1,250.50');

    // 4. STRUCTURED LOGGING & CORRELATION TRACING (Step 007)
    const logs: Array<{ message: string; correlationId?: string; meta?: Record<string, unknown> }> = [];
    const testLogger = new Logger({
      minLevel: 'info',
      outputFn: (entry) => logs.push(entry as any),
    });

    const correlationId = 'req_phase1_verification_001';
    await runWithContext({ correlationId, tenantId: validatedData.tenantId }, async () => {
      const activeCtx = getLogContext();
      expect(activeCtx.correlationId).toBe(correlationId);

      testLogger.info('Charge processed with card details', {
        pan: '4111222233334444',
        payoutAmount: netPayout.toNumericString(),
      });
    });

    expect(logs.length).toBe(1);
    expect(logs[0]?.correlationId).toBe(correlationId);
    expect(logs[0]?.meta?.pan).toBe('[REDACTED]');

    // 5. DATABASE MULTI-TENANT ISOLATION & RLS (Step 008, Step 009, Step 010)
    const tenantA = validatedData.tenantId;
    const tenantB = '018f6c4c-9999-7fa1-b1e2-999999999999';

    // Verify tenant boundary enforcement
    expect(validateTenantAccess({ tenantId: tenantA }, tenantA)).toBe(true);
    expect(validateTenantAccess({ tenantId: tenantA }, tenantB)).toBe(false);
    expect(() => assertTenantAccess({ tenantId: tenantA }, tenantB)).toThrowError(
      /Cross-Tenant Access Violation/
    );

    // Verify transactional session SQL generation
    await withTenantTransaction({ tenantId: tenantA }, async (tx) => {
      expect(tx.sessionSql).toContain(`SET LOCAL app.current_tenant_id = '${tenantA}';`);
      expect(tx.sessionSql).toContain("SET LOCAL app.is_superadmin = 'false';");
      return { committed: true };
    });

    // 6. CENTRALIZED ENGLISH i18n FEEDBACK (Step 003)
    const successMessage = t('checkout.paymentSuccess');
    expect(successMessage).toBe('Payment captured successfully. Receipt sent to your email.');
  });

  it('should verify all migration files exist on disk with valid checksums', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const migrations = loadMigrationFiles(migrationsDir);

    expect(migrations.length).toBeGreaterThanOrEqual(2);
    expect(migrations.some((m) => m.name === 'init_extensions')).toBe(true);
    expect(migrations.some((m) => m.name === 'create_tenants_and_rls')).toBe(true);

    for (const m of migrations) {
      expect(m.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
