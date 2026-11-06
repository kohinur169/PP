// path: lib/constants/mcc.ts

export type MccRiskTier = 1 | 2 | 3;

export interface Iso18245MccItem {
  code: string;
  title: string;
  category: string;
  description: string;
  riskTier: MccRiskTier;
  isProhibited: boolean;
  isRestricted: boolean;
  baselineReservePercent: number;
  reserveHoldDays: number;
  payoutDelayDays: number;
  regulatoryReference?: string;
}

export interface MccClassificationResult {
  mcc: string;
  title: string;
  category: string;
  riskTier: MccRiskTier;
  isProhibited: boolean;
  isRestricted: boolean;
  baselineReservePercent: number;
  reserveHoldDays: number;
  payoutDelayDays: number;
  explanation: string;
  status: 'ELIGIBLE_STANDARD' | 'ELIGIBLE_RESTRICTED_RESERVE' | 'PROHIBITED_VIOLATION';
}

export const ISO_18245_MCC_CATALOG: Iso18245MccItem[] = [
  // --- Low Risk (Tier 3) ---
  {
    code: '5734',
    title: 'Computer Software Stores',
    category: 'SaaS & Digital Goods',
    description: 'Downloadable digital software, cloud applications, and software subscriptions.',
    riskTier: 3,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 0,
    reserveHoldDays: 0,
    payoutDelayDays: 2,
  },
  {
    code: '7372',
    title: 'Computer Programming, Data Processing, and Integrated Systems',
    category: 'SaaS & Technology',
    description: 'Enterprise API integration, database hosting, and custom cloud architecture.',
    riskTier: 3,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 0,
    reserveHoldDays: 0,
    payoutDelayDays: 2,
  },
  {
    code: '7392',
    title: 'Management, Consulting, and Public Relations Services',
    category: 'Professional Services',
    description: 'Corporate strategic advisory, economic analysis, and marketing consultancy.',
    riskTier: 3,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 0,
    reserveHoldDays: 0,
    payoutDelayDays: 2,
  },
  {
    code: '5942',
    title: 'Book Stores',
    category: 'Publishing & Media',
    description: 'Digital e-books, physical literature, educational texts, and periodicals.',
    riskTier: 3,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 0,
    reserveHoldDays: 0,
    payoutDelayDays: 2,
  },

  // --- Medium Risk (Tier 2) ---
  {
    code: '5311',
    title: 'Department Stores',
    category: 'General Retail',
    description: 'Multi-category consumer retail merchandising with physical distribution.',
    riskTier: 2,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 5,
    reserveHoldDays: 60,
    payoutDelayDays: 3,
  },
  {
    code: '5651',
    title: 'Family Clothing Stores',
    category: 'Apparel & Fashion',
    description: 'Consumer apparel, footwear, and accessory retail with standard return policies.',
    riskTier: 2,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 5,
    reserveHoldDays: 60,
    payoutDelayDays: 3,
  },
  {
    code: '5732',
    title: 'Electronic Sales',
    category: 'Consumer Electronics',
    description: 'Consumer hardware, mobile devices, audio components, and computing peripherals.',
    riskTier: 2,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 5,
    reserveHoldDays: 60,
    payoutDelayDays: 3,
  },
  {
    code: '5964',
    title: 'Direct Marketing - Catalog Merchant',
    category: 'E-Commerce Direct',
    description: 'Direct-to-consumer e-commerce checkout with postal package fulfillment.',
    riskTier: 2,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: 5,
    reserveHoldDays: 60,
    payoutDelayDays: 3,
  },

  // --- High Risk / Restricted (Tier 1) ---
  {
    code: '4722',
    title: 'Travel Agencies and Tour Operators',
    category: 'Travel & Hospitality',
    description: 'Scheduled vacation bookings, cruise packages, and future passenger transit.',
    riskTier: 1,
    isProhibited: false,
    isRestricted: true,
    baselineReservePercent: 10,
    reserveHoldDays: 120,
    payoutDelayDays: 7,
    regulatoryReference: 'Seller of Travel Bonding Regulations & Card Network Extended Fulfillment Horizon',
  },
  {
    code: '5122',
    title: 'Drugs, Proprietaries, and Sundries (Telemedicine / Pharmacy)',
    category: 'Pharmaceuticals & Health',
    description: 'Licensed prescription fulfillment, remote doctor consultations, and health products.',
    riskTier: 1,
    isProhibited: false,
    isRestricted: true,
    baselineReservePercent: 10,
    reserveHoldDays: 90,
    payoutDelayDays: 7,
    regulatoryReference: 'NABP Digital Pharmacy Accreditation & DEA Schedule Compliance',
  },
  {
    code: '5499',
    title: 'Miscellaneous Food Stores - Specialty Diet, Health Supplements',
    category: 'Nutraceuticals',
    description: 'Ingestible dietary supplements, protein extracts, and functional botanicals.',
    riskTier: 1,
    isProhibited: false,
    isRestricted: true,
    baselineReservePercent: 10,
    reserveHoldDays: 90,
    payoutDelayDays: 7,
    regulatoryReference: 'FDA cGMP Standards & Independent Certificate of Analysis Verification',
  },
  {
    code: '7322',
    title: 'Adjustment and Collection Agencies',
    category: 'Financial Recovery',
    description: 'Accounts receivable recovery, commercial debt adjustment, and credit remediation.',
    riskTier: 1,
    isProhibited: false,
    isRestricted: true,
    baselineReservePercent: 10,
    reserveHoldDays: 90,
    payoutDelayDays: 7,
    regulatoryReference: 'Fair Debt Collection Practices Act (FDCPA) & State Licensing',
  },

  // --- Strictly Prohibited ---
  {
    code: '5967',
    title: 'Direct Marketing - Inbound Telemarketing Adult Entertainment / Services',
    category: 'Adult Content',
    description: 'Sexually explicit adult media, webcam streaming, and escort facilitation.',
    riskTier: 1,
    isProhibited: true,
    isRestricted: false,
    baselineReservePercent: 100,
    reserveHoldDays: 365,
    payoutDelayDays: 0,
    regulatoryReference: 'Mastercard BRAM Section 5.1 & Visa High-Risk Brand Program',
  },
  {
    code: '7273',
    title: 'Dating and Escort Services',
    category: 'Adult Content',
    description: 'Explicit matchmaking, commercial escort services, and adult personals.',
    riskTier: 1,
    isProhibited: true,
    isRestricted: false,
    baselineReservePercent: 100,
    reserveHoldDays: 365,
    payoutDelayDays: 0,
    regulatoryReference: 'Visa Core Rules Section 2.1.4',
  },
  {
    code: '7995',
    title: 'Betting, including Lottery Tickets, Casino Gaming Chips, Off-Track Betting',
    category: 'Gambling & Betting',
    description: 'Online sports wagering, virtual casino chips, and internet poker rooms.',
    riskTier: 1,
    isProhibited: true,
    isRestricted: false,
    baselineReservePercent: 100,
    reserveHoldDays: 365,
    payoutDelayDays: 0,
    regulatoryReference: 'Unlawful Internet Gambling Enforcement Act (UIGEA) 31 U.S.C. § 5361',
  },
  {
    code: '6051',
    title: 'Non-Financial Institutions - Foreign Currency, Crypto Mixers, Money Orders',
    category: 'Unregulated Financial Services',
    description: 'Cryptocurrency tumblers, peer-to-peer hawala networks, and unregulated currency exchange.',
    riskTier: 1,
    isProhibited: true,
    isRestricted: false,
    baselineReservePercent: 100,
    reserveHoldDays: 365,
    payoutDelayDays: 0,
    regulatoryReference: 'FinCEN MSB Guidelines 31 CFR § 1010.100',
  },
  {
    code: '5968',
    title: 'Direct Marketing - Continuity / Subscription Multi-Level Marketing',
    category: 'Deceptive Marketing',
    description: 'Multi-level marketing (MLM), pyramid structures, and negative option subscription billing.',
    riskTier: 1,
    isProhibited: true,
    isRestricted: false,
    baselineReservePercent: 100,
    reserveHoldDays: 365,
    payoutDelayDays: 0,
    regulatoryReference: 'FTC Restore Online Shoppers Confidence Act 15 U.S.C. § 8401',
  },
];

