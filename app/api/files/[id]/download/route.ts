// path: app/api/files/[id]/download/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  generateSecureDownloadUrl,
  downloadAndDecryptFile,
  verifySignedDownloadToken,
  FileNotFoundError,
  FileAccessDeniedError,
  SecureDownloadUrlDependencies,
} from '@/lib/storage/signed-url';
import type { Rfc7807ProblemDetails } from '@/lib/validation';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ readonly id: string }> | { readonly id: string };
}

/**
 * Creates an RFC 7807 standard Problem Details HTTP Response.
 */
function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'DOWNLOAD_ERROR'
): Response {
  const problem: Rfc7807ProblemDetails = {
    type: `https://kdsolution.it/errors/${errorCode.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    detail,
    instance,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(problem), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Step 043: Short-Lived Signed Download URL Generator & Access Logger Endpoint
 * GET /api/files/[id]/download
 *
 * Verifies tenant isolation and actor permissions, generates a 15-minute expiring signed URL,
 * decrypts on the fly if requested, and writes an immutable FILE_ACCESSED entry to audit_logs.
 */
export async function GET(
  req: NextRequest | Request,
  context: RouteContext,
  contextOptions?: SecureDownloadUrlDependencies
): Promise<Response> {
  const url = new URL(req.url);
  const searchParams = url.searchParams;
  const instancePath = url.pathname;

  // 1. Resolve route parameter [id]
  const resolvedParams = await Promise.resolve(context?.params);
  const fileId = resolvedParams?.id;

  if (!fileId || typeof fileId !== 'string') {
    return createProblemResponse(
      400,
      'Bad Request',
      'A valid file ID route parameter is required.',
      instancePath,
      'INVALID_FILE_ID'
    );
  }

  // 2. Check for token-based direct download access
  const token = searchParams.get('token');
  if (token) {
    const tokenResult = verifySignedDownloadToken(token, contextOptions?.secretKey);

    if (!tokenResult.valid) {
      if (tokenResult.reason === 'EXPIRED') {
        return createProblemResponse(
          403,
          'Signed URL Expired',
          'This signed download URL has expired. Signed URLs are valid for a maximum of 15 minutes.',
          instancePath,
          'SIGNED_URL_EXPIRED'
        );
      }
      return createProblemResponse(
        401,
        'Invalid Signed Token',
        'The provided download token signature is invalid, tampered with, or malformed.',
        instancePath,
        'INVALID_SIGNED_TOKEN'
      );
    }

    if (tokenResult.payload && tokenResult.payload.fileId !== fileId) {
      return createProblemResponse(
        403,
        'Token File Mismatch',
        'The provided download token does not correspond to the requested file ID.',
        instancePath,
        'TOKEN_MISMATCH'
      );
    }
  }

  // 3. Extract caller identity and headers
  const headers = req.headers;
  const userId =
    headers.get('x-user-id') ||
    headers.get('x-staff-id') ||
    headers.get('user-id') ||
    (token ? 'token_authorized_actor' : null);

  const role =
    headers.get('x-user-role') ||
    headers.get('x-staff-role') ||
    headers.get('role');

  const companyId =
    headers.get('x-company-id') ||
    headers.get('x-tenant-id');

  const superadminHeader =
    headers.get('x-is-superadmin') ||
    headers.get('x-superadmin');

  const isSuperadmin =
    superadminHeader === 'true' ||
    superadminHeader === '1' ||
    role?.toLowerCase() === 'super_admin';

  if (!userId) {
    return createProblemResponse(
      401,
      'Unauthorized',
      'Authentication required: Missing actor identity headers or valid download token.',
      instancePath,
      'UNAUTHORIZED'
    );
  }

  const ipAddress =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    null;

  const userAgent = headers.get('user-agent') || null;

  // 4. Parse execution flags
  const shouldDecrypt = searchParams.get('decrypt') === 'true' || searchParams.get('decrypt') === '1';
  const shouldRedirect = searchParams.get('redirect') === 'true' || searchParams.get('redirect') === '1';
  const expiresInParam = searchParams.get('expires_in');
  const expiresInSeconds = expiresInParam ? parseInt(expiresInParam, 10) : undefined;
  const downloadFilename = searchParams.get('filename') ?? undefined;

  try {
    // If on-the-fly decryption is requested, stream the raw decrypted file
    if (shouldDecrypt) {
      const decrypted = await downloadAndDecryptFile(
        {
          fileId,
          userId,
          userRole: role ?? undefined,
          userCompanyId: companyId ?? undefined,
          isSuperadmin,
          ipAddress,
          userAgent,
        },
        contextOptions
      );

      return new Response(new Uint8Array(decrypted.data), {
        status: 200,
        headers: {
          'Content-Type': decrypted.mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(decrypted.filename)}"`,
          'Content-Length': String(decrypted.sizeBytes),
          'X-Decrypted': 'true',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      });
    }

    // Default flow: Generate short-lived signed URL (max 15 mins) and log audit event
    const result = await generateSecureDownloadUrl(
      {
        fileId,
        userId,
        userRole: role ?? undefined,
        userCompanyId: companyId ?? undefined,
        isSuperadmin,
        expiresInSeconds,
        ipAddress,
        userAgent,
        downloadFilename,
      },
      contextOptions
    );

    if (shouldRedirect) {
      return NextResponse.redirect(result.signedUrl, 307);
    }

    return NextResponse.json(
      {
        file_id: result.fileId,
        company_id: result.companyId,
        original_name: result.originalName,
        category: result.category,
        mime_type: result.mimeType,
        size_bytes: result.sizeBytes,
        is_encrypted: result.isEncrypted,
        signed_url: result.signedUrl,
        platform_signed_url: result.platformSignedUrl,
        download_token: result.downloadToken,
        expires_at: result.expiresAt,
        expires_in_seconds: result.expiresInSeconds,
        status: 'authorized',
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    if (err instanceof FileNotFoundError) {
      return createProblemResponse(
        404,
        'File Not Found',
        err.message,
        instancePath,
        'FILE_NOT_FOUND'
      );
    }

    if (err instanceof FileAccessDeniedError) {
      return createProblemResponse(
        403,
        'Access Denied',
        err.message,
        instancePath,
        'TENANT_ACCESS_DENIED'
      );
    }

    logger.error('Unexpected error generating secure download URL', {
      fileId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });

    return createProblemResponse(
      500,
      'Internal Server Error',
      'An unexpected error occurred while generating the secure download URL.',
      instancePath,
      'INTERNAL_DOWNLOAD_ERROR'
    );
  }
}
