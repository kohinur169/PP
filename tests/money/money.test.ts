// path: tests/money/money.test.ts
import { describe, it, expect } from 'vitest';
import { money, Money, formatUSD, toNumeric18_4 } from '@/lib/money';

describe('Decimal Money Math & Fixed Precision (numeric(18,4)) Engine', () => {
  it('should eliminate classic JavaScript floating-point errors (0.1 + 0.2 === 0.3)', () => {
    // In native JS: 0.1 + 0.2 = 0.30000000000000004
    const a = money('0.1');
    const b = money('0.2');
    const sum = a.add(b);

    expect(sum.equals('0.3')).toBe(true);
    expect(sum.toNumericString()).toBe('0.3000');
  });

  it('should format all amounts to PostgreSQL numeric(18,4) strings with exact 4 decimals', () => {
    expect(money('100').toNumericString()).toBe('100.0000');
    expect(money('49.99').toNumericString()).toBe('49.9900');
    expect(money('1250.5').toNumericString()).toBe('1250.5000');
    expect(toNumeric18_4(2500)).toBe('2500.0000');
  });

  it('should format user-facing USD display with comma thousand separators', () => {
    expect(formatUSD('100')).toBe('$100.00');
    expect(formatUSD('1250.50')).toBe('$1,250.50');
    expect(formatUSD('1000000.99')).toBe('$1,000,000.99');
    expect(money('25.5').toDisplayString(false)).toBe('25.50');
  });

  it('should perform immutable basic arithmetic (add, sub, mul, div)', () => {
    const base = money('100.0000');

    expect(base.add('25.5000').toNumericString()).toBe('125.5000');
    expect(base.sub('30.2500').toNumericString()).toBe('69.7500');
    expect(base.mul('0.03').toNumericString()).toBe('3.0000'); // 3% fee
    expect(base.div('4').toNumericString()).toBe('25.0000');

    // Immutability check: base remains unchanged
    expect(base.toNumericString()).toBe('100.0000');
  });

  it('should execute Banker\'s Rounding (HALF_EVEN) correctly on fractional cents', () => {
    // Half even rounds to nearest even number when equidistant
    // 2.5 rounds to 2 (even)
    expect(money('2.5').round(0, 'HALF_EVEN').toNumericString()).toBe('2.0000');
    // 3.5 rounds to 4 (even)
    expect(money('3.5').round(0, 'HALF_EVEN').toNumericString()).toBe('4.0000');
    // 1.5555 rounds to 1.5556 (even)
    expect(money('1.55555').round(4, 'HALF_EVEN').toNumericString()).toBe('1.5556');
  });

  it('should guarantee exact penny-conservation when allocating across multiple parties (Zero Precision Loss)', () => {
    const total = money('100.0000');

    // Split $100 across 3 equal parties (1:1:1)
    const portions = total.allocate([1, 1, 1]);

    expect(portions.length).toBe(3);

    // Sum of all portions must equal EXACTLY $100.0000 without 0.0001 drift
    const sum = portions[0].add(portions[1]).add(portions[2]);
    expect(sum.equals(total)).toBe(true);
    expect(sum.toNumericString()).toBe('100.0000');

    // Portions should be distributed: one gets remainder unit
    expect(portions[0].toNumericString()).toBe('33.3334');
    expect(portions[1].toNumericString()).toBe('33.3333');
    expect(portions[2].toNumericString()).toBe('33.3333');
  });

  it('should accurately allocate multi-party fee splits (Merchant 97%, Platform 3%)', () => {
    const charge = money('250.0000');
    const [merchantShare, platformFee] = charge.allocate([97, 3]);

    expect(merchantShare.toNumericString()).toBe('242.5000');
    expect(platformFee.toNumericString()).toBe('7.5000');
    expect(merchantShare.add(platformFee).equals(charge)).toBe(true);
  });

  it('should correctly handle comparisons (equals, greaterThan, lessThan, isZero)', () => {
    const a = money('50.0000');
    const b = money('50.0000');
    const c = money('75.0000');
    const zero = money('0');
    const negative = money('-10');

    expect(a.equals(b)).toBe(true);
    expect(a.equals('50')).toBe(true);
    expect(c.greaterThan(a)).toBe(true);
    expect(a.lessThan(c)).toBe(true);
    expect(zero.isZero()).toBe(true);
    expect(c.isPositive()).toBe(true);
    expect(negative.isNegative()).toBe(true);
    expect(negative.abs().toNumericString()).toBe('10.0000');
  });

  it('should throw explicit error on division by zero', () => {
    expect(() => money('100').div('0')).toThrowError('Division by zero in financial calculation');
  });

  it('should throw on invalid monetary input strings', () => {
    expect(() => money('not-a-number')).toThrowError('Invalid monetary string: "not-a-number"');
    expect(() => money('')).toThrowError('Invalid monetary string: ""');
  });
});
