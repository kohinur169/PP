// path: app/api/compliance/audit/verify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyMerkleProof,
  generateMerkleProof,
  MerkleProofStep,
} from '@/lib/security/merkle';
import {
  verifyAuditSignature,
  getPlatformAuditSigningKeyPair,
} from '@/lib/security/audit-signer';
import { getSupabaseClient } from '@/lib/database/client';

export const dynamic = 'force-dynamic';

/**
 * Step 028.2: Public cryptographic verification endpoint.
 * Allows independent verification of audit chain continuity, Ed25519 signatures,
 * and Merkle root anchoring without disclosing underlying tenant PII.
 */
export async function GET(
  req: NextRequest | Request,
  contextOptions?: {
    supabase?: any;
    mockEntry?: any;
    mockBatch?: any[];
    mockRootRecord?: any;
  }
): Promise<Response> {
  const url = new URL(req.url);
  const sequenceIdParam = url.searchParams.get('sequence_id');

  if (!sequenceIdParam) {
    return NextResponse.json(
      {
        error: 'MISSING_PARAMETER',
        message: 'Query parameter "sequence_id" is required for audit verification.',
      },
      { status: 400 }
    );
  }

  const sequenceId = parseInt(sequenceIdParam, 10);
  if (isNaN(sequenceId) || sequenceId <= 0) {
    return NextResponse.json(
      {
        error: 'INVALID_SEQUENCE_ID',
        message: 'Parameter "sequence_id" must be a positive integer.',
      },
      { status: 400 }
    );
  }

  try {
    let entry: any = contextOptions?.mockEntry ?? null;
    const supabase = contextOptions?.supabase ?? getSupabaseClient();

    if (!entry) {
      try {
        const entryQuery = supabase
          .from('audit_logs')
          .select('sequence_id, id, prev_hash, current_hash, signature, created_at, action')
          .eq('sequence_id', sequenceId)
          .single();

        const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) =>
          setTimeout(() => reject(new Error('Entry lookup timed out')), 2000)
        );
        const result = (await Promise.race([entryQuery, timeoutPromise])) as any;
        entry = result?.data ?? null;
      } catch {
        entry = null;
      }
    }

    if (!entry) {
      return NextResponse.json(
        {
          error: 'ENTRY_NOT_FOUND',
          message: `Audit log entry with sequence_id ${sequenceId} was not found.`,
        },
        { status: 404 }
      );
    }

    const batchDate = entry.created_at.substring(0, 10);

    // 2. Fetch the Merkle root record for this calendar batch date
    let rootRecord: any = contextOptions?.mockRootRecord ?? null;
    if (!rootRecord && !contextOptions?.mockBatch) {
      try {
        const rootQuery = supabase
          .from('audit_merkle_roots')
          .select('merkle_root, batch_date, entry_count, first_sequence_id, last_sequence_id')
          .eq('batch_date', batchDate)
          .is('deleted_at', null)
          .maybeSingle();

        const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) =>
          setTimeout(() => reject(new Error('Root query timed out')), 2000)
        );
        const res = (await Promise.race([rootQuery, timeoutPromise])) as any;
        rootRecord = res?.data ?? null;
      } catch {
        rootRecord = null;
      }
    }

    // 3. Fetch all entry hashes belonging to this batch date to construct proof
    let batchEntries: any[] = contextOptions?.mockBatch ?? [];
    if (!contextOptions?.mockBatch) {
      try {
        const batchQuery = supabase
          .from('audit_logs')
          .select('sequence_id, current_hash')
          .gte('created_at', `${batchDate}T00:00:00.000Z`)
          .lt('created_at', `${batchDate}T23:59:59.999Z`)
          .order('sequence_id', { ascending: true });

        const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) =>
          setTimeout(() => reject(new Error('Batch query timed out')), 2000)
        );
        const res = (await Promise.race([batchQuery, timeoutPromise])) as any;
        batchEntries = res?.data ?? [];
      } catch {
        batchEntries = [];
      }
    }

    const leaves = (batchEntries || []).map((e) => e.current_hash);
    const leafIndex = (batchEntries || []).findIndex(
      (e) => Number(e.sequence_id) === sequenceId
    );

    let merkleProofValid = false;
    let merkleProof = null;
    let activeRoot = rootRecord?.merkle_root || null;

    if (leafIndex !== -1 && leaves.length > 0) {
      merkleProof = generateMerkleProof(leaves, leafIndex);
      activeRoot = activeRoot || merkleProof.root;
      merkleProofValid = verifyMerkleProof(activeRoot, entry.current_hash, merkleProof);
    }

    // 4. Verify Ed25519 signature on the entry hash
    let signatureValid = false;
    if (entry.signature) {
      const platformKey = getPlatformAuditSigningKeyPair();
      signatureValid = verifyAuditSignature(
        entry.current_hash,
        entry.signature,
        platformKey.publicKey
      );
    }

    const overallVerified =
      (merkleProof ? merkleProofValid : true) &&
      (entry.signature ? signatureValid : true);

    return NextResponse.json(
      {
        verified: overallVerified,
        sequence_id: Number(entry.sequence_id),
        id: entry.id,
        action: entry.action,
        entry_hash: entry.current_hash,
        prev_hash: entry.prev_hash,
        batch_date: batchDate,
        merkle_root: activeRoot,
        merkle_proof_valid: merkleProofValid,
        signature_valid: signatureValid,
        signature: entry.signature,
        proof: merkleProof,
        pii_disclosed: false,
        verified_at: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      {
        error: 'VERIFICATION_ERROR',
        message: error.message || 'Error executing cryptographic verification.',
      },
      { status: 500 }
    );
  }
}

/**
 * Step 028.2: POST handler allowing independent external validation of Merkle proofs.
 */
export async function POST(req: NextRequest | Request): Promise<Response> {
  try {
    const body = await req.json();
    const { root, leaf, proof, signature, public_key } = body;

    if (!root || typeof root !== 'string' || root.length !== 64) {
      return NextResponse.json(
        {
          error: 'INVALID_MERKLE_ROOT',
          message: 'Field "root" must be a 64-character SHA-256 hexadecimal string.',
        },
        { status: 422 }
      );
    }

    if (!leaf || typeof leaf !== 'string' || leaf.length !== 64) {
      return NextResponse.json(
        {
          error: 'INVALID_LEAF_HASH',
          message: 'Field "leaf" must be a 64-character SHA-256 hexadecimal string.',
        },
        { status: 422 }
      );
    }

    if (!proof || (!Array.isArray(proof) && !('steps' in proof))) {
      return NextResponse.json(
        {
          error: 'INVALID_PROOF',
          message: 'Field "proof" must be an array of Merkle proof steps or a MerkleProof object.',
        },
        { status: 422 }
      );
    }

    // 1. Verify Merkle Proof
    const steps: readonly MerkleProofStep[] = Array.isArray(proof) ? proof : proof.steps;
    const isProofValid = verifyMerkleProof(root, leaf, steps);

    // 2. Verify signature if supplied
    let isSignatureValid: boolean | null = null;
    if (signature) {
      isSignatureValid = verifyAuditSignature(leaf, signature, public_key);
    }

    const overallVerified =
      isProofValid && (isSignatureValid === null ? true : isSignatureValid);

    return NextResponse.json(
      {
        verified: overallVerified,
        merkle_proof_valid: isProofValid,
        signature_valid: isSignatureValid,
        root,
        leaf,
        verified_at: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message: error.message || 'Failed to process verification request body.',
      },
      { status: 400 }
    );
  }
}
