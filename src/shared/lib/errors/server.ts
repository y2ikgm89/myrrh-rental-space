/**
 * サーバー専用エラーハンドリングユーティリティ
 *
 * Server Components / Server Actions / API Routes / lib でのみ使用可能。
 * Client Component から import するとビルドエラー。
 *
 * @module errors/server
 */

import "server-only";

export {
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
  getErrorMessage,
  ReservationOverlapError,
  isReservationOverlapError,
} from "./types";
export type { ErrorLogContext } from "./types";
export { logError, createErrorLogger } from "./logger";
export { parseCloudTraceContext } from "./logger-core";
export type {
  HttpRequestPayload,
  LogEnrichment,
  ParsedCloudTraceContext,
} from "./logger-core";
export { safeFetch, criticalFetch } from "./safe-fetch";
