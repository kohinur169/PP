// path: lib/db/repository.ts

import { generateUuidV7 } from './uuidv7';
import {
  BaseEntity,
  CreateEntityInput,
  UpdateEntityInput,
  RepositoryQueryOptions,
  PaginatedEntityResult,
  OptimisticLockError,
  EntityNotFoundError,
} from '../../types/entity';

/**
 * Underlying storage adapter interface for database operations.
 */
export interface EntityStorageDriver<T extends BaseEntity> {
  findById(id: string): Promise<T | null>;
  findMany(filter: (item: T) => boolean): Promise<T[]>;
  insert(record: T): Promise<T>;
  update(record: T): Promise<T>;
  delete(id: string): Promise<boolean>;
}

/**
 * Default high-performance in-memory driver for isolated unit testing and mock operations.
 */
export class InMemoryStorageDriver<T extends BaseEntity> implements EntityStorageDriver<T> {
  private readonly store: Map<string, T> = new Map();

  public async findById(id: string): Promise<T | null> {
    const item = this.store.get(id);
    return item ? ({ ...item } as T) : null;
  }

  public async findMany(filter: (item: T) => boolean): Promise<T[]> {
    const results: T[] = [];
    for (const item of this.store.values()) {
      if (filter(item)) {
        results.push({ ...item } as T);
      }
    }
    return results;
  }

  public async insert(record: T): Promise<T> {
    this.store.set(record.id, { ...record } as T);
    return { ...record } as T;
  }

  public async update(record: T): Promise<T> {
    this.store.set(record.id, { ...record } as T);
    return { ...record } as T;
  }

  public async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  public clear(): void {
    this.store.clear();
  }

  public get size(): number {
    return this.store.size;
  }
}

/**
 * Abstract Base Repository enforcing KD Solution IT data architecture:
 * - RFC 9562 UUIDv7 Primary Keys
 * - Multi-tenant isolation by company_id
 * - Automated updated_at and created_at timestamps
 * - Optimistic concurrency control via version counter
 * - Safe soft-deletion with deleted_at timestamp
 */
export abstract class AbstractRepository<T extends BaseEntity> {
  protected readonly entityName: string;
  protected readonly defaultCompanyId: string | null;
  protected readonly driver: EntityStorageDriver<T>;

  constructor(
    entityName: string,
    options?: {
      readonly defaultCompanyId?: string | undefined;
      readonly driver?: EntityStorageDriver<T> | undefined;
    }
  ) {
    this.entityName = entityName;
    this.defaultCompanyId = options?.defaultCompanyId ?? null;
    this.driver = options?.driver ?? new InMemoryStorageDriver<T>();
  }

  /**
   * Retrieves an entity by its primary key ID.
   * By default, soft-deleted entities are excluded unless includeDeleted is true.
   */
  public async findById(
    id: string,
    options?: { readonly includeDeleted?: boolean; readonly companyId?: string }
  ): Promise<T | null> {
    const item = await this.driver.findById(id);
    if (!item) {
      return null;
    }

    // Company isolation check
    const requiredCompanyId = options?.companyId ?? this.defaultCompanyId;
    if (requiredCompanyId && item.company_id !== requiredCompanyId) {
      return null;
    }

    // Soft delete check
    if (!options?.includeDeleted && item.deleted_at !== null) {
      return null;
    }

    return item;
  }

  /**
   * Retrieves an entity by its primary key ID or throws EntityNotFoundError.
   */
  public async findByIdOrThrow(
    id: string,
    options?: { readonly includeDeleted?: boolean; readonly companyId?: string }
  ): Promise<T> {
    const item = await this.findById(id, options);
    if (!item) {
      throw new EntityNotFoundError(this.entityName, id);
    }
    return item;
  }

