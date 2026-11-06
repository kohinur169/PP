// path: tests/compliance/pep.test.ts

import { describe, it, expect } from 'vitest';
import {
  evaluateIndividualForPepAndMedia,
  createPepScreeningCase,
  submitComplianceOfficerEddRecommendation,
  submitCeoExecutiveApproval,
  rejectPepScreeningCase,
  isMerchantPepActivationGated,
} from '@/lib/compliance/pep';

describe('Step 104: PEP & Adverse Media Screening Engine with Enhanced Due Diligence (EDD)', () => {
  it('Step 104.1: detects senior government official as Tier 1 PEP requiring mandatory EDD', () => {
    const evalRes = evaluateIndividualForPepAndMedia('Gabriel Santiago Moreno');

    expect(evalRes.isPepHit).toBe(true);
    expect(evalRes.pepTier).toBe(1);
    expect(evalRes.pepPosition).toContain('Minister');
    expect(evalRes.requiresEdd).toBe(true);
    expect(evalRes.similarityScore).toBeGreaterThanOrEqual(0.85);
  });

  it('Step 104.2: detects military leadership PEP with associated corruption adverse media', () => {
    const evalRes = evaluateIndividualForPepAndMedia('General Tariq Mansoor');

    expect(evalRes.isPepHit).toBe(true);
    expect(evalRes.pepTier).toBe(2);
    expect(evalRes.hasAdverseMedia).toBe(true);
    expect(evalRes.adverseMediaCategories).toContain('corruption');
    expect(evalRes.requiresEdd).toBe(true);
  });

  it('Step 104.3: clears legitimate commercial merchant with zero PEP or adverse media signals', () => {
    const evalRes = evaluateIndividualForPepAndMedia('Liam Patrick Gallagher');

    expect(evalRes.isPepHit).toBe(false);
    expect(evalRes.hasAdverseMedia).toBe(false);
    expect(evalRes.requiresEdd).toBe(false);
    expect(evalRes.pepTier).toBeUndefined();
  });

  it('Step 104.4: creates PEP case in pending_edd state and blocks merchant activation', () => {
    const evalRes = evaluateIndividualForPepAndMedia('Elena Ivanova');
    const caseRecord = createPepScreeningCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      individualName: 'Elena Ivanova',
      role: 'ubo',
      evaluation: evalRes,
    });

    expect(caseRecord.status).toBe('pending_edd');
    expect(caseRecord.pepTier).toBe(3);

    const gate = isMerchantPepActivationGated([caseRecord]);
    expect(gate.isBlocked).toBe(true);
    expect(gate.reason).toContain('Pending Enhanced Due Diligence');
  });

  it('Step 104.5: enforces mandatory Source of Wealth & Funds documentation for compliance officer EDD recommendation', () => {
    const evalRes = evaluateIndividualForPepAndMedia('Gabriel Santiago Moreno');
    const initialCase = createPepScreeningCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      individualName: 'Gabriel Santiago Moreno',
      role: 'ubo',
      evaluation: evalRes,
    });

    // Fails on inadequate Source of Wealth
    expect(() =>
      submitComplianceOfficerEddRecommendation({
        caseRecord: initialCase,
        complianceOfficerId: 'officer_elena_01',
        sourceOfWealth: 'Inheritance', // too short (< 15 chars)
        sourceOfFunds: 'Verified bank accounts from Bancolombia.',
        complianceRationale: 'Sufficient wealth verified through certified bank letter.',
      })
    ).toThrow('Source of Wealth');

    // Successfully recommends with full documentation
    const recommendedCase = submitComplianceOfficerEddRecommendation({
      caseRecord: initialCase,
      complianceOfficerId: 'officer_elena_01',
      sourceOfWealth: 'Verified commercial real estate holdings and inheritance from family estate.',
      sourceOfFunds: 'Commercial dividend distributions from Bogota holding company account.',
      complianceRationale: 'Low corruption risk, no adverse media, ongoing transaction volume monitoring mandated.',
    });

    expect(recommendedCase.status).toBe('compliance_recommended');
    expect(recommendedCase.complianceOfficerId).toBe('officer_elena_01');

    // Merchant activation remains blocked awaiting CEO sign-off
    const gate = isMerchantPepActivationGated([recommendedCase]);
    expect(gate.isBlocked).toBe(true);
    expect(gate.reason).toContain('CEO Executive Sign-Off');
  });

  it('Step 104.6: enforces dual sign-off protocol: CEO cannot approve before Compliance Officer recommendation', () => {
    const evalRes = evaluateIndividualForPepAndMedia('Gabriel Santiago Moreno');
    const initialCase = createPepScreeningCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      individualName: 'Gabriel Santiago Moreno',
      role: 'ubo',
      evaluation: evalRes,
    });

    // CEO attempts premature approval before compliance officer review
    expect(() =>
      submitCeoExecutiveApproval({
        caseRecord: initialCase, // status: 'pending_edd'
        ceoUserId: 'ceo_alex_01',
      })
    ).toThrow(/Executive approval rejected.*compliance_recommended/);
  });

  it('Step 104.7: completes dual sign-off upon CEO approval and unblocks merchant activation', () => {
    const evalRes = evaluateIndividualForPepAndMedia('Gabriel Santiago Moreno');
    const initialCase = createPepScreeningCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      individualName: 'Gabriel Santiago Moreno',
      role: 'ubo',
      evaluation: evalRes,
    });

    const recommendedCase = submitComplianceOfficerEddRecommendation({
      caseRecord: initialCase,
      complianceOfficerId: 'officer_elena_01',
      sourceOfWealth: 'Verified commercial real estate holdings and inheritance from family estate.',
      sourceOfFunds: 'Commercial dividend distributions from Bogota holding company account.',
      complianceRationale: 'Low corruption risk, no adverse media, ongoing transaction volume monitoring mandated.',
    });

    const approvedCase = submitCeoExecutiveApproval({
      caseRecord: recommendedCase,
      ceoUserId: 'ceo_alex_01',
    });

    expect(approvedCase.status).toBe('ceo_approved');
    expect(approvedCase.ceoApproverId).toBe('ceo_alex_01');

    const gate = isMerchantPepActivationGated([approvedCase]);
    expect(gate.isBlocked).toBe(false);
  });

  it('Step 104.8: permanently blocks merchant activation when PEP case is rejected', () => {
    const evalRes = evaluateIndividualForPepAndMedia('Arthur Pendelton Sterling');
    const initialCase = createPepScreeningCase({
      tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      individualName: 'Arthur Pendelton Sterling',
      role: 'ubo',
      evaluation: evalRes,
    });

    const rejectedCase = rejectPepScreeningCase({
      caseRecord: initialCase,
      reviewerUserId: 'officer_marcus_01',
      rejectionReason: 'Active tax evasion indictment and unexplained cash influxes.',
    });

    expect(rejectedCase.status).toBe('rejected');

    const gate = isMerchantPepActivationGated([rejectedCase]);
    expect(gate.isBlocked).toBe(true);
    expect(gate.reason).toContain('rejected by compliance');
  });
});
