// path: lib/settlement/clearing-file-generator.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export interface NachaEntryCandidate {
  receivingRouting: string; // 9 digits
  accountNumber: string;
  accountType: 'checking' | 'savings';
  amountCents: number;
  individualId: string;
  individualName: string;
}

export interface NachaFileParams {
  tenantId: string;
  batchId: string;
  immediateDestination: string; // 9 or 10 digits
  immediateOrigin: string; // 10 digits Fed Tax ID
  immediateDestinationName: string;
  immediateOriginName: string;
  companyName: string;
  companyId: string;
  entries: NachaEntryCandidate[];
}

export interface Iso20022EntryCandidate {
  endToEndId: string;
  amount: number;
  currency: string;
  creditorName: string;
  creditorIban: string;
  creditorBic?: string | undefined;
  remittanceInfo: string;
}

export interface Iso20022FileParams {
  tenantId: string;
  batchId: string;
  msgId: string;
  initiatingPartyName: string;
  debtorName: string;
  debtorIban: string;
  debtorBic: string;
  executionDate: string; // YYYY-MM-DD
  entries: Iso20022EntryCandidate[];
}

export interface ClearingFileRecord {
  id: string;
  tenantId: string;
  batchId: string;
  fileFormat: 'nacha' | 'iso20022';
  fileReference: string;
  fileContent: string;
  totalCreditAmount: number;
  entryCount: number;
  status: 'generated' | 'transmitted' | 'acknowledged' | 'rejected';
  createdAt: string;
}

const clearingFilesStore = new Map<string, ClearingFileRecord>();
const auditRepo = new AuditLogRepository();

function padRight(str: string, length: number, char = ' '): string {
  const s = str.substring(0, length);
  return s + char.repeat(Math.max(0, length - s.length));
}

function padLeft(str: string, length: number, char = '0'): string {
  const s = str.substring(0, length);
  return char.repeat(Math.max(0, length - s.length)) + s;
}

/**
 * Step 176.1: Generates strict NACHA 94-character fixed-width ACH file.
 * Section 29: "Exportable NACHA (ACH) and ISO 20022 XML payout files."
 */
export async function generateNachaFile(params: NachaFileParams): Promise<ClearingFileRecord> {
  const fileRef = `NACHA-${generateUuidV7().slice(-8).toUpperCase()}`;
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const timeStr = `${padLeft(now.getHours().toString(), 2)}${padLeft(now.getMinutes().toString(), 2)}`; // HHMM

  const lines: string[] = [];

  // File Header Record (Type 1) - 94 characters
  const dest = padLeft(params.immediateDestination.trim(), 10, ' ');
  const origin = padLeft(params.immediateOrigin.trim(), 10, ' ');
  const destName = padRight(params.immediateDestinationName, 23);
  const origName = padRight(params.immediateOriginName, 23);
  const refCode = padRight(fileRef.slice(0, 8), 8);

  const header = `101${dest}${origin}${dateStr}${timeStr}A094101${destName}${origName}${refCode}`;
  lines.push(padRight(header, 94));

  // Batch Header Record (Type 5) - 94 characters
  const compName = padRight(params.companyName, 16);
  const compId = padRight(params.companyId, 10);
  const effDate = dateStr;
  const origDfi = padLeft(params.immediateOrigin.slice(0, 8), 8);

  const batchHeader = `5220${compName}                ${compId}PPDCCD PAYOUT${dateStr}${effDate}   1${origDfi}0000001`;
  lines.push(padRight(batchHeader, 94));

  let totalCreditCents = 0;
  let entryHashSum = 0;
  let traceNum = 1;

  // Entry Detail Records (Type 6) - 94 characters each
  for (const entry of params.entries) {
    const transCode = entry.accountType === 'savings' ? '32' : '22'; // 22 Checking credit, 32 Savings credit
    const routing8 = entry.receivingRouting.slice(0, 8);
    const checkDigit = entry.receivingRouting.slice(8, 9);
    const acctNum = padRight(entry.accountNumber, 17);
    const amountStr = padLeft(entry.amountCents.toString(), 10);
    const idNum = padRight(entry.individualId, 15);
    const name = padRight(entry.individualName, 22);
    const traceStr = padLeft((Number(origDfi) * 10000000 + traceNum).toString(), 15);

    totalCreditCents += entry.amountCents;
    entryHashSum += Number(routing8);
    traceNum++;

    const detail = `6${transCode}${routing8}${checkDigit}${acctNum}${amountStr}${idNum}${name}  0${traceStr}`;
    lines.push(padRight(detail, 94));
  }

  // Batch Control Record (Type 8) - 94 characters
  const entryCountStr = padLeft(params.entries.length.toString(), 6);
  const hashMod = (entryHashSum % 10000000000).toString();
  const entryHashStr = padLeft(hashMod, 10);
  const totalCreditStr = padLeft(totalCreditCents.toString(), 12);

  const batchControl = `8220${entryCountStr}${entryHashStr}000000000000${totalCreditStr}${compId}                         ${origDfi}0000001`;
  lines.push(padRight(batchControl, 94));

  // File Control Record (Type 9) - 94 characters
  const recordsSoFar = lines.length + 1; // plus file control itself
  const blockCount = Math.ceil(recordsSoFar / 10);
  const blockCountStr = padLeft(blockCount.toString(), 6);
  const fileEntryCountStr = padLeft(params.entries.length.toString(), 8);

  const fileControl = `9000001${blockCountStr}${fileEntryCountStr}${entryHashStr}000000000000${totalCreditStr}                                       `;
  lines.push(padRight(fileControl, 94));

  // Block padding with lines of 94 '9's
  const remainder = lines.length % 10;
  if (remainder > 0) {
    const padLines = 10 - remainder;
    for (let i = 0; i < padLines; i++) {
      lines.push('9'.repeat(94));
    }
  }

  const fileContent = lines.join('\n');
  const fileId = generateUuidV7();
  const nowIso = new Date().toISOString();
  const totalCreditUsd = Number((totalCreditCents / 100).toFixed(4));

  const record: ClearingFileRecord = {
    id: fileId,
    tenantId: params.tenantId,
    batchId: params.batchId,
    fileFormat: 'nacha',
    fileReference: fileRef,
    fileContent,
    totalCreditAmount: totalCreditUsd,
    entryCount: params.entries.length,
    status: 'generated',
    createdAt: nowIso,
  };

  clearingFilesStore.set(fileId, record);

  logger.info('NACHA clearing file generated', {
    fileId,
    fileRef,
    entryCount: params.entries.length,
    totalCreditUsd,
    lineCount: lines.length,
  });

  return record;
}

