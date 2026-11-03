// path: tests/api/audit-merkle.test.ts

import { describe, it, expect } from 'vitest';
import {
  canExportAuditLogs,
  assertCanExportAuditLogs,
  createAuditExportForbiddenResponse,
  extractStaffIdentityFromHeaders,
} from '../../lib/security/audit-guard';
import {
  calculateMerkleRoot,
  generateMerkleProof,
  verifyMerkleProof,
} from '../../lib/security/merkle';
import {
  signAuditEntry,
  verifyAuditSignature,
  getPlatformAuditSigningKeyPair,
} from '../../lib/security/audit-signer';
import { computeAuditHash } from '../../lib/audit/hasher';
import { GENESIS_HASH } from '../../types/audit';
import {
  verifyAuditChainContinuity,
  verifySeededAuditChain,
} from '../../scripts/verify-audit-chain';
import { GET as exportRoute } from '../../app/api/compliance/audit/export/route';
import {
  GET as verifyGetRoute,
  POST as verifyPostRoute,
} from '../../app/api/compliance/audit/verify/route';

describe('Step 028: Audit Log Merkle Root Export & Cryptographic Verification API', () => {
  const platformKey = getPlatformAuditSigningKeyPair();

  describe('Step 028.4: Audit Log Export Permissions Guard', () => {
    it('grants export permissions to compliance_kyc, compliance_officer, and super_admin', () => {
      expect(canExportAuditLogs('super_admin')).toBe(true);
      expect(canExportAuditLogs('compliance_kyc')).toBe(true);
      expect(canExportAuditLogs('compliance_officer')).toBe(true);
      expect(canExportAuditLogs('random_role', true)).toBe(true); // isSuperadmin override
    });

    it('denies export permissions to unprivileged roles (owner, admin, developer, merchant_viewer, support, blogger)', () => {
      expect(canExportAuditLogs('owner')).toBe(false);
      expect(canExportAuditLogs('admin')).toBe(false);
      expect(canExportAuditLogs('developer')).toBe(false);
      expect(canExportAuditLogs('merchant_viewer')).toBe(false);
      expect(canExportAuditLogs('support')).toBe(false);
      expect(canExportAuditLogs('blogger')).toBe(false);
      expect(canExportAuditLogs(null)).toBe(false);
      expect(canExportAuditLogs(undefined)).toBe(false);
    });

    it('assertCanExportAuditLogs throws descriptive error on unauthorized roles', () => {
      expect(() => assertCanExportAuditLogs('merchant_viewer')).toThrow(
        /Access Denied: Audit log export is strictly restricted to compliance_kyc and super_admin roles/
      );
      expect(() => assertCanExportAuditLogs(null)).toThrow(/Access Denied/);
    });

    it('creates RFC 7807 403 Forbidden response for forbidden export requests', async () => {
      const response = createAuditExportForbiddenResponse('/api/compliance/audit/export');
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/problem+json');

      const body = await response.json();
      expect(body.status).toBe(403);
      expect(body.title).toContain('Forbidden');
      expect(body.detail).toContain('compliance_kyc and super_admin');
    });

    it('extracts staff identity and role from diverse request headers', () => {
      const headersA = new Headers({
        'x-staff-role': 'compliance_kyc',
        'x-staff-id': 'staff_123',
      });
      const parsedA = extractStaffIdentityFromHeaders(headersA);
      expect(parsedA.role).toBe('compliance_kyc');
      expect(parsedA.userId).toBe('staff_123');
      expect(parsedA.isSuperadmin).toBe(false);

      const headersB = new Headers({
        'x-user-role': 'super_admin',
        'x-is-superadmin': 'true',
      });
      const parsedB = extractStaffIdentityFromHeaders(headersB);
      expect(parsedB.role).toBe('super_admin');
      expect(parsedB.isSuperadmin).toBe(true);
    });
  });

  describe('Step 028.1: Audit Export API Endpoint (GET /api/compliance/audit/export)', () => {
    it('returns 403 Forbidden when accessed by unauthorized roles', async () => {
      const req = new Request('http://localhost:3000/api/compliance/audit/export', {
        headers: {
          'x-staff-role': 'merchant_viewer',
        },
      });

      const res = await exportRoute(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.title).toContain('Forbidden');
    });

    it('returns signed batch manifest when accessed with compliance_kyc role', async () => {
      const mockRoots = [
        {
          id: '018f6c4c-3500-7fa1-b1e2-aaaaaaaaaaaa',
          company_id: '018f6c4c-3500-7fa1-b1e2-bbbbbbbbbbbb',
          batch_date: '2026-11-03',
          merkle_root: 'a'.repeat(64),
          entry_count: 50,
          first_sequence_id: 1,
          last_sequence_id: 50,
          created_at: '2026-11-03T18:00:00.000Z',
        },
      ];

      const req = new Request(
        'http://localhost:3000/api/compliance/audit/export?date=2026-11-03',
        {
          headers: {
            'x-staff-role': 'compliance_kyc',
            'x-staff-id': 'compliance_officer_01',
          },
        }
      );

      const res = await exportRoute(req, { mockRoots });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.manifest_version).toBe('1.0.0');
      expect(body.manifest_signature).toBeDefined();
      expect(body.manifest_signature).toHaveLength(88); // 64-byte Ed25519 signature base64
      expect(body.signer_public_key).toBeDefined();
      expect(body.signer_public_key).toContain('-----BEGIN PUBLIC KEY-----');
      expect(body.batch_count).toBe(1);
      expect(body.batches[0].merkle_root).toBe('a'.repeat(64));

      // Verify manifest signature against platform public key
      const isSignatureValid = verifyAuditSignature(
        body.manifest_hash,
        body.manifest_signature,
        platformKey.publicKey
      );
      expect(isSignatureValid).toBe(true);
    });
  });

  describe('Step 028.2: Audit Verification API Endpoint (GET & POST /api/compliance/audit/verify)', () => {
    it('GET /api/compliance/audit/verify requires sequence_id query parameter', async () => {
      const req = new Request('http://localhost:3000/api/compliance/audit/verify');
      const res = await verifyGetRoute(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('MISSING_PARAMETER');
    });

    it('GET /api/compliance/audit/verify rejects non-integer sequence_id', async () => {
      const req = new Request(
        'http://localhost:3000/api/compliance/audit/verify?sequence_id=invalid'
      );
      const res = await verifyGetRoute(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('INVALID_SEQUENCE_ID');
    });

    it('GET /api/compliance/audit/verify verifies individual entry proof without exposing tenant PII', async () => {
      const entryHash = computeAuditHash(GENESIS_HASH, 42, { sensitive_card: '4111...' });
      const signature = signAuditEntry(entryHash);

      const mockEntry = {
        sequence_id: 42,
        id: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        prev_hash: GENESIS_HASH,
        current_hash: entryHash,
        signature,
        created_at: '2026-11-03T14:30:00.000Z',
        action: 'PAYMENT_CAPTURED',
      };

      const mockBatch = [
        { sequence_id: 41, current_hash: '1'.repeat(64) },
        { sequence_id: 42, current_hash: entryHash },
        { sequence_id: 43, current_hash: '2'.repeat(64) },
      ];

      const req = new Request(
        'http://localhost:3000/api/compliance/audit/verify?sequence_id=42'
      );
      const res = await verifyGetRoute(req, { mockEntry, mockBatch });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.sequence_id).toBe(42);
      expect(body.entry_hash).toBe(entryHash);
      expect(body.action).toBe('PAYMENT_CAPTURED');
      expect(body.pii_disclosed).toBe(false);
      expect(body.merkle_proof_valid).toBe(true);
      expect(body.signature_valid).toBe(true);
      // Ensure zero PII in the response
      expect((body as any).payload).toBeUndefined();
      expect((body as any).diff_payload).toBeUndefined();
      expect((body as any).sensitive_card).toBeUndefined();
    });

    it('POST /api/compliance/audit/verify accepts valid external Merkle proof and verifies integrity', async () => {
      const leaves = Array.from({ length: 4 }, (_, i) =>
        computeAuditHash(GENESIS_HASH, i + 1, { event: `event_${i}` })
      );
      const root = calculateMerkleRoot(leaves);
      const merkleProof = generateMerkleProof(leaves, 2);

      const req = new Request('http://localhost:3000/api/compliance/audit/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root,
          leaf: merkleProof.leaf,
          proof: merkleProof.steps,
        }),
      });

      const res = await verifyPostRoute(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.merkle_proof_valid).toBe(true);
    });

    it('POST /api/compliance/audit/verify rejects tampered leaf hash', async () => {
      const leaves = [
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
        'd'.repeat(64),
      ];
      const root = calculateMerkleRoot(leaves);
      const merkleProof = generateMerkleProof(leaves, 1);

      const req = new Request('http://localhost:3000/api/compliance/audit/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root,
          leaf: 'f'.repeat(64), // tampered leaf
          proof: merkleProof.steps,
        }),
      });

      const res = await verifyPostRoute(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.verified).toBe(false);
      expect(body.merkle_proof_valid).toBe(false);
    });

    it('POST /api/compliance/audit/verify validates Ed25519 signature when provided', async () => {
      const leaf = 'e'.repeat(64);
      const root = leaf; // single leaf tree
      const signature = signAuditEntry(leaf);

      const req = new Request('http://localhost:3000/api/compliance/audit/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root,
          leaf,
          proof: [],
          signature,
        }),
      });

      const res = await verifyPostRoute(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.verified).toBe(true);
      expect(body.signature_valid).toBe(true);
    });

    it('POST /api/compliance/audit/verify rejects malformed JSON payloads with 422', async () => {
      const req = new Request('http://localhost:3000/api/compliance/audit/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: 'short_root',
          leaf: 'short_leaf',
        }),
      });

      const res = await verifyPostRoute(req);
      expect(res.status).toBe(422);
    });
  });

  describe('Step 028.3: Full Audit Chain Continuity Verifier (scripts/verify-audit-chain.ts)', () => {
    it('verifies 100% hash chain continuity across seeded audit logs', async () => {
      const summary = await verifySeededAuditChain(15);

      expect(summary.success).toBe(true);
      expect(summary.totalEntries).toBe(15);
      expect(summary.firstSequenceId).toBe(1);
      expect(summary.lastSequenceId).toBe(15);
      expect(summary.merkleRootsVerified).toBe(1);
      expect(summary.brokenSequenceId).toBeUndefined();
    });

    it('detects and flags broken hash chain linking', async () => {
      const entries = [
        {
          sequence_id: 1,
          prev_hash: GENESIS_HASH,
          current_hash: computeAuditHash(GENESIS_HASH, 1, { ev: 1 }),
          payload: { ev: 1 },
          created_at: '2026-11-03T10:00:00.000Z',
        },
        {
          sequence_id: 2,
          prev_hash: 'f'.repeat(64), // broken link (should equal entry 1 current_hash)
          current_hash: computeAuditHash('f'.repeat(64), 2, { ev: 2 }),
          payload: { ev: 2 },
          created_at: '2026-11-03T10:01:00.000Z',
        },
      ];

      const summary = await verifyAuditChainContinuity({ entries });
      expect(summary.success).toBe(false);
      expect(summary.brokenSequenceId).toBe(2);
      expect(summary.errorMessage).toContain('Cryptographic chain broken');
    });

    it('detects and flags payload tampering on an audit entry', async () => {
      const entry1Hash = computeAuditHash(GENESIS_HASH, 1, { ev: 1 });
      const entry2Hash = computeAuditHash(entry1Hash, 2, { ev: 2 });

      const entries = [
        {
          sequence_id: 1,
          prev_hash: GENESIS_HASH,
          current_hash: entry1Hash,
          payload: { ev: 1 },
          created_at: '2026-11-03T10:00:00.000Z',
        },
        {
          sequence_id: 2,
          prev_hash: entry1Hash,
          current_hash: entry2Hash,
          payload: { ev: 'tampered_payload_value' }, // payload tampered after hash calculation!
          created_at: '2026-11-03T10:01:00.000Z',
        },
      ];

      const summary = await verifyAuditChainContinuity({ entries });
      expect(summary.success).toBe(false);
      expect(summary.brokenSequenceId).toBe(2);
      expect(summary.errorMessage).toContain('Audit entry hash corruption');
    });

    it('detects and flags invalid genesis hash at sequence 1', async () => {
      const entries = [
        {
          sequence_id: 1,
          prev_hash: '1'.repeat(64), // invalid genesis hash
          current_hash: computeAuditHash('1'.repeat(64), 1, { ev: 1 }),
          payload: { ev: 1 },
          created_at: '2026-11-03T10:00:00.000Z',
        },
      ];

      const summary = await verifyAuditChainContinuity({ entries });
      expect(summary.success).toBe(false);
      expect(summary.brokenSequenceId).toBe(1);
      expect(summary.errorMessage).toContain('Genesis block hash violation');
    });
  });
});
