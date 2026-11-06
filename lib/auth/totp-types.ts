// path: lib/auth/totp-types.ts

export interface TotpSetupResult {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
  recoveryCodeHashes: string[];
}

export interface TotpVerifyOptions {
  window?: number | undefined;
  timestamp?: number | undefined;
  lastUsedStep?: number | bigint | undefined;
}

export interface TotpVerifyResult {
  valid: boolean;
  step?: number | undefined;
  error?: string | undefined;
}

export interface BackupCodeVerifyResult {
  valid: boolean;
  remainingHashes?: string[] | undefined;
  consumedIndex?: number | undefined;
  error?: string | undefined;
}
