// path: lib/money/types.ts
import type { Decimal } from 'decimal.js';

export type MoneyInput = string | number | Decimal | IMoney;

/**
 * Standard PostgreSQL numeric(18,4) formatted string representation.
 * Always has up to 18 total digits with exactly 4 decimal places (e.g. "100.0000").
 */
export type Numeric18_4 = string;

export type RoundingMode = 'HALF_EVEN' | 'HALF_UP' | 'HALF_DOWN' | 'DOWN' | 'UP';

export interface MoneySplitResult {
  portions: IMoney[];
  remainder: IMoney;
}

export interface IMoney {
  readonly value: Decimal;
  add(other: MoneyInput): IMoney;
  sub(other: MoneyInput): IMoney;
  subtract(other: MoneyInput): IMoney;
  mul(other: MoneyInput): IMoney;
  multiply(other: MoneyInput): IMoney;
  div(other: MoneyInput): IMoney;
  round(decimals?: number, mode?: RoundingMode): IMoney;
  abs(): IMoney;
  negate(): IMoney;
  compare(other: MoneyInput): -1 | 0 | 1;
  equals(other: MoneyInput): boolean;
  greaterThan(other: MoneyInput): boolean;
  greaterThanOrEqual(other: MoneyInput): boolean;
  lessThan(other: MoneyInput): boolean;
  lessThanOrEqual(other: MoneyInput): boolean;
  isZero(): boolean;
  isPositive(): boolean;
  isNegative(): boolean;
  allocate(ratios: number[]): IMoney[];
  toNumericString(): Numeric18_4;
  toDisplayString(includeSymbol?: boolean): string;
}
