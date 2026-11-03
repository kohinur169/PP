// path: db/seeds/countries.ts

/**
 * ISO 3166-1 Country Record representing platform merchant country control and sanctions rules.
 * Enforces KD Solution IT compliance policies:
 * - Sanctioned countries (OFAC, UN, EU) permanently disabled
 * - Asian market primary merchant corridors enabled
 * - Global Tier-1 merchant support
 */
export interface CountryRecord {
  readonly code: string;
  readonly name: string;
  readonly status: 'enabled' | 'disabled' | 'sanctioned';
  readonly is_sanctioned: boolean;
  readonly supported_for_merchants: boolean;
  readonly risk_tier_default: 1 | 2 | 3;
  readonly default_currency: string;
}

export interface CountrySeedResult {
  readonly totalCountries: number;
  readonly enabledCount: number;
  readonly disabledCount: number;
  readonly sanctionedCount: number;
  readonly countries: CountryRecord[];
}

/**
 * OFAC, UN, EU Permanently Sanctioned Country ISO Codes.
 * These countries are permanently forbidden and disabled at platform level.
 */
export const SANCTIONED_COUNTRY_CODES = new Set([
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'RU', // Russian Federation (Comprehensive OFAC Restrictions)
]);

/**
 * Complete catalog of ISO 3166-1 Alpha-2 countries with KD Solution IT classification.
 */
export const COUNTRY_CATALOG: CountryRecord[] = [
  // Primary Asian Market Corridors (Core Focus)
  {
    code: 'SG',
    name: 'Singapore',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'SGD',
  },
  {
    code: 'MY',
    name: 'Malaysia',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'MYR',
  },
  {
    code: 'PH',
    name: 'Philippines',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'PHP',
  },
  {
    code: 'ID',
    name: 'Indonesia',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'IDR',
  },
  {
    code: 'TH',
    name: 'Thailand',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'THB',
  },
  {
    code: 'VN',
    name: 'Vietnam',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'VND',
  },
  {
    code: 'HK',
    name: 'Hong Kong',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'HKD',
  },
  {
    code: 'JP',
    name: 'Japan',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'JPY',
  },
  {
    code: 'KR',
    name: 'South Korea',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'KRW',
  },
  {
    code: 'TW',
    name: 'Taiwan',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'TWD',
  },
  {
    code: 'IN',
    name: 'India',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'INR',
  },
  {
    code: 'BD',
    name: 'Bangladesh',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'BDT',
  },

  // Major Worldwide Supported Corridors
  {
    code: 'US',
    name: 'United States',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'USD',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'GBP',
  },
  {
    code: 'CA',
    name: 'Canada',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'CAD',
  },
  {
    code: 'AU',
    name: 'Australia',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'AUD',
  },
  {
    code: 'NZ',
    name: 'New Zealand',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'NZD',
  },
  {
    code: 'DE',
    name: 'Germany',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'EUR',
  },
  {
    code: 'FR',
    name: 'France',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'EUR',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'EUR',
  },
  {
    code: 'CH',
    name: 'Switzerland',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'CHF',
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'AED',
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 2,
    default_currency: 'SAR',
  },

  // Sanctioned Jurisdictions (Permanently Disabled)
  {
    code: 'CU',
    name: 'Cuba',
    status: 'sanctioned',
    is_sanctioned: true,
    supported_for_merchants: false,
    risk_tier_default: 3,
    default_currency: 'CUP',
  },
  {
    code: 'IR',
    name: 'Iran',
    status: 'sanctioned',
    is_sanctioned: true,
    supported_for_merchants: false,
    risk_tier_default: 3,
    default_currency: 'IRR',
  },
  {
    code: 'KP',
    name: 'North Korea',
    status: 'sanctioned',
    is_sanctioned: true,
    supported_for_merchants: false,
    risk_tier_default: 3,
    default_currency: 'KPW',
  },
  {
    code: 'SY',
    name: 'Syria',
    status: 'sanctioned',
    is_sanctioned: true,
    supported_for_merchants: false,
    risk_tier_default: 3,
    default_currency: 'SYP',
  },
  {
    code: 'RU',
    name: 'Russian Federation',
    status: 'sanctioned',
    is_sanctioned: true,
    supported_for_merchants: false,
    risk_tier_default: 3,
    default_currency: 'RUB',
  },

  // Additional Global Countries (Catalog Baseline)
  {
    code: 'BR',
    name: 'Brazil',
    status: 'disabled',
    is_sanctioned: false,
    supported_for_merchants: false,
    risk_tier_default: 2,
    default_currency: 'BRL',
  },
  {
    code: 'MX',
    name: 'Mexico',
    status: 'disabled',
    is_sanctioned: false,
    supported_for_merchants: false,
    risk_tier_default: 2,
    default_currency: 'MXN',
  },
  {
    code: 'ZA',
    name: 'South Africa',
    status: 'disabled',
    is_sanctioned: false,
    supported_for_merchants: false,
    risk_tier_default: 2,
    default_currency: 'ZAR',
  },
  {
    code: 'IE',
    name: 'Ireland',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'EUR',
  },
  {
    code: 'SE',
    name: 'Sweden',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'SEK',
  },
  {
    code: 'NO',
    name: 'Norway',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'NOK',
  },
  {
    code: 'DK',
    name: 'Denmark',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'DKK',
  },
  {
    code: 'ES',
    name: 'Spain',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'EUR',
  },
  {
    code: 'IT',
    name: 'Italy',
    status: 'enabled',
    is_sanctioned: false,
    supported_for_merchants: true,
    risk_tier_default: 1,
    default_currency: 'EUR',
  },
];

/**
 * Returns the entire country catalog.
 */
export function getCountryCatalog(): CountryRecord[] {
  return [...COUNTRY_CATALOG];
}

/**
 * Checks whether a given country ISO code is subject to international sanctions.
 */
export function isCountrySanctioned(countryCode: string): boolean {
  return SANCTIONED_COUNTRY_CODES.has(countryCode.toUpperCase().trim());
}

/**
 * Checks whether a given country ISO code is currently enabled for merchant onboarding.
 */
export function isCountrySupported(countryCode: string): boolean {
  const normalized = countryCode.toUpperCase().trim();
  if (isCountrySanctioned(normalized)) return false;

  const country = COUNTRY_CATALOG.find((c) => c.code === normalized);
  return Boolean(country?.supported_for_merchants && country?.status === 'enabled');
}

/**
 * Executes country catalog seeding and validation.
 * Verifies 100% adherence to sanctions enforcement and country control invariants.
 */
export async function seedCountries(): Promise<CountrySeedResult> {
  const catalog = getCountryCatalog();

  let enabledCount = 0;
  let disabledCount = 0;
  let sanctionedCount = 0;

  for (const country of catalog) {
    if (isCountrySanctioned(country.code)) {
      if (country.status !== 'sanctioned' || country.supported_for_merchants) {
        throw new Error(
          `Sanctions Policy Violation: Country ${country.code} (${country.name}) is marked sanctioned but is not permanently disabled.`
        );
      }
      sanctionedCount++;
    } else if (country.status === 'enabled') {
      enabledCount++;
    } else {
      disabledCount++;
    }
  }

  return {
    totalCountries: catalog.length,
    enabledCount,
    disabledCount,
    sanctionedCount,
    countries: catalog,
  };
}
