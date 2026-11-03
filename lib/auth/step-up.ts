// path: lib/auth/step-up.ts
import crypto from 'node:crypto';
import type {
  SensitiveActionType,
  ReauthTicket,
  StepUpChallenge,
  StepUpGuardParams,
  StepUpGuardResult,
} from './step-up-types';
import { SENSITIVE_ACTION_DESCRIPTIONS } from './step-up-types';
import { logger } from '@/lib/logger';

export const REAUTH_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes (300 seconds)

// In-memory ticket registry for ephemeral reauthentication grants
const activeTickets = new Map<string, ReauthTicket>();

/**
 * Issues an ephemeral reauthentication ticket valid for exactly 5 minutes (300 seconds).
 */
export function issueStepUpTicket(
  userId: string,
  action: SensitiveActionType,
  validForMs: number = REAUTH_GRACE_PERIOD_MS
): ReauthTicket {
  const now = Date.now();
  const ticketId = `ticket_${crypto.randomUUID()}`;
  const nonce = crypto.randomBytes(16).toString('hex');

  const ticket: ReauthTicket = {
    id: ticketId,
    userId,
    action,
    verifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + validForMs).toISOString(),
    nonce,
  };

  activeTickets.set(ticketId, ticket);

  logger.info('Step-up reauthentication ticket issued', {
    ticketId,
    userId,
    action,
    validForSeconds: validForMs / 1000,
  });

  return ticket;
}

/**
 * Validates whether an active ticket is valid, matching the requested user and action,
 * and within the 5-minute validity window.
 */
export function verifyStepUpTicket(
  ticketId: string,
  userId: string,
  action: SensitiveActionType,
  currentTime: number = Date.now()
): boolean {
  if (!ticketId) return false;

  const ticket = activeTickets.get(ticketId);
  if (!ticket) return false;

  // Verify ownership
  if (ticket.userId !== userId) {
    logger.warn('Step-up ticket user mismatch', {
      ticketUserId: ticket.userId,
      requestUserId: userId,
    });
    return false;
  }

  // Verify action scope (e.g. payout ticket cannot be used for API key revocation)
  if (ticket.action !== action) {
    logger.warn('Step-up ticket action scope mismatch', {
      ticketAction: ticket.action,
      requestedAction: action,
    });
    return false;
  }

  // Verify 5-minute expiration
  const expiryTime = new Date(ticket.expiresAt).getTime();
  if (currentTime > expiryTime) {
    logger.warn('Step-up ticket expired (>5 minutes)', { ticketId, action });
    activeTickets.delete(ticketId);
    return false;
  }

  return true;
}

/**
 * Consumes and invalidates a step-up ticket, ensuring one-time execution per sensitive action.
 */
export function consumeStepUpTicket(
  ticketId: string,
  userId: string,
  action: SensitiveActionType,
  currentTime: number = Date.now()
): boolean {
  const isValid = verifyStepUpTicket(ticketId, userId, action, currentTime);
  if (!isValid) return false;

  activeTickets.delete(ticketId);
  logger.info('Step-up ticket consumed successfully', { ticketId, userId, action });
  return true;
}

/**
 * Creates a standard Step-Up Challenge descriptor when sensitive action gating is triggered.
 */
export function createStepUpChallenge(action: SensitiveActionType): StepUpChallenge {
  const description = SENSITIVE_ACTION_DESCRIPTIONS[action] ?? action;
  return {
    challengeRequired: true,
    action,
    description,
    challengeType: 'PASSWORD',
    message: `Step-up reauthentication required to perform sensitive operation: ${description}. Please provide password or 2FA credentials.`,
  };
}

/**
 * Server action and API middleware wrapper that intercepts sensitive operations.
 * Requires a valid, non-expired step-up ticket before executing the protected handler.
 */
export async function withStepUpGuard<T>(
  params: StepUpGuardParams,
  handler: () => Promise<T>,
  currentTime: number = Date.now()
): Promise<StepUpGuardResult<T>> {
  if (!params.ticketId) {
    logger.info('Sensitive action invoked without step-up ticket - challenge issued', {
      action: params.action,
      userId: params.userId,
    });

    const challenge = createStepUpChallenge(params.action);
    return {
      success: false,
      challengeRequired: true,
      action: params.action,
      message: challenge.message,
    };
  }

  const isTicketValid = consumeStepUpTicket(
    params.ticketId,
    params.userId,
    params.action,
    currentTime
  );

  if (!isTicketValid) {
    logger.warn('Sensitive action invoked with invalid or expired ticket - challenge issued', {
      action: params.action,
      userId: params.userId,
      ticketId: params.ticketId,
    });

    const challenge = createStepUpChallenge(params.action);
    return {
      success: false,
      challengeRequired: true,
      action: params.action,
      message: challenge.message,
    };
  }

  // Ticket valid and consumed: execute protected sensitive handler
  const result = await handler();
  return {
    success: true,
    data: result,
  };
}

/**
 * Clears active ticket cache (for unit testing isolation).
 */
export function clearStepUpRegistry(): void {
  activeTickets.clear();
}
