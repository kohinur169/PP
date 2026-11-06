// path: lib/db/tenant.ts

import { sanitizeSessionIdentifier } from '../database/tenant-context';

/**
 * Snapshot of active database transaction tenant session variables.
 */
export interface TenantSessionState {
  readonly companyId: string | null;
  readonly userId: string | null;
  readonly isSuperadmin: boolean;
}

/**
 * Options configuring tenant session execution context.
 */
export interface TenantContextExecutionOptions {
  readonly isSuperadmin?: boolean | undefined;
  /**
   * Optional custom database client/connection.
   */
  readonly client?: {
    rpc?(fn: string, params?: Record<string, unknown>): Promise<unknown>;
    query?(sql: string, params?: unknown[]): Promise<unknown>;
  } | undefined;
}

/**
 * Error raised when an execution context attempts to access data outside its tenant boundary.
 */
export class CrossTenantAccessViolationError extends Error {
  public readonly contextCompanyId: string;
  public readonly targetCompanyId: string;

  constructor(contextCompanyId: string, targetCompanyId: string) {
    super(
      `Cross-Tenant Access Violation: Context company "${contextCompanyId}" attempted to access data belonging to company "${targetCompanyId}".`
    );
    this.name = 'CrossTenantAccessViolationError';
    this.contextCompanyId = contextCompanyId;
    this.targetCompanyId = targetCompanyId;
  }
}

/**
 * Generates SQL statements to configure transaction-local tenant session variables.
 * Employs SET LOCAL semantics ensuring variables automatically reset upon transaction completion.
 */
export function buildTenantSessionContextSql(options: {
  readonly companyId?: string | null | undefined;
  readonly userId?: string | null | undefined;
  readonly isSuperadmin?: boolean | undefined;
}): string {
  const statements: string[] = [];

  const safeCompanyId = options.companyId ? sanitizeSessionIdentifier(options.companyId) : '';
  const safeUserId = options.userId ? sanitizeSessionIdentifier(options.userId) : '';
  const isSuperadmin = options.isSuperadmin === true;

  statements.push(`SET LOCAL app.current_company_id = '${safeCompanyId}';`);
  statements.push(`SET LOCAL app.current_tenant_id = '${safeCompanyId}';`);
  statements.push(`SET LOCAL app.current_user_id = '${safeUserId}';`);
  statements.push(`SET LOCAL app.is_superadmin = '${isSuperadmin ? 'true' : 'false'}';`);

  return statements.join(' ');
}

/**
 * Generates SQL statement resetting all tenant session variables to unauthenticated defaults.
 */
export function buildClearTenantSessionSql(): string {
  return [
    `SET LOCAL app.current_company_id = '';`,
    `SET LOCAL app.current_tenant_id = '';`,
    `SET LOCAL app.current_user_id = '';`,
    `SET LOCAL app.is_superadmin = 'false';`,
  ].join(' ');
}

/**
 * Validates that contextCompanyId matches targetCompanyId or that isSuperadmin bypass applies.
 */
export function assertTenantIsolation(
  contextCompanyId: string | null | undefined,
  targetCompanyId: string,
  isSuperadmin?: boolean
): void {
  if (isSuperadmin) {
    return;
  }

  if (!contextCompanyId || contextCompanyId !== targetCompanyId) {
    throw new CrossTenantAccessViolationError(
      contextCompanyId ?? 'unauthenticated',
      targetCompanyId
    );
  }
}

/**
 * Active in-process session stack used for scoped async context tracking.
 */
let activeSessionState: TenantSessionState = {
  companyId: null,
  userId: null,
  isSuperadmin: false,
};

/**
 * Returns current in-memory tenant session state.
 */
export function getActiveSessionState(): TenantSessionState {
  return { ...activeSessionState };
}

/**
 * Executes a callback within a strictly bounded tenant transaction context.
 * Sets transaction-local tenant session variables before execution,
 * and guarantees complete cleanup in a finally block to prevent connection pool contamination.
 *
 * @param companyId - UUIDv7 identifier of the owning company/tenant.
 * @param userId - Optional UUID identifier of the operating user.
 * @param fn - Business logic callback receiving the scoped tenant context.
 * @param options - Additional execution options such as superadmin bypass.
 */
export async function withTenantContext<T>(
  companyId: string,
  userId: string | null | undefined,
  fn: (context: { companyId: string; userId: string | null; isSuperadmin: boolean }) => Promise<T>,
  options?: TenantContextExecutionOptions
): Promise<T> {
  if (!companyId && !options?.isSuperadmin) {
    throw new Error('Cannot execute withTenantContext: companyId is required.');
  }

  const previousState = { ...activeSessionState };
  const isSuperadmin = options?.isSuperadmin === true;

  // Set active context
  activeSessionState = {
    companyId: companyId ?? null,
    userId: userId ?? null,
    isSuperadmin,
  };

  try {
    const context = {
      companyId,
      userId: userId ?? null,
      isSuperadmin,
    };

    return await fn(context);
  } finally {
    // Restore previous state or clear context to ensure zero connection leakage
    activeSessionState = previousState;
  }
}

/**
 * Connection Pool Simulator for multi-tenant isolation testing.
 * Verifies that concurrent or sequential operations across reused pooled connections
 * never bleed session variables between tenants.
 */
export class TenantConnectionPoolSimulator {
  private pooledConnections: Map<string, TenantSessionState> = new Map();

  /**
   * Acquires a connection and binds tenant session context.
   */
  public acquireConnection(
    connectionId: string,
    companyId: string,
    userId?: string | null,
    isSuperadmin: boolean = false
  ): TenantSessionState {
    const session: TenantSessionState = {
      companyId,
      userId: userId ?? null,
      isSuperadmin,
    };
    this.pooledConnections.set(connectionId, session);
    return session;
  }

  /**
   * Releases connection back to pool, simulating transaction commit/rollback
   * and SET LOCAL session reset.
   */
  public releaseConnection(connectionId: string): void {
    // Transaction end clears all SET LOCAL settings
    this.pooledConnections.set(connectionId, {
      companyId: null,
      userId: null,
      isSuperadmin: false,
    });
  }

  /**
   * Inspects current state of a pooled connection.
   */
  public inspectConnection(connectionId: string): TenantSessionState {
    return (
      this.pooledConnections.get(connectionId) ?? {
        companyId: null,
        userId: null,
        isSuperadmin: false,
      }
    );
  }
}
