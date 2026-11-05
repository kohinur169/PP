// path: tests/settlement/clearing-file-generator.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateNachaFile,
  generateIso20022Xml,
  getClearingFile,
  resetClearingFilesStore,
} from '@/lib/settlement/clearing-file-generator';

describe('NACHA (ACH) & ISO 20022 XML Clearing File Generator (Step 176)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const batchId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    resetClearingFilesStore();
  });

  describe('NACHA Fixed-Width 94-Character ACH File', () => {
    it('generates valid NACHA file where all lines are exactly 94 chars and total lines is multiple of 10', async () => {
      const file = await generateNachaFile({
        tenantId,
        batchId,
        immediateDestination: ' 121000358',
        immediateOrigin: '1987654321',
        immediateDestinationName: 'FEDERAL RESERVE BANK',
        immediateOriginName: 'PAYFAC PLATFORM INC',
        companyName: 'PAYFAC PLATFORM',
        companyId: '1987654321',
        entries: [
          {
            receivingRouting: '121000358',
            accountNumber: '9876543210',
            accountType: 'checking',
            amountCents: 150000, // $1,500.00
            individualId: 'MERCHANT-001',
            individualName: 'Acme Merchant LLC',
          },
          {
            receivingRouting: '021000021',
            accountNumber: '1122334455',
            accountType: 'savings',
            amountCents: 225050, // $2,250.50
            individualId: 'MERCHANT-002',
            individualName: 'Beta Retail Corp',
          },
        ],
      });

      expect(file.fileFormat).toBe('nacha');
      expect(file.entryCount).toBe(2);
      expect(file.totalCreditAmount).toBe(3750.5);

      const lines = file.fileContent.split('\n');

      // Rule 1: Every line must be exactly 94 characters
      for (let i = 0; i < lines.length; i++) {
        expect(lines[i]!.length, `Line ${i + 1} length`).toBe(94);
      }

      // Rule 2: Blocking factor 10 (Total line count must be multiple of 10)
      expect(lines.length % 10).toBe(0);

      // Rule 3: Record type identifiers
      expect(lines[0]!.startsWith('101')).toBe(true); // File Header
      expect(lines[1]!.startsWith('5220')).toBe(true); // Batch Header (Credits only)
      expect(lines[2]!.startsWith('622')).toBe(true); // Checking Credit (transCode 22)
      expect(lines[3]!.startsWith('632')).toBe(true); // Savings Credit (transCode 32)
      expect(lines[4]!.startsWith('8220')).toBe(true); // Batch Control
      expect(lines[5]!.startsWith('9000001')).toBe(true); // File Control
      expect(lines[6]!.startsWith('99999999')).toBe(true); // Block padding 9s
    });
  });

  describe('ISO 20022 XML (pain.001.001.03) Customer Credit Transfer', () => {
    it('generates valid SEPA credit transfer initiation XML with Group Header and Payment Info', async () => {
      const file = await generateIso20022Xml({
        tenantId,
        batchId,
        msgId: 'MSG-20261105-001',
        initiatingPartyName: 'PayFac Platform Europe',
        debtorName: 'PayFac Clearing Holding',
        debtorIban: 'DE89370400440532013000',
        debtorBic: 'DEUTDEDDFXX',
        executionDate: '2026-11-06',
        entries: [
          {
            endToEndId: 'PAYOUT-E2E-001',
            amount: 4500.0,
            currency: 'EUR',
            creditorName: 'Euro Logistics GmbH',
            creditorIban: 'DE12500105170648489890',
            creditorBic: 'DBEUMM2LXXX',
            remittanceInfo: 'Payout settlement batch #20261105',
          },
          {
            endToEndId: 'PAYOUT-E2E-002',
            amount: 1850.25,
            currency: 'EUR',
            creditorName: 'Atelier Mode Paris',
            creditorIban: 'FR1420041010050500013M02606',
            remittanceInfo: 'Monthly merchant earnings',
          },
        ],
      });

      expect(file.fileFormat).toBe('iso20022');
      expect(file.entryCount).toBe(2);
      expect(file.totalCreditAmount).toBe(6350.25);

      const xml = file.fileContent;
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<CstmrCdtTrfInitn>');
      expect(xml).toContain('<MsgId>MSG-20261105-001</MsgId>');
      expect(xml).toContain('<NbOfTxs>2</NbOfTxs>');
      expect(xml).toContain('<CtrlSum>6350.25</CtrlSum>');
      expect(xml).toContain('<Cd>SEPA</Cd>');
      expect(xml).toContain('<ReqdExctnDt>2026-11-06</ReqdExctnDt>');
      expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
      expect(xml).toContain('<EndToEndId>PAYOUT-E2E-001</EndToEndId>');
      expect(xml).toContain('<InstdAmt Ccy="EUR">4500.00</InstdAmt>');
      expect(xml).toContain('<EndToEndId>PAYOUT-E2E-002</EndToEndId>');
      expect(xml).toContain('<InstdAmt Ccy="EUR">1850.25</InstdAmt>');
    });
  });
});
