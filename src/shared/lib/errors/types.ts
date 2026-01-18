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
