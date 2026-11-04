// path: lib/compliance/mcc.ts

export type MccStatus = 'STANDARD' | 'RESTRICTED' | 'PROHIBITED';

export interface ProhibitedMccItem {
  mcc: string;
  category: string;
  title: string;
  description: string;
  ruleReference: string;
}

export interface RestrictedMccItem {
  mcc: string;
  category: string;
  title: string;
  mandatoryReservePercent: number;
  mandatoryReserveDays: number;
  requiredLicenses: string[];
  description: string;
}

export interface MccEligibilityResult {
  mcc: string;
  eligible: boolean;
  status: MccStatus;
  rejectionCode?: string;
  reasons: string[];
  mandatoryReservePercent?: number;
  mandatoryReserveDays?: number;
  requiredDocumentation: string[];
}

export const PROHIBITED_MCC_CATALOG: ProhibitedMccItem[] = [
  {
    mcc: '5967',
    category: 'Adult Content',
    title: 'Direct Marketing - Inbound Telemarketing Adult Entertainment / Services',
    description: 'Pornographic content, adult webcam platforms, escort services, sexually explicit media.',
    ruleReference: 'Mastercard BRAM Section 5.1 & Visa High-Risk Brand Program',
  },
  {
    mcc: '7273',
    category: 'Adult Content',
    title: 'Dating and Escort Services',
    description: 'Adult dating networks, explicit matchmaking, and escort facilitation.',
    ruleReference: 'Visa Core Rules 2.1.4',
  },
  {
    mcc: '7841',
    category: 'Adult Content',
    title: 'Video Tape / Digital Adult Entertainment Rental and Sales',
    description: 'Commercial distribution of explicit adult video and digital material.',
    ruleReference: 'Mastercard BRAM Section 5.1',
  },
  {
    mcc: '7995',
    category: 'Gambling & Betting',
    title: 'Betting, including Lottery Tickets, Casino Gaming Chips, Off-Track Betting',
    description: 'Online sportsbooks, internet casinos, digital scratch tickets, and poker clubs.',
    ruleReference: 'Unlawful Internet Gambling Enforcement Act (UIGEA) 31 U.S.C. § 5361',
  },
  {
    mcc: '7801',
    category: 'Gambling & Betting',
    title: 'Government-Licensed Online Casinos',
    description: 'Online gaming and wagering platforms.',
    ruleReference: 'Card Network Special Gaming Registration Requirements',
  },
  {
    mcc: '7802',
    category: 'Gambling & Betting',
    title: 'Government-Licensed Horse / Dog Racing',
    description: 'Pari-mutuel wagering and racecourse betting.',
    ruleReference: 'Card Network Special Gaming Registration Requirements',
  },
  {
    mcc: '6051',
    category: 'Unregulated Financial Services',
    title: 'Non-Financial Institutions - Foreign Currency, Money Orders, Crypto Mixers',
    description: 'Anonymizing cryptocurrency tumblers, peer-to-peer hawala, and unregulated cash equivalents.',
    ruleReference: 'FinCEN MSB Guidelines 31 CFR § 1010.100',
  },
  {
    mcc: '6211',
    category: 'Unregulated Financial Services',
    title: 'Securities Brokers / Dealers - Unregulated Binary Options',
    description: 'Unregistered binary options trading, contracts for difference (CFD), and offshore boiler rooms.',
    ruleReference: 'CFTC & SEC Consumer Alert on Binary Options Fraud',
  },
  {
    mcc: '5968',
    category: 'Deceptive Marketing',
    title: 'Direct Marketing - Continuity / Subscription Multi-Level Marketing',
    description: 'Pyramid schemes, multi-level marketing (MLM), get-rich-quick programs, deceptive negative option billing.',
    ruleReference: 'FTC Restore Online Shoppers Confidence Act (ROSCA) 15 U.S.C. § 8401',
  },
];

