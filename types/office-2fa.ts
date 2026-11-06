// path: types/office-2fa.ts

import type { BaseEntity } from './entity';

export type Office2faResetStatus = 'pending' | 'approved' | 'rejected';

/**
 * Persisted administrative 2FA reset request record.
 * Tracks email ticket ID, user identity, submitted verification document IDs, and review decision.
 */
export interface Office2faResetRequestEntity extends BaseEntity {
  user_id: string;
  ticket_id: string;
  verification_docs: string[];
  reviewed_by: string | null;
  status: Office2faResetStatus;
  rejection_reason: string | null;
  approved_at: string | null;
}

/**
 * Input fields for creating a new office 2FA reset ticket.
 */
export interface CreateOffice2faResetInput {
  user_id: string;
  ticket_id: string;
  verification_docs: string[];
  company_id?: string | undefined;
}
