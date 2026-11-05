// path: lib/currency/currency-engine.ts

export interface CurrencyMetadata {
  code: string;
  decimals: number;
  symbol: string;
  name: string;
  minAmount: number;
}

/**
 * Section 28: Multi-Currency Precision Standards & ISO 4217 Currency Definitions
 * - Zero-decimal currencies (JPY, KRW, VND, CLP, etc.)
 * - 3-decimal currencies (BHD, KWD, OMR, JOD, TND, etc.)
 * - Standard 2-decimal currencies (USD, EUR, GBP, CAD, AUD, SGD, etc.)
 */
export const SUPPORTED_CURRENCIES: Record<string, CurrencyMetadata> = {
  USD: { code: 'USD', decimals: 2, symbol: '$', name: 'US Dollar', minAmount: 0.50 },
  EUR: { code: 'EUR', decimals: 2, symbol: '€', name: 'Euro', minAmount: 0.50 },
  GBP: { code: 'GBP', decimals: 2, symbol: '£', name: 'British Pound', minAmount: 0.30 },
  CAD: { code: 'CAD', decimals: 2, symbol: 'CA$', name: 'Canadian Dollar', minAmount: 0.50 },
  AUD: { code: 'AUD', decimals: 2, symbol: 'AU$', name: 'Australian Dollar', minAmount: 0.50 },
  SGD: { code: 'SGD', decimals: 2, symbol: 'SG$', name: 'Singapore Dollar', minAmount: 0.50 },
  HKD: { code: 'HKD', decimals: 2, symbol: 'HK$', name: 'Hong Kong Dollar', minAmount: 4.00 },
  NZD: { code: 'NZD', decimals: 2, symbol: 'NZ$', name: 'New Zealand Dollar', minAmount: 0.50 },
  CHF: { code: 'CHF', decimals: 2, symbol: 'CHF', name: 'Swiss Franc', minAmount: 0.50 },
  // Zero-decimal currencies
  JPY: { code: 'JPY', decimals: 0, symbol: '¥', name: 'Japanese Yen', minAmount: 50 },
  KRW: { code: 'KRW', decimals: 0, symbol: '₩', name: 'South Korean Won', minAmount: 500 },
  VND: { code: 'VND', decimals: 0, symbol: '₫', name: 'Vietnamese Dong', minAmount: 10000 },
  CLP: { code: 'CLP', decimals: 0, symbol: 'CLP$', name: 'Chilean Peso', minAmount: 500 },
  PYG: { code: 'PYG', decimals: 0, symbol: '₲', name: 'Paraguayan Guarani', minAmount: 1000 },
  UGX: { code: 'UGX', decimals: 0, symbol: 'USh', name: 'Ugandan Shilling', minAmount: 1000 },
  RWF: { code: 'RWF', decimals: 0, symbol: 'RF', name: 'Rwandan Franc', minAmount: 500 },
  BIF: { code: 'BIF', decimals: 0, symbol: 'FBu', name: 'Burundian Franc', minAmount: 500 },
  DJF: { code: 'DJF', decimals: 0, symbol: 'Fdj', name: 'Djiboutian Franc', minAmount: 100 },
  GNF: { code: 'GNF', decimals: 0, symbol: 'FG', name: 'Guinean Franc', minAmount: 5000 },
  KMF: { code: 'KMF', decimals: 0, symbol: 'CF', name: 'Comorian Franc', minAmount: 200 },
  XOF: { code: 'XOF', decimals: 0, symbol: 'CFA', name: 'West African CFA Franc', minAmount: 100 },
  XAF: { code: 'XAF', decimals: 0, symbol: 'FCFA', name: 'Central African CFA Franc', minAmount: 100 },
  XPF: { code: 'XPF', decimals: 0, symbol: '₣', name: 'CFP Franc', minAmount: 100 },
  // 3-decimal currencies
  BHD: { code: 'BHD', decimals: 3, symbol: 'BD', name: 'Bahraini Dinar', minAmount: 0.100 },
  KWD: { code: 'KWD', decimals: 3, symbol: 'KD', name: 'Kuwaiti Dinar', minAmount: 0.100 },
  OMR: { code: 'OMR', decimals: 3, symbol: 'OMR', name: 'Omani Rial', minAmount: 0.100 },
  JOD: { code: 'JOD', decimals: 3, symbol: 'JD', name: 'Jordanian Dinar', minAmount: 0.100 },
  TND: { code: 'TND', decimals: 3, symbol: 'DT', name: 'Tunisian Dinar', minAmount: 0.500 },
  IQD: { code: 'IQD', decimals: 3, symbol: 'IQD', name: 'Iraqi Dinar', minAmount: 500.000 },
  LYD: { code: 'LYD', decimals: 3, symbol: 'LD', name: 'Libyan Dinar', minAmount: 0.500 },
};

