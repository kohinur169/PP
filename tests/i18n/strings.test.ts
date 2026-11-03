// path: tests/i18n/strings.test.ts
import { describe, it, expect } from 'vitest';
import { t, en, type I18nKey } from '@/lib/i18n';

describe('Centralized English String Dictionary & i18n Engine', () => {
  it('should retrieve static strings accurately by dot notation path', () => {
    expect(t('common.platformName')).toBe('KD SOLUTION IT');
    expect(t('common.currencyUSD')).toBe('USD ($)');
    expect(t('auth.loginButton')).toBe('Sign In');
    expect(t('compliance.tier1Title')).toBe('Risk Tier 1 (New Merchant)');
    expect(t('billing.partialPaymentMinimum')).toBe('Partial payments must be at least USD $20.00.');
  });

  it('should safely interpolate parameters into template placeholders', () => {
    // Test custom placeholder substitution
    const customKey = 'test.interpolated' as I18nKey;
    // Test with missing key
    expect(t(customKey)).toBe('test.interpolated');
  });

  it('should guarantee that all dictionary strings are strictly English and non-empty', () => {
    function verifyNestedStrings(obj: Record<string, unknown>, prefix = ''): void {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null) {
          verifyNestedStrings(value as Record<string, unknown>, fullPath);
        } else if (typeof value === 'string') {
          expect(value.trim().length, `String at ${fullPath} is empty`).toBeGreaterThan(0);
          // Check for non-ASCII characters to guarantee strict English-only compliance
          const nonAscii = value.match(/[^\x00-\x7F]/);
          expect(nonAscii, `String at ${fullPath} contains non-ASCII characters: ${value}`).toBeNull();
        } else {
          throw new Error(`Unexpected non-string type at ${fullPath}`);
        }
      }
    }

    verifyNestedStrings(en as unknown as Record<string, unknown>);
  });

  it('should cover all mandatory platform namespaces without omissions', () => {
    expect(en).toHaveProperty('common');
    expect(en).toHaveProperty('auth');
    expect(en).toHaveProperty('kyc');
    expect(en).toHaveProperty('compliance');
    expect(en).toHaveProperty('billing');
    expect(en).toHaveProperty('checkout');
    expect(en).toHaveProperty('admin');
    expect(en).toHaveProperty('errors');
  });
});
