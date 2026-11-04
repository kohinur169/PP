// path: lib/auth/index.ts
export * from './types';
export * from './supabase';
export * from './session-types';
export * from './fingerprint';
export * from './session';
export * from './step-up-types';
export * from './step-up';
export * from './totp-types';
export * from './totp';
export {
  generatePlainBackupCode,
  generateBackupCodesList,
  normalizeBackupCode,
  hashBackupCode,
  verifyBackupCodeHash,
  generateBackupCodes,
  verifyAndConsumeBackupCode as verifyAndConsumeDbBackupCode,
  verifyAndConsumeUserBackupCode,
  regenerateBackupCodes,
  getActiveBackupCodesCount,
  BACKUP_CODE_LENGTH,
  DEFAULT_BACKUP_CODES_COUNT,
} from './backup-codes';
export type { BackupCodesOptions } from './backup-codes';
export * from './middleware';
export * from './rbac-types';
export * from './rbac';
