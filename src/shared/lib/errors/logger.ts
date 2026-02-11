/**
 * 構造化エラーロガー
 *
 * Server ComponentsとServer Actionsで使用
 * 将来的にSentry等の監視サービスと統合可能
 */

import type { ErrorLogContext } from './types'

interface ErrorDetails {
  message: string
  stack: string | undefined
  category: string
  severity: string
  context: Record<string, unknown> | undefined
  userId: string | undefined
  timestamp: Date
  environment: string | undefined
}

/** Extract a useful message from any thrown value */
function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  // Non-Error objects (e.g. Next.js cache serialization errors): stringify for visibility
  try {
    const json = JSON.stringify(error)
    return json === '{}' ? `[non-Error object: ${Object.getPrototypeOf(error)?.constructor?.name ?? typeof error}]` : json
  } catch {
    return String(error)
  }
}

/**
 * エラーをログ出力
 *
 * 本番環境ではJSON形式、開発環境では読みやすい形式で出力
 */
export function logError(error: unknown, logContext: ErrorLogContext): void {
  const errorDetails: ErrorDetails = {
    message: extractMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
    category: logContext.category,
    severity: logContext.severity,
    context: logContext.context,
    userId: logContext.userId,
    timestamp: logContext.timestamp ?? new Date(),
    environment: process.env.NODE_ENV,
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify(errorDetails))
  } else {
    console.error('[Error]', errorDetails)
  }
}

/**
 * スコープ付きエラーロガーを作成
 *
 * @example
 * const logDbError = createErrorLogger({
 *   category: ErrorCategory.DATABASE,
 *   severity: ErrorSeverity.MEDIUM,
 * })
 * logDbError(error, { context: { table: 'users' } })
 */
export function createErrorLogger(defaultContext: Partial<ErrorLogContext>) {
  return (error: unknown, context?: Partial<ErrorLogContext>) => {
    logError(error, { ...defaultContext, ...context } as ErrorLogContext)
  }
}
