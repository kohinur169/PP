// path: lib/money/money.ts
import Decimal from 'decimal.js';
import type { MoneyInput, Numeric18_4, RoundingMode, IMoney } from './types';

// Configure global Decimal precision for platform-wide banking math
// 28 digits precision with Decimal.ROUND_HALF_EVEN (Banker's rounding)
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -7,
  toExpPos: 21,
});

const ROUNDING_MAP: Record<RoundingMode, Decimal.Rounding> = {
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_DOWN: Decimal.ROUND_HALF_DOWN,
  DOWN: Decimal.ROUND_DOWN,
  UP: Decimal.ROUND_UP,
};

export class Money implements IMoney {
  readonly value: Decimal;

  constructor(amount: MoneyInput) {
    if (amount instanceof Money) {
      this.value = amount.value;
    } else if (amount instanceof Decimal) {
      this.value = amount;
    } else if (typeof amount === 'string') {
      const sanitized = amount.trim().replace(/[$,]/g, '');
      if (sanitized === '' || isNaN(Number(sanitized))) {
        throw new Error(`Invalid monetary string: "${amount}"`);
      }
      this.value = new Decimal(sanitized);
    } else if (typeof amount === 'number') {
      if (!isFinite(amount)) {
        throw new Error(`Invalid monetary number: ${amount}`);
      }
      this.value = new Decimal(amount.toString());
    } else {
      throw new Error(`Unsupported MoneyInput type: ${typeof amount}`);
    }
  }

  static from(amount: MoneyInput): Money {
    return new Money(amount);
  }

  static zero(): Money {
    return new Money('0.0000');
  }

  static fromCents(cents: number): Money {
    return new Money(cents).div(100);
  }

  add(other: MoneyInput): Money {
    const o = money(other);
    return new Money(this.value.plus(o.value));
  }

  sub(other: MoneyInput): Money {
    const o = money(other);
    return new Money(this.value.minus(o.value));
  }

  subtract(other: MoneyInput): Money {
    return this.sub(other);
  }

  mul(other: MoneyInput): Money {
    const o = money(other);
    return new Money(this.value.times(o.value));
  }

  multiply(other: MoneyInput): Money {
    return this.mul(other);
  }

  div(other: MoneyInput): Money {
    const o = money(other);
    if (o.value.isZero()) {
      throw new Error('Division by zero in financial calculation');
    }
    return new Money(this.value.dividedBy(o.value));
  }

  round(decimals = 4, mode: RoundingMode = 'HALF_EVEN'): Money {
    const roundingConst = ROUNDING_MAP[mode] ?? Decimal.ROUND_HALF_EVEN;
    return new Money(this.value.toDecimalPlaces(decimals, roundingConst));
  }

  abs(): Money {
    return new Money(this.value.abs());
  }

  negate(): Money {
    return new Money(this.value.negated());
  }

  compare(other: MoneyInput): -1 | 0 | 1 {
    const o = money(other);
    const cmp = this.value.comparedTo(o.value);
    if (cmp < 0) return -1;
    if (cmp > 0) return 1;
    return 0;
  }

  equals(other: MoneyInput): boolean {
    return this.compare(other) === 0;
  }

  greaterThan(other: MoneyInput): boolean {
    return this.compare(other) === 1;
  }

  greaterThanOrEqual(other: MoneyInput): boolean {
    return this.compare(other) >= 0;
  }

  lessThan(other: MoneyInput): boolean {
    return this.compare(other) === -1;
  }

  lessThanOrEqual(other: MoneyInput): boolean {
    return this.compare(other) <= 0;
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  /**
   * Pro-rata money allocation across specified ratios with penny-exact conservation.
   * Guarantees: sum(portions) === this.value exactly, distributing remainder cents.
   *
   * Example: allocate $100 across ratios [1, 1, 1] -> [$33.3334, $33.3333, $33.3333]
   */
  allocate(ratios: number[]): Money[] {
    if (ratios.length === 0) {
      return [];
    }

    const totalRatio = ratios.reduce((sum, r) => sum + r, 0);
    if (totalRatio <= 0) {
      throw new Error('Total ratio must be positive in money allocation');
    }

    const totalRatioDec = new Decimal(totalRatio);
    // Work with 4 decimal places precision (standard platform precision)
    const baseUnit = new Decimal('0.0001');
    const portions: Money[] = [];
    let allocatedSum = new Decimal(0);

    for (const ratio of ratios) {
      // floor(value * ratio / totalRatio to 4 decimal places)
      const share = this.value
        .times(ratio)
        .dividedBy(totalRatioDec)
        .toDecimalPlaces(4, Decimal.ROUND_DOWN);
      portions.push(new Money(share));
      allocatedSum = allocatedSum.plus(share);
    }

    // Distribute remainder units (0.0001) one by one to ensure exact conservation
    let remainder = this.value.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).minus(allocatedSum);
    let i = 0;
    while (!remainder.isZero() && i < portions.length) {
      if (remainder.isPositive()) {
        portions[i] = portions[i].add(baseUnit);
        remainder = remainder.minus(baseUnit);
      } else {
        portions[i] = portions[i].sub(baseUnit);
        remainder = remainder.plus(baseUnit);
      }
      i = (i + 1) % portions.length;
    }

    return portions;
  }

  /**
   * Formats to PostgreSQL numeric(18,4) string: "123.4500"
   */
  toNumericString(): Numeric18_4 {
    return this.value.toFixed(4, Decimal.ROUND_HALF_EVEN);
  }

  /**
   * Formats for user-facing display: "$1,234.56"
   */
  toDisplayString(includeSymbol = true): string {
    const rounded = this.value.toFixed(2, Decimal.ROUND_HALF_EVEN);
    const [integerPart, decimalPart] = rounded.split('.');
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const prefix = includeSymbol ? '$' : '';
    return `${prefix}${formattedInteger}.${decimalPart}`;
  }
}

/**
 * Shorthand factory function returning Money instance.
 */
export function money(amount: MoneyInput): Money {
  if (amount instanceof Money) {
    return amount;
  }
  return new Money(amount);
}

/**
 * Formats any MoneyInput to standard USD representation: "$100.00"
 */
export function formatUSD(amount: MoneyInput, options?: { showCents?: boolean }): string {
  const m = money(amount);
  return m.toDisplayString(true);
}

/**
 * Converts any MoneyInput to exact PostgreSQL numeric(18,4) string: "100.0000"
 */
export function toNumeric18_4(amount: MoneyInput): Numeric18_4 {
  return money(amount).toNumericString();
}