/**
 * Step 176.2: Generates ISO 20022 Customer Credit Transfer Initiation XML (pain.001.001.03).
 */
export async function generateIso20022Xml(params: Iso20022FileParams): Promise<ClearingFileRecord> {
  const fileRef = `ISO20022-${generateUuidV7().slice(-8).toUpperCase()}`;
  const nowIso = new Date().toISOString();
  let totalAmount = 0;

  for (const entry of params.entries) {
    totalAmount += entry.amount;
  }
  const totalAmountStr = totalAmount.toFixed(2);

  const txXmlItems = params.entries
    .map((e) => {
      const bicXml = e.creditorBic
        ? `
        <CdtrAgt>
          <FinInstnId>
            <BIC>${e.creditorBic}</BIC>
          </FinInstnId>
        </CdtrAgt>`
        : '';

      return `
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${e.endToEndId}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${e.currency}">${e.amount.toFixed(2)}</InstdAmt>
        </Amt>${bicXml}
        <Cdtr>
          <Nm>${e.creditorName}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${e.creditorIban.replace(/\s+/g, '')}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${e.remittanceInfo}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
    })
    .join('');

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${params.msgId}</MsgId>
      <CreDtTm>${nowIso}</CreDtTm>
      <NbOfTxs>${params.entries.length}</NbOfTxs>
      <CtrlSum>${totalAmountStr}</CtrlSum>
      <InitgPty>
        <Nm>${params.initiatingPartyName}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-${params.msgId}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${params.executionDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${params.debtorName}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${params.debtorIban.replace(/\s+/g, '')}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${params.debtorBic}</BIC>
        </FinInstnId>
      </DbtrAgt>${txXmlItems}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`.trim();

  const fileId = generateUuidV7();
  const record: ClearingFileRecord = {
    id: fileId,
    tenantId: params.tenantId,
    batchId: params.batchId,
    fileFormat: 'iso20022',
    fileReference: fileRef,
    fileContent: xmlContent,
    totalCreditAmount: Number(totalAmount.toFixed(4)),
    entryCount: params.entries.length,
    status: 'generated',
    createdAt: nowIso,
  };

  clearingFilesStore.set(fileId, record);

  logger.info('ISO 20022 XML clearing file generated', {
    fileId,
    fileRef,
    entryCount: params.entries.length,
    totalCredit: totalAmount,
  });

  return record;
}

export function getClearingFile(id: string): ClearingFileRecord | undefined {
  return clearingFilesStore.get(id);
}

export function resetClearingFilesStore(): void {
  clearingFilesStore.clear();
}
