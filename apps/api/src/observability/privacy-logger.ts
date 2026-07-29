import type { LoggerService } from "@nestjs/common";

const REDACTED = "[REDACTED]" as const;
const CIRCULAR = "[CIRCULAR]" as const;
const MAX_SAFE_DEPTH = 4;
const MAX_SAFE_VALUE_LENGTH = 256;

const allowedOperationalKeys = new Set([
  "correlationid",
  "requestid",
  "operationname",
  "importid",
  "jobid",
  "statuscode",
  "duration",
  "durationms",
  "retrycount",
  "errorcode",
  "eventid",
  "filesizebucket",
  "pagecountbucket",
  "languagecategory",
  "errorcategory",
]);

const deniedKeyFragments = [
  "address",
  "authorization",
  "body",
  "buffer",
  "connectionstring",
  "contact",
  "cookie",
  "credential",
  "email",
  "file",
  "filename",
  "header",
  "modelinput",
  "modeloutput",
  "password",
  "phone",
  "prompt",
  "rawtext",
  "requestbody",
  "resume",
  "secret",
  "signedreference",
  "snippet",
  "sourcecontent",
  "stack",
  "stream",
  "token",
  "upload",
];

const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const safeEventPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export type PrivacyLogLevel =
  "debug" | "info" | "warn" | "error" | "verbose" | "fatal";

export type PrivacyLogValue =
  | string
  | number
  | boolean
  | null
  | readonly PrivacyLogValue[]
  | { readonly [key: string]: PrivacyLogValue };

export interface PrivacyLogRecord {
  readonly level: PrivacyLogLevel;
  readonly event: string;
  readonly metadata: Readonly<Record<string, PrivacyLogValue>>;
}

export interface PrivacyLogSink {
  write(record: PrivacyLogRecord): void;
}

export interface PrivacyLoggerOptions {
  /**
   * Production mode is explicit so callers never need to pass process.env.
   * Stack traces and arbitrary Error properties are omitted in every mode.
   */
  readonly production?: boolean;
}

/**
 * A provider-ready, Nest LoggerService-compatible logger. It emits records only
 * to the injected sink; tests and application code do not depend on console IO.
 */
export class PrivacyLogger implements LoggerService {
  constructor(
    private readonly sink: PrivacyLogSink,
    private readonly options: PrivacyLoggerOptions = {},
  ) {}

  info(event: string, metadata: Readonly<Record<string, unknown>> = {}): void {
    this.emit("info", event, metadata);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emitFromNestCall("info", message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emitFromNestCall("warn", message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emitFromNestCall("error", message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emitFromNestCall("debug", message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emitFromNestCall("verbose", message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emitFromNestCall("fatal", message, optionalParams);
  }

  private emitFromNestCall(
    level: PrivacyLogLevel,
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    const event = typeof message === "string" ? message : "application.event";
    const candidateMetadata = optionalParams.find(isRecord);
    const metadata: Record<string, unknown> =
      candidateMetadata === undefined ? {} : { ...candidateMetadata };

    if (message instanceof Error) {
      metadata.error = message;
    }
    this.emit(level, event, metadata);
  }

  private emit(
    level: PrivacyLogLevel,
    event: string,
    metadata: Readonly<Record<string, unknown>>,
  ): void {
    void this.options.production;
    this.sink.write(
      Object.freeze({
        level,
        event: sanitizeEvent(event),
        metadata: Object.freeze(sanitizeMetadata(metadata)),
      }),
    );
  }
}

function sanitizeEvent(event: string): string {
  return event.length <= MAX_SAFE_VALUE_LENGTH && safeEventPattern.test(event)
    ? event
    : "application.event";
}

function sanitizeMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, PrivacyLogValue> {
  const seen = new WeakSet<object>();
  const sanitized: Record<string, PrivacyLogValue> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = normalizeKey(key);
    if (isDeniedKey(normalizedKey)) {
      sanitized[key] = REDACTED;
      continue;
    }
    if (normalizedKey === "error" && value instanceof Error) {
      sanitized[key] = sanitizeError(value);
      continue;
    }
    if (!allowedOperationalKeys.has(normalizedKey)) {
      sanitized[key] = REDACTED;
      continue;
    }
    sanitized[key] = sanitizeAllowedValue(value, 0, seen);
  }

  return sanitized;
}

function sanitizeAllowedValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): PrivacyLogValue {
  if (depth >= MAX_SAFE_DEPTH) {
    return REDACTED;
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : REDACTED;
  }
  if (typeof value === "string") {
    return value.length <= MAX_SAFE_VALUE_LENGTH &&
      safeIdentifierPattern.test(value)
      ? value
      : REDACTED;
  }
  if (
    value instanceof Error ||
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    isStreamLike(value) ||
    typeof value !== "object"
  ) {
    return REDACTED;
  }
  if (seen.has(value)) {
    return CIRCULAR;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeAllowedValue(item, depth + 1, seen));
  }

  const sanitized: Record<string, PrivacyLogValue> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    sanitized[key] =
      isDeniedKey(normalizedKey) || !allowedOperationalKeys.has(normalizedKey)
        ? REDACTED
        : sanitizeAllowedValue(nestedValue, depth + 1, seen);
  }
  return sanitized;
}

function sanitizeError(error: Error): PrivacyLogValue {
  return {
    name:
      error.name.length <= 64 && safeIdentifierPattern.test(error.name)
        ? error.name
        : "Error",
    message: REDACTED,
  };
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isDeniedKey(normalizedKey: string): boolean {
  return deniedKeyFragments.some((fragment) =>
    normalizedKey.includes(fragment),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStreamLike(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.pipe === "function" ||
    typeof value.read === "function" ||
    typeof value.write === "function"
  );
}
