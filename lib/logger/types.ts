// path: lib/logger/types.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  correlationId?: string | undefined;
  tenantId?: string | undefined;
  userId?: string | undefined;
  path?: string | undefined;
  [key: string]: unknown;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string | undefined;
  code?: string | number | undefined;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string | undefined;
  tenantId?: string | undefined;
  userId?: string | undefined;
  meta?: Record<string, unknown> | undefined;
  error?: SerializedError | undefined;
}

export interface LoggerConfig {
  minLevel?: LogLevel | undefined;
  enableRedaction?: boolean | undefined;
  outputFn?: ((entry: LogEntry) => void) | undefined;
}
