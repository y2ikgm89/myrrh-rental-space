/**
 * エラーハンドリングユーティリティ
 *
 * @module errors
 */

export { ErrorCategory, ErrorSeverity } from './types'
export type { ErrorLogContext } from './types'
export { logError, createErrorLogger } from './logger'
export { safeFetch, criticalFetch } from './safe-fetch'