export const RESTRICTED_MCC_CATALOG: RestrictedMccItem[] = [
  {
    mcc: '5122',
    category: 'Telemedicine & Pharmaceuticals',
    title: 'Drugs, Proprietaries, and Sundries',
    mandatoryReservePercent: 10,
    mandatoryReserveDays: 90,
    requiredLicenses: ['State Pharmacy License', 'NABP Digital Pharmacy Accreditation', 'DEA Registration'],
    description: 'Online prescription fulfillment, mail-order pharmaceutical distribution, and doctor consultation platforms.',
  },
  {
    mcc: '5499',
    category: 'Nutraceuticals & Supplements',
    title: 'Misc Food Stores - Specialty Diet, Health Supplements, Botanicals',
    mandatoryReservePercent: 8,
    mandatoryReserveDays: 90,
    requiredLicenses: ['FDA cGMP Compliance Certification', 'Certificate of Analysis (CoA) per SKU'],
    description: 'Dietary ingestible supplements, performance powders, and functional food products.',
  },
  {
    mcc: '4722',
    category: 'Travel & Hospitality',
    title: 'Travel Agencies and Tour Operators',
    mandatoryReservePercent: 10,
    mandatoryReserveDays: 120,
    requiredLicenses: ['Seller of Travel Registration (where applicable)', 'Surety Bond Documentation'],
    description: 'Pre-paid travel arrangements, scheduled tour packages, and vacation booking systems.',
  },
  {
    mcc: '7322',
    category: 'Debt Collection',
    title: 'Adjustment and Collection Agencies',
    mandatoryReservePercent: 10,
    mandatoryReserveDays: 90,
    requiredLicenses: ['State Debt Collection License', 'Fair Debt Collection Practices Act (FDCPA) Policy'],
    description: 'Consumer and commercial debt recovery and accounts receivable servicing.',
  },
];

/**
 * Validates merchant MCC code against Prohibited & Restricted catalogs.
 */
export function validateMerchantMccEligibility(
  mcc: string,
  businessCategory?: string
): MccEligibilityResult {
  const normalizedMcc = mcc.trim();

  // Check prohibited catalog
  const prohibitedMatch = PROHIBITED_MCC_CATALOG.find((item) => item.mcc === normalizedMcc);
  if (prohibitedMatch) {
    return {
      mcc: normalizedMcc,
      eligible: false,
      status: 'PROHIBITED',
      rejectionCode: 'MCC_PROHIBITED_VIOLATION',
      reasons: [
        `MCC ${normalizedMcc} (${prohibitedMatch.category}) is strictly prohibited: ${prohibitedMatch.description}`,
        `Governing Rule: ${prohibitedMatch.ruleReference}`,
      ],
      requiredDocumentation: [],
    };
  }

  // Check restricted catalog
  const restrictedMatch = RESTRICTED_MCC_CATALOG.find((item) => item.mcc === normalizedMcc);
  if (restrictedMatch) {
    return {
      mcc: normalizedMcc,
      eligible: true,
      status: 'RESTRICTED',
      reasons: [
        `MCC ${normalizedMcc} (${restrictedMatch.category}) is classified as a Restricted High-Risk Industry.`,
        `Subject to mandatory ${restrictedMatch.mandatoryReservePercent}% rolling reserve held for ${restrictedMatch.mandatoryReserveDays} calendar days.`,
      ],
      mandatoryReservePercent: restrictedMatch.mandatoryReservePercent,
      mandatoryReserveDays: restrictedMatch.mandatoryReserveDays,
      requiredDocumentation: restrictedMatch.requiredLicenses,
    };
  }

  // Standard Commercial MCC
  return {
    mcc: normalizedMcc,
    eligible: true,
    status: 'STANDARD',
    reasons: ['MCC is approved for standard commercial merchant onboarding.'],
    requiredDocumentation: ['Certificate of Good Standing', 'Government Photo ID of UBOs'],
  };
}
