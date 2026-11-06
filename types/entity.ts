// path: types/entity.ts

/**
 * Mandatory Base Entity attributes enforced across all KD Solution IT database tables.
 * Complies with enterprise multi-tenancy, soft deletion, and optimistic locking requirements.
 */
export interface BaseEntity {
  /**
   * RFC 9562 time-ordered UUIDv7 primary key identifier.
   */
  readonly id: string;

  /**
   * Multi-tenant partition key referencing the owning company/tenant.
   */
  readonly company_id: string;

  /**
   * ISO 8601 UTC timestamp of initial record creation.
   */
  readonly created_at: string;

  /**
   * ISO 8601 UTC timestamp of most recent record mutation.
   */
  readonly updated_at: string;

  /**
   * ISO 8601 UTC timestamp of soft-deletion, or null if active.
   */
  readonly deleted_at: string | null;

  /**
   * Positive integer counter for optimistic concurrency control (initialized to 1).
   */
  readonly version: number;
}

/**
 * Attributes permitted when inserting a new entity.
 * Excludes automated timestamp, version, and soft-delete fields.
 * company_id is optional if the repository provides a defaultCompanyId context.
 */
export type CreateEntityInput<T extends BaseEntity> = Omit<
  T,
  'id' | 'company_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'version'
> & {
  readonly id?: string | undefined;
  readonly company_id?: string | undefined;
};

/**
 * Attributes permitted when mutating an existing entity.
 * Excludes immutable identity attributes (id, company_id, created_at).
 */
export type UpdateEntityInput<T extends BaseEntity> = {
  [P in keyof Omit<T, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'version'>]?:
    | T[P]
    | undefined;
};

/**
 * Standard query filtering and pagination options.
 */
export interface RepositoryQueryOptions {
  /**
   * Whether to include soft-deleted records in query results (default: false).
   */
  readonly includeDeleted?: boolean | undefined;

  /**
   * Restricts query scope to an explicit company/tenant ID.
   */
  readonly companyId?: string | undefined;

  /**
   * Maximum number of rows to return.
   */
  readonly limit?: number | undefined;

  /**
   * Number of rows to skip.
   */
  readonly offset?: number | undefined;

  /**
   * Column name to order by.
   */
  readonly orderBy?: string | undefined;

  /**
   * Sort direction ('asc' or 'desc', default: 'asc').
   */
  readonly orderDirection?: 'asc' | 'desc' | undefined;
}

/**
 * Standard paginated response envelope.
 */
export interface PaginatedEntityResult<T extends BaseEntity> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

/**
 * Error raised when an optimistic concurrency conflict occurs during entity mutation.
 */
export class OptimisticLockError extends Error {
  public readonly entityId: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(entityId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic concurrency conflict on entity "${entityId}": expected version ${expectedVersion}, but current version is ${actualVersion}.`
    );
    this.name = 'OptimisticLockError';
    this.entityId = entityId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Error raised when an entity requested by primary key is not found or is soft-deleted.
 */
export class EntityNotFoundError extends Error {
  public readonly entityId: string;
  public readonly entityName: string;

  constructor(entityName: string, entityId: string) {
    super(`Entity "${entityName}" with ID "${entityId}" was not found or has been soft-deleted.`);
    this.name = 'EntityNotFoundError';
    this.entityId = entityId;
    this.entityName = entityName;
  }
}
