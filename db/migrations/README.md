# KD Solution IT: Database Migration & Rollback Standards

## Overview

All database schema evolutions in the KD Solution IT multi-tenant payment facilitator platform follow strict forward and rollback migration discipline. Every schema change is auditable, idempotent, reversible, and verified via automated forward/rollback test harnesses.

---

## 1. File Naming Conventions

Migrations must follow one of the two supported filename conventions:

### A. Sequential Numeric Format (`db/migrations/`)
- Forward: `<seq>_<migration_name>.sql` (e.g. `006_create_companies_table.sql`)
- Rollback: `<seq>_<migration_name>.down.sql` (e.g. `006_create_companies_table.down.sql`)

### B. ISO Timestamp Format (`supabase/migrations/`)
- Forward: `<timestamp>_<migration_name>.sql` (e.g. `20261103000010_create_companies_table.sql`)
- Rollback: `<timestamp>_<migration_name>.down.sql` (e.g. `20261103000010_create_companies_table.down.sql`)

---

## 2. Core Migration Rules

1. **Mandatory Rollback Scripts (`.down.sql`)**  
   Every forward migration MUST have a corresponding `.down.sql` file. Migrations lacking a rollback script fail the automated CI quality gate (`npm run migrate:test-cycle`).

2. **Zero Orphaned Schema Objects**  
   The rollback script must clean up all objects created by the forward script in reverse dependency order:
   - Drop triggers (`DROP TRIGGER IF EXISTS trg_name ON table_name;`)
   - Drop policies (`DROP POLICY IF EXISTS pol_name ON table_name;`)
   - Drop tables (`DROP TABLE IF EXISTS table_name CASCADE;`)
   - Drop functions (`DROP FUNCTION IF EXISTS function_name();`)

3. **Cryptographic Checksum Verification**  
   Each migration script has a SHA-256 checksum computed prior to execution. If an applied migration file is modified after being recorded in `_schema_migrations`, the runner flags a checksum mismatch to prevent corrupt migrations.

4. **Execution Time Tracking**  
   The migration runner tracks the duration of every migration with millisecond precision, persisting the result in `_schema_migrations.execution_time_ms`.

---

## 3. Schema Migrations State Table

Tracking table schema:

```sql
CREATE TABLE IF NOT EXISTS public._schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  checksum VARCHAR(64) NOT NULL,
  execution_time_ms INT NOT NULL DEFAULT 0
);
```

---

## 4. CLI Commands

| Command | Description |
|---|---|
| `npm run migrate:status` | Shows status of all migrations (applied vs pending, checksums, execution time) |
| `npm run migrate:up` | Applies pending forward migrations in chronological order |
| `npm run migrate:down` | Rolls back the most recently applied migration(s) using `.down.sql` |
| `npm run migrate:test-cycle` | Executes full forward migration followed immediately by clean rollback, verifying zero orphaned schema objects |

### CLI Options

- `--dir <path>`: Specify migration directory (e.g. `--dir db/migrations` or `--dir supabase/migrations`)
- `--steps <number>`: Limit number of migrations to apply or roll back
- `--dry-run`: Simulate migration execution without committing database changes
