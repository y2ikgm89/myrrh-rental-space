/**
 * エラーハンドリングユーティリティ（クライアントセーフ）
 *
 * Client Component から安全に import 可能なシンボルのみを export する。
 * サーバー専用シンボル（logError, safeFetch 等）は @/shared/lib/errors/server を使用。
 *
 * @module errors
 */

export {
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
  getErrorMessage,
  ReservationOverlapError,
  isReservationOverlapError,
} from './types'
export type { ErrorLogContext } from './types'
