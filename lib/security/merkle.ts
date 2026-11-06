// path: lib/security/merkle.ts

import crypto from 'node:crypto';
import { GENESIS_HASH } from '../../types/audit';

/**
 * Relative sibling position for cryptographic Merkle path reconstruction.
 */
export type MerkleSiblingPosition = 'left' | 'right';

/**
 * Single step in a Merkle tree inclusion proof.
 */
export interface MerkleProofStep {
  readonly position: MerkleSiblingPosition;
  readonly hash: string;
}

/**
 * Complete cryptographic inclusion proof for a leaf in a Merkle tree.
 */
export interface MerkleProof {
  readonly root: string;
  readonly leaf: string;
  readonly index: number;
  readonly steps: readonly MerkleProofStep[];
}

/**
 * Hashes two 32-byte hexadecimal sibling nodes using SHA-256.
 *
 * @param left - Hex-encoded hash of the left child.
 * @param right - Hex-encoded hash of the right child.
 * @returns 64-character lowercase hexadecimal SHA-256 parent hash.
 */
export function hashMerklePair(left: string, right: string): string {
  return crypto
    .createHash('sha256')
    .update(left + right, 'utf8')
    .digest('hex');
}

/**
 * Step 027.1: Recursively computes the 32-byte cryptographic Merkle root for an array of leaf hashes.
 * For an empty array, returns GENESIS_HASH (64 zeros).
 * If the number of nodes at any level is odd, the last node is duplicated to balance the tree.
 *
 * @param leaves - Array of 64-character SHA-256 leaf hashes.
 * @returns 64-character lowercase hexadecimal SHA-256 Merkle root.
 */
export function calculateMerkleRoot(leaves: readonly string[]): string {
  if (leaves.length === 0) {
    return GENESIS_HASH;
  }

  if (leaves.length === 1) {
    return leaves[0]!;
  }

  let currentLevel: string[] = [...leaves];

  while (currentLevel.length > 1) {
    // Duplicate last element if odd number of elements to balance the binary tree
    if (currentLevel.length % 2 === 1) {
      currentLevel.push(currentLevel[currentLevel.length - 1]!);
    }

    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = currentLevel[i + 1]!;
      nextLevel.push(hashMerklePair(left, right));
    }

    currentLevel = nextLevel;
  }

  return currentLevel[0]!;
}

/**
 * Step 027.1: Generates a cryptographic proof-of-inclusion for a leaf at a specified index.
 *
 * @param leaves - Full array of leaf hashes in the tree batch.
 * @param index - Zero-based index of the target leaf.
 * @returns Array of Merkle proof steps.
 */
export function generateProof(
  leaves: readonly string[],
  index: number
): MerkleProofStep[] {
  if (index < 0 || index >= leaves.length) {
    throw new Error(
      `Merkle proof generation error: Index ${index} is out of bounds (leaves length: ${leaves.length}).`
    );
  }

  const steps: MerkleProofStep[] = [];
  let currentLevel: string[] = [...leaves];
  let currentIndex = index;

  while (currentLevel.length > 1) {
    if (currentLevel.length % 2 === 1) {
      currentLevel.push(currentLevel[currentLevel.length - 1]!);
    }

    const isEven = currentIndex % 2 === 0;
    const siblingIndex = isEven ? currentIndex + 1 : currentIndex - 1;

    steps.push({
      position: isEven ? 'right' : 'left',
      hash: currentLevel[siblingIndex]!,
    });

    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      nextLevel.push(hashMerklePair(currentLevel[i]!, currentLevel[i + 1]!));
    }

    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return steps;
}

/**
 * Alias for generateProof with explicit naming and comprehensive proof object.
 */
export function generateMerkleProof(
  leaves: readonly string[],
  index: number
): MerkleProof {
  const steps = generateProof(leaves, index);
  const root = calculateMerkleRoot(leaves);
  return {
    root,
    leaf: leaves[index]!,
    index,
    steps,
  };
}

/**
 * Step 027.2: Verifies a cryptographic Merkle proof-of-inclusion against a known Merkle root.
 *
 * @param root - Expected 64-character SHA-256 Merkle root.
 * @param leaf - 64-character SHA-256 hash of the target leaf.
 * @param proof - Array of MerkleProofStep steps or a MerkleProof object.
 * @returns true if the calculated root matches the expected root, false otherwise.
 */
export function verifyMerkleProof(
  root: string,
  leaf: string,
  proof: readonly MerkleProofStep[] | MerkleProof
): boolean {
  if (!root || !leaf) {
    return false;
  }

  const steps: readonly MerkleProofStep[] = 'steps' in proof ? proof.steps : proof;
  let current = leaf;

  for (const step of steps) {
    if (!step || !step.hash) {
      return false;
    }

    if (step.position === 'left') {
      current = hashMerklePair(step.hash, current);
    } else if (step.position === 'right') {
      current = hashMerklePair(current, step.hash);
    } else {
      return false;
    }
  }

  return current.toLowerCase() === root.toLowerCase();
}
