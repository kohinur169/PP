// path: lib/logger/logger.ts
import type { LogLevel, LogEntry, LoggerConfig, LogContext, SerializedError } from './types';
import { getLogContext } from './context';
import { redactValue } from './redact';

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export class Logger {
  private minLevel: LogLevel;
  private enableRedaction: boolean;
  private outputFn?: ((entry: LogEntry) => void) | undefined;
  private childContext: LogContext;

  constructor(config?: LoggerConfig, childContext: LogContext = {}) {
    this.minLevel = config?.minLevel ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    this.enableRedaction = config?.enableRedaction ?? true;
    this.outputFn = config?.outputFn;
    this.childContext = childContext;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.minLevel];
  }

  private serializeError(error: unknown): SerializedError | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as { code?: string | number }).code,
      };
    }

    if (typeof error === 'string') {
      return {
        name: 'Error',
        message: error,
      };
    }

    return {
      name: 'UnknownError',
      message: JSON.stringify(error),
    };
  }

  private emit(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown> | undefined,
    error?: unknown
  ): LogEntry {
    const activeContext = getLogContext();
    const mergedContext = { ...activeContext, ...this.childContext };

    let processedMeta = meta;
    let processedError = this.serializeError(error);

    if (this.enableRedaction) {
      if (processedMeta) {
        processedMeta = redactValue(processedMeta) as Record<string, unknown>;
      }
      if (processedError) {
        processedError = redactValue(processedError) as SerializedError;
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: mergedContext.correlationId,
      tenantId: mergedContext.tenantId,
      userId: mergedContext.userId,
      meta: processedMeta,
      error: processedError,
    };

    if (this.outputFn) {
      this.outputFn(entry);
    } else {
      const jsonLine = JSON.stringify(entry);
      if (level === 'error' || level === 'fatal') {
        process.stderr.write(jsonLine + '\n');
      } else {
        process.stdout.write(jsonLine + '\n');
      }
    }

    return entry;
  }

  debug(message: string, meta?: Record<string, unknown> | undefined): LogEntry | undefined {
    if (!this.shouldLog('debug')) return undefined;
    return this.emit('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown> | undefined): LogEntry | undefined {
    if (!this.shouldLog('info')) return undefined;
    return this.emit('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown> | undefined): LogEntry | undefined {
    if (!this.shouldLog('warn')) return undefined;
    return this.emit('warn', message, meta);
  }

  error(
    message: string,
    error?: unknown,
    meta?: Record<string, unknown> | undefined
  ): LogEntry | undefined {
    if (!this.shouldLog('error')) return undefined;
    return this.emit('error', message, meta, error);
  }

  fatal(
    message: string,
    error?: unknown,
    meta?: Record<string, unknown> | undefined
  ): LogEntry | undefined {
    if (!this.shouldLog('fatal')) return undefined;
    return this.emit('fatal', message, meta, error);
  }

  child(bindings: LogContext): Logger {
    return new Logger(
      {
        minLevel: this.minLevel,
        enableRedaction: this.enableRedaction,
        outputFn: this.outputFn,
      },
      { ...this.childContext, ...bindings }
    );
  }
}

export const logger = new Logger();
