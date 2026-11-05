// path: lib/import/csv.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';

export interface CsvClientRecord {
  id: string;
  name: string;
  email: string;
  phone?: string | undefined;
  country: string;
}

export interface CsvProductRecord {
  id: string;
  title: string;
  description?: string | undefined;
  priceUsd: string;
  sku: string;
}

export interface CsvRowFailure {
  rowNumber: number;
  rawRow: Record<string, string>;
  errors: string[];
}

export interface CsvImportResult<T> {
  totalRows: number;
  successfulCount: number;
  failedCount: number;
  validRecords: T[];
  failedRows: CsvRowFailure[];
  errorReportCsv: string;
}

/**
 * Parses raw CSV text into array of object records.
 */
export function parseRawCsvText(csvText: string): Record<string, string>[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    const rowObj: Record<string, string> = {};
    headers.forEach((header, index) => {
      rowObj[header] = values[index] ?? '';
    });
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Step 200: Bulk Client CSV Importer with Row Error Reporting
 */
export function importClientsFromCsv(csvText: string): CsvImportResult<CsvClientRecord> {
  const parsedRows = parseRawCsvText(csvText);
  const validRecords: CsvClientRecord[] = [];
  const failedRows: CsvRowFailure[] = [];

  parsedRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // +1 for 0-index, +1 for header line
    const rowErrors: string[] = [];

    const name = row['name']?.trim() ?? '';
    const email = row['email']?.trim().toLowerCase() ?? '';
    const country = row['country']?.trim().toUpperCase() ?? '';

    if (!name || name.length < 2) {
      rowErrors.push('Name is required (minimum 2 characters)');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      rowErrors.push('Valid email address is required');
    }

    if (!country || country.length !== 2) {
      rowErrors.push('Valid 2-letter ISO country code is required');
    }

    if (rowErrors.length > 0) {
      failedRows.push({ rowNumber, rawRow: row, errors: rowErrors });
    } else {
      validRecords.push({
        id: generateUuidV7(),
        name,
        email,
        phone: row['phone']?.trim(),
        country,
      });
    }
  });

  const errorReportCsv = generateErrorReportCsv(failedRows);

  logger.info('Bulk client CSV import completed', {
    totalRows: parsedRows.length,
    successful: validRecords.length,
    failed: failedRows.length,
  });

  return {
    totalRows: parsedRows.length,
    successfulCount: validRecords.length,
    failedCount: failedRows.length,
    validRecords,
    failedRows,
    errorReportCsv,
  };
}

/**
 * Step 200: Bulk Product Catalog CSV Importer with Row Error Reporting
 */
export function importProductsFromCsv(csvText: string): CsvImportResult<CsvProductRecord> {
  const parsedRows = parseRawCsvText(csvText);
  const validRecords: CsvProductRecord[] = [];
  const failedRows: CsvRowFailure[] = [];

  parsedRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const rowErrors: string[] = [];

    const title = row['title']?.trim() ?? '';
    const priceStr = row['price_usd']?.trim() ?? row['price']?.trim() ?? '';
    const sku = row['sku']?.trim() ?? '';

    if (!title) {
      rowErrors.push('Product title is required');
    }

    const priceNum = Number(priceStr);
    if (!priceStr || isNaN(priceNum) || priceNum < 0) {
      rowErrors.push('Valid positive numeric price is required');
    }

    if (!sku) {
      rowErrors.push('Product SKU is required');
    }

    if (rowErrors.length > 0) {
      failedRows.push({ rowNumber, rawRow: row, errors: rowErrors });
    } else {
      validRecords.push({
        id: generateUuidV7(),
        title,
        description: row['description']?.trim(),
        priceUsd: Number(priceStr).toFixed(4),
        sku,
      });
    }
  });

  const errorReportCsv = generateErrorReportCsv(failedRows);

  return {
    totalRows: parsedRows.length,
    successfulCount: validRecords.length,
    failedCount: failedRows.length,
    validRecords,
    failedRows,
    errorReportCsv,
  };
}

function generateErrorReportCsv(failedRows: CsvRowFailure[]): string {
  if (failedRows.length === 0) return '';

  const sampleRow = failedRows[0].rawRow;
  const originalHeaders = Object.keys(sampleRow);
  const headers = ['row_number', ...originalHeaders, 'error_reasons'];

  const lines = [headers.join(',')];

  for (const failure of failedRows) {
    const rowValues = originalHeaders.map((h) => `"${(failure.rawRow[h] ?? '').replace(/"/g, '""')}"`);
    const reasons = `"${failure.errors.join('; ').replace(/"/g, '""')}"`;
    lines.push([failure.rowNumber, ...rowValues, reasons].join(','));
  }

  return lines.join('\n');
}
