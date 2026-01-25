/**
 * エラーハンドリング共通型定義
 */

/**
 * エラーカテゴリ - 発生源による分類
 */
export type ErrorCategory =
  | 'DATABASE'
  | 'EXTERNAL_API'
  | 'VALIDATION'
  | 'AUTHORIZATION'
  | 'CACHE'
  | 'UNKNOWN'

export const ErrorCategory: Record<ErrorCategory, ErrorCategory> = {
  DATABASE: 'DATABASE',
  EXTERNAL_API: 'EXTERNAL_API',
  VALIDATION: 'VALIDATION',
  AUTHORIZATION: 'AUTHORIZATION',
  CACHE: 'CACHE',
  UNKNOWN: 'UNKNOWN',
}

/**
 * エラー深刻度 - 対応の緊急性による分類
 */
export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const ErrorSeverity: Record<ErrorSeverity, ErrorSeverity> = {
  /** システム障害、ユーザーは続行不可 */
  CRITICAL: 'CRITICAL',
  /** 機能障害、フォールバック利用可能 */
  HIGH: 'HIGH',
  /** 部分的障害、機能低下 */
  MEDIUM: 'MEDIUM',
  /** 軽微な問題、サイレント回復 */
  LOW: 'LOW',
}

/**
 * エラーログコンテキスト
 */
export interface ErrorLogContext {
  category: ErrorCategory
  severity: ErrorSeverity
  context?: Record<string, unknown>
  userId?: string
  timestamp?: Date
}

// =============================================================================
// Error Utilities
// =============================================================================

/**
 * 不明な値をErrorオブジェクトに正規化
 *
 * catch句で受け取る`unknown`型のエラーを安全にErrorオブジェクトに変換します。
 *
 * @param error - catch句で受け取った不明な値
 * @returns Errorオブジェクト
 *
 * @example
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   logError(normalizeError(error), { category: ErrorCategory.DATABASE, ... })
 * }
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}

/**
 * エラーメッセージを安全に取得
 *
 * @param error - catch句で受け取った不明な値
 * @returns エラーメッセージ文字列
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

// =============================================================================
// Domain-Specific Errors
// =============================================================================

/**
 * 予約重複検出エラー
 *
 * トランザクション内で予約の重複が検出された場合にスローされます。
 * Race Condition防止のため、トランザクション内で再チェックを行い、
 * 重複が見つかった場合にこのエラーをスローします。
 */
export class ReservationOverlapError extends Error {
  readonly code = 'RESERVATION_OVERLAP' as const

  constructor(message = '選択された時間帯は既に予約されています') {
    super(message)
    this.name = 'ReservationOverlapError'
  }
}

/**
 * ReservationOverlapError の型ガード
 */
export function isReservationOverlapError(error: unknown): error is ReservationOverlapError {
  return error instanceof ReservationOverlapError
}