  /**
   * Retrieves all matching entities based on query options.
   */
  public async findMany(options?: RepositoryQueryOptions): Promise<T[]> {
    const requiredCompanyId = options?.companyId ?? this.defaultCompanyId;
    const includeDeleted = options?.includeDeleted ?? false;

    const items = await this.driver.findMany((record) => {
      if (requiredCompanyId && record.company_id !== requiredCompanyId) {
        return false;
      }
      if (!includeDeleted && record.deleted_at !== null) {
        return false;
      }
      return true;
    });

    // Sort order
    const orderBy = options?.orderBy;
    const orderDirection = options?.orderDirection ?? 'asc';
    if (orderBy) {
      items.sort((a, b) => {
        const valA = (a as Record<string, unknown>)[orderBy];
        const valB = (b as Record<string, unknown>)[orderBy];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        const cmp = valA < valB ? -1 : 1;
        return orderDirection === 'desc' ? -cmp : cmp;
      });
    }

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit;
    if (limit !== undefined) {
      return items.slice(offset, offset + limit);
    }
    return items.slice(offset);
  }

  /**
   * Retrieves a paginated envelope of entities.
   */
  public async findPaginated(options?: RepositoryQueryOptions): Promise<PaginatedEntityResult<T>> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const allMatching = await this.findMany({
      ...options,
      limit: undefined,
      offset: undefined,
    });

    const total = allMatching.length;
    const items = allMatching.slice(offset, offset + limit);
    const hasMore = offset + items.length < total;

    return {
      items,
      total,
      limit,
      offset,
      hasMore,
    };
  }

  /**
   * Inserts a new entity. Automatically assigns an RFC 9562 UUIDv7 ID (if not provided),
   * sets created_at and updated_at to the current clock timestamp, initializes version to 1,
   * and sets deleted_at to null.
   */
  public async create(input: CreateEntityInput<T>): Promise<T> {
    const id = input.id ?? generateUuidV7();
    const companyId = input.company_id ?? this.defaultCompanyId;

    if (!companyId) {
      throw new Error(`Cannot create "${this.entityName}": missing mandatory company_id.`);
    }

    const now = new Date().toISOString();

    const record = {
      ...(input as Record<string, unknown>),
      id,
      company_id: companyId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version: 1,
    } as unknown as T;

    return await this.driver.insert(record);
  }

  /**
   * Mutates an entity with strict optimistic concurrency control.
   * Increments version by 1 and advances updated_at.
   * Throws OptimisticLockError if expectedVersion !== current.version.
   */
  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateEntityInput<T>
  ): Promise<T> {
    const current = await this.findById(id, { includeDeleted: true });
    if (!current) {
      throw new EntityNotFoundError(this.entityName, id);
    }

    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }

    const now = new Date().toISOString();

    const updatedRecord = {
      ...(current as Record<string, unknown>),
      ...(input as Record<string, unknown>),
      id: current.id, // Immutable
      company_id: current.company_id, // Immutable
      created_at: current.created_at, // Immutable
      updated_at: now,
      version: current.version + 1,
    } as unknown as T;

    return await this.driver.update(updatedRecord);
  }

  /**
   * Soft-deletes an entity by setting deleted_at to current timestamp and incrementing version.
   */
  public async softDelete(id: string, expectedVersion: number): Promise<T> {
    const current = await this.findById(id, { includeDeleted: false });
    if (!current) {
      throw new EntityNotFoundError(this.entityName, id);
    }

    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }

    const now = new Date().toISOString();

    const softDeleted = {
      ...(current as Record<string, unknown>),
      deleted_at: now,
      updated_at: now,
      version: current.version + 1,
    } as unknown as T;

    return await this.driver.update(softDeleted);
  }

  /**
   * Restores a previously soft-deleted entity by clearing deleted_at and incrementing version.
   */
  public async restore(id: string, expectedVersion: number): Promise<T> {
    const current = await this.findById(id, { includeDeleted: true });
    if (!current || current.deleted_at === null) {
      throw new EntityNotFoundError(this.entityName, id);
    }

    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }

    const now = new Date().toISOString();

    const restored = {
      ...(current as Record<string, unknown>),
      deleted_at: null,
      updated_at: now,
      version: current.version + 1,
    } as unknown as T;

    return await this.driver.update(restored);
  }

  /**
   * Permanently deletes an entity from physical storage.
   */
  public async hardDelete(id: string, expectedVersion?: number): Promise<boolean> {
    const current = await this.findById(id, { includeDeleted: true });
    if (!current) {
      return false;
    }

    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }

    return await this.driver.delete(id);
  }
}