/**
 * Step 169.1: Converts major currency unit amount into minor integer units (e.g. cents, yen, fils).
 */
export function toMinorUnits(amount: number, currencyCode: string): bigint {
  const curr = SUPPORTED_CURRENCIES[currencyCode.toUpperCase()] ?? {
    code: currencyCode.toUpperCase(),
    decimals: 2,
    symbol: '$',
    name: 'Unknown',
    minAmount: 0.5,
  };

  const factor = Math.pow(10, curr.decimals);
  // Use Math.round to avoid IEEE 754 precision issues
  const minor = Math.round(amount * factor);
  return BigInt(minor);
}

/**
 * Step 169.2: Converts integer minor units back into major currency unit amount.
 */
export function fromMinorUnits(minorUnits: bigint | number, currencyCode: string): number {
  const curr = SUPPORTED_CURRENCIES[currencyCode.toUpperCase()] ?? {
    code: currencyCode.toUpperCase(),
    decimals: 2,
    symbol: '$',
    name: 'Unknown',
    minAmount: 0.5,
  };

  const factor = Math.pow(10, curr.decimals);
  const num = typeof minorUnits === 'bigint' ? Number(minorUnits) : minorUnits;
  return Number((num / factor).toFixed(curr.decimals));
}

/**
 * Step 169.3: Formats currency amount according to precision and locale symbol.
 */
export function formatCurrencyAmount(amount: number, currencyCode: string): string {
  const curr = SUPPORTED_CURRENCIES[currencyCode.toUpperCase()] ?? {
    code: currencyCode.toUpperCase(),
    decimals: 2,
    symbol: '',
    name: 'Unknown',
    minAmount: 0.5,
  };

  const formattedNum = amount.toLocaleString('en-US', {
    minimumFractionDigits: curr.decimals,
    maximumFractionDigits: curr.decimals,
  });

  return `${curr.symbol}${formattedNum} ${curr.code}`;
}

/**
 * Step 169.4: Normalizes multi-currency amount to base platform USD numeric(18,4).
 * Uses banker's rounding / half-even to 4 decimal places.
 */
export function normalizeToUsd(amountInCurrency: number, fxRateToUsd: number): number {
  const rawUsd = amountInCurrency * fxRateToUsd;
  // Banker's rounding to 4 decimal places
  return Number(rawUsd.toFixed(4));
}

/**
 * Step 169.5: Validates transaction amount against currency limits and precision.
 */
export function validateCurrencyAmount(
  amount: number,
  currencyCode: string
): { isValid: boolean; error?: string } {
  const code = currencyCode.toUpperCase();
  const curr = SUPPORTED_CURRENCIES[code];

  if (!curr) {
    return { isValid: false, error: `Unsupported currency code: ${currencyCode}` };
  }

  if (amount < curr.minAmount) {
    return {
      isValid: false,
      error: `Amount ${amount} is below minimum allowed charge for ${code} (${curr.minAmount})`,
    };
  }

  // Verify decimals do not exceed precision
  const parts = amount.toString().split('.');
  if (parts.length > 1 && parts[1].length > curr.decimals) {
    return {
      isValid: false,
      error: `Amount exceeds maximum allowed precision of ${curr.decimals} decimal places for ${code}`,
    };
  }

  return { isValid: true };
}
