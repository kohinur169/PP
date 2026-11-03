// path: lib/logger/context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LogContext } from './types';

// Global AsyncLocalStorage instance for request tracing across async hops
const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

/**
 * Generates a unique, high-entropy correlation identifier with a timestamp prefix.
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `req_${timestamp}_${randomPart}`;
}

/**
 * Returns the active logging context, or an empty object if called outside a context.
 */
export function getLogContext(): LogContext {
  return asyncLocalStorage.getStore() ?? {};
}

/**
 * Executes an asynchronous or synchronous function within an isolated logging context.
 */
export function runWithContext<T>(context: LogContext, fn: () => T): T {
  const parent = getLogContext();
  const mergedContext: LogContext = {
    ...parent,
    ...context,
    correlationId: context.correlationId ?? parent.correlationId ?? generateCorrelationId(),
  };

  return asyncLocalStorage.run(mergedContext, fn);
}

/**
 * Updates a key-value pair in the active logging context if available.
 */
export function updateLogContext(key: string, value: unknown): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store[key] = value;
  }
}
