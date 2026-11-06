// path: lib/processors/test-connection.ts

import { processorFactory } from '@/lib/processors/factory';
import type { PaymentProcessorSlug } from '@/types/processors';
import {
  GatewayAuthError,
  GatewayNetworkError,
  GatewayInvalidRequestError,
} from '@/lib/processors/types';
import { logger } from '@/lib/logger/logger';

export interface GatewayDiagnostics {
  timestamp: string;
  dnsResolved: boolean;
  httpStatus?: number | undefined;
  errorDetails?: string | undefined;
  testedWithCustomCredentials: boolean;
}

export interface ConnectionTestReport {
  providerSlug: PaymentProcessorSlug;
  isConnected: boolean;
  latencyMs: number;
  environment: 'sandbox' | 'production';
  apiVersion?: string | undefined;
  message: string;
  diagnostics: GatewayDiagnostics;
}

export const VALID_PROVIDER_SLUGS: readonly PaymentProcessorSlug[] = [
  'nmi',
  'stripe_connect',
  'rainforest',
  'airwallex',
  'payoneer',
] as const;

export function isValidProviderSlug(slug: string): slug is PaymentProcessorSlug {
  return VALID_PROVIDER_SLUGS.includes(slug as PaymentProcessorSlug);
}

/**
 * Executes a live health probe and credential verification ping against a payment gateway.
 * Enforces timeout boundaries and captures granular network diagnostics.
 */
export async function testGatewayConnection(params: {
  providerSlug: PaymentProcessorSlug;
  credentials?: Record<string, string> | undefined;
  timeoutMs?: number | undefined;
}): Promise<ConnectionTestReport> {
  const { providerSlug, credentials, timeoutMs = 8000 } = params;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const testedWithCustomCredentials = Boolean(credentials && Object.keys(credentials).length > 0);

  try {
    if (timeoutMs <= 0) {
      throw new GatewayNetworkError({
        provider: providerSlug,
        message: `Gateway connection timed out after ${timeoutMs}ms.`,
      });
    }

    const adapter = processorFactory.getAdapter(providerSlug, { credentials });
    const testPromise = adapter.testConnection(credentials);
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new GatewayNetworkError({
              provider: providerSlug,
              message: `Gateway connection timed out after ${timeoutMs}ms.`,
            })
          ),
        timeoutMs
      );
      timer.unref?.();
    });

    const result = await Promise.race([testPromise, timeoutPromise]);
    const latencyMs = Math.max(1, Date.now() - startTime);

    logger.info('Gateway connection test completed successfully', {
      provider: providerSlug,
      latencyMs,
      environment: result.environment,
    });

    return {
      providerSlug,
      isConnected: result.isConnected,
      latencyMs: result.latencyMs ?? latencyMs,
      environment: result.environment,
      apiVersion: result.apiVersion,
      message: result.message,
      diagnostics: {
        timestamp,
        dnsResolved: true,
        httpStatus: 200,
        testedWithCustomCredentials,
      },
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    let httpStatus = 502;
    let errorMessage = err instanceof Error ? err.message : String(err);

    if (err instanceof GatewayAuthError) {
      httpStatus = 401;
    } else if (err instanceof GatewayInvalidRequestError) {
      httpStatus = 400;
    } else if (err instanceof GatewayNetworkError) {
      httpStatus = 504;
    }

    logger.warn('Gateway connection test probe failed', {
      provider: providerSlug,
      error: errorMessage,
      latencyMs,
      httpStatus,
    });

    return {
      providerSlug,
      isConnected: false,
      latencyMs,
      environment: 'sandbox',
      message: `Connection failed: ${errorMessage}`,
      diagnostics: {
        timestamp,
        dnsResolved: !errorMessage.includes('ENOTFOUND'),
        httpStatus,
        errorDetails: errorMessage,
        testedWithCustomCredentials,
      },
    };
  }
}

/**
 * Gate check enforcing that a payment gateway cannot be enabled unless
 * a live test probe returns 100% successful connectivity.
 */
export async function assertGatewayConnectable(
  providerSlug: PaymentProcessorSlug,
  credentials?: Record<string, string> | undefined
): Promise<ConnectionTestReport> {
  const report = await testGatewayConnection({ providerSlug, credentials });
  if (!report.isConnected) {
    throw new Error(
      `Gateway activation blocked for '${providerSlug}': Live connection test failed. Diagnostics: ${report.message}`
    );
  }
  return report;
}