/**
 * Classifies an MCC code according to platform risk tiers and reserve rules.
 */
export function classifyMccRisk(mcc: string): MccClassificationResult {
  const normalizedMcc = mcc.trim();
  const match = ISO_18245_MCC_CATALOG.find((item) => item.code === normalizedMcc);

  if (!match) {
    // Uncatalogued commercial MCC defaults to Tier 2 (Standard Medium Risk)
    return {
      mcc: normalizedMcc,
      title: 'General Commercial Merchant',
      category: 'Unclassified Commercial',
      riskTier: 2,
      isProhibited: false,
      isRestricted: false,
      baselineReservePercent: 5,
      reserveHoldDays: 60,
      payoutDelayDays: 3,
      explanation: 'MCC is not in the specialized catalog; assigned baseline Tier 2 commercial underwriting parameters.',
      status: 'ELIGIBLE_STANDARD',
    };
  }

  if (match.isProhibited) {
    return {
      mcc: match.code,
      title: match.title,
      category: match.category,
      riskTier: 1,
      isProhibited: true,
      isRestricted: false,
      baselineReservePercent: 100,
      reserveHoldDays: 365,
      payoutDelayDays: 0,
      explanation: `PROHIBITED: MCC ${match.code} (${match.title}) is barred from platform onboarding under ${match.regulatoryReference ?? 'card brand mandates'}.`,
      status: 'PROHIBITED_VIOLATION',
    };
  }

  if (match.isRestricted) {
    return {
      mcc: match.code,
      title: match.title,
      category: match.category,
      riskTier: match.riskTier,
      isProhibited: false,
      isRestricted: true,
      baselineReservePercent: match.baselineReservePercent,
      reserveHoldDays: match.reserveHoldDays,
      payoutDelayDays: match.payoutDelayDays,
      explanation: `RESTRICTED HIGH-RISK: Subject to mandatory ${match.baselineReservePercent}% rolling reserve for ${match.reserveHoldDays} days and T+${match.payoutDelayDays} settlement cycle.`,
      status: 'ELIGIBLE_RESTRICTED_RESERVE',
    };
  }

  return {
    mcc: match.code,
    title: match.title,
    category: match.category,
    riskTier: match.riskTier,
    isProhibited: false,
    isRestricted: false,
    baselineReservePercent: match.baselineReservePercent,
    reserveHoldDays: match.reserveHoldDays,
    payoutDelayDays: match.payoutDelayDays,
    explanation: `APPROVED: MCC ${match.code} (${match.title}) is approved for standard commercial onboarding at Tier ${match.riskTier}.`,
    status: 'ELIGIBLE_STANDARD',
  };
}

/**
 * Searches and filters the ISO 18245 MCC catalog.
 */
export function searchMccCatalog(
  query: string,
  filter: 'ALL' | 'PROHIBITED' | 'RESTRICTED' | 'STANDARD' = 'ALL'
): Iso18245MccItem[] {
  const q = query.toLowerCase().trim();

  return ISO_18245_MCC_CATALOG.filter((item) => {
    if (filter === 'PROHIBITED' && !item.isProhibited) return false;
    if (filter === 'RESTRICTED' && !item.isRestricted) return false;
    if (filter === 'STANDARD' && (item.isProhibited || item.isRestricted)) return false;

    if (!q) return true;

    return (
      item.code.includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });
}
