// path: lib/auth/step-up-types.ts

export type SensitiveActionType =
  | 'MODIFY_BANK_ACCOUNT'
  | 'UPDATE_PAYOUT_ROUTING'
  | 'REVOKE_API_KEY'
  | 'GENERATE_SECRET_KEY'
  | 'ALTER_RISK_TIER'
  | 'FREEZE_PAYOUTS'
  | 'TRANSFER_OWNERSHIP'
  | 'ROTATE_WEBHOOK_SECRET'
  | 'UNLOCK_USER_ACCOUNT'
  | 'RESET_USER_2FA';

export const SENSITIVE_ACTION_DESCRIPTIONS: Record<SensitiveActionType, string> = {
  MODIFY_BANK_ACCOUNT: 'Modifying settlement bank account details',
  UPDATE_PAYOUT_ROUTING: 'Modifying automated payout routing configuration',
  REVOKE_API_KEY: 'Revoking live API key or gateway credentials',
  GENERATE_SECRET_KEY: 'Generating new production secret API credentials',
  ALTER_RISK_TIER: 'Modifying merchant risk tier or rolling reserve percentage',
  FREEZE_PAYOUTS: 'Placing administrative hold on merchant settlement disbursements',
  TRANSFER_OWNERSHIP: 'Transferring tenant ownership to another user',
  ROTATE_WEBHOOK_SECRET: 'Rotating payment gateway webhook verification secrets',
  UNLOCK_USER_ACCOUNT: 'Administrative unlock of a security-locked user account',
  RESET_USER_2FA: 'Administrative reset of user two-factor authentication credentials',
};

export interface ReauthTicket {
  id: string;
  userId: string;
  action: SensitiveActionType;
  verifiedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface StepUpChallenge {
  challengeRequired: true;
  action: SensitiveActionType;
  description: string;
  challengeType: 'PASSWORD' | 'TOTP';
  message: string;
}

export interface StepUpVerificationResult {
  success: boolean;
  ticket?: ReauthTicket | undefined;
  error?: string | undefined;
  challengeRequired?: boolean | undefined;
}

export interface StepUpGuardParams {
  userId: string;
  action: SensitiveActionType;
  ticketId?: string | undefined;
}

export type StepUpGuardResult<T> =
  | { success: true; data: T }
  | { success: false; challengeRequired: true; action: SensitiveActionType; message: string };
