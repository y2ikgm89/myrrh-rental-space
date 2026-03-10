/**
 * 安全なデータ取得ラッパー
 *
 * Server Componentsでのデータ取得時のエラーハンドリングを統一
 */

import { logError } from "./logger";
import { ErrorCategory, ErrorSeverity } from "./types";

interface SafeFetchOptions<T> {
  /** データ取得関数 */
  fetch: () => Promise<T>;
  /** エラー時のフォールバック値 */
  fallback: T;
  /** エラーカテゴリ */
  category: ErrorCategory;
  /** エラー深刻度 */
  severity: ErrorSeverity;
  /** 操作名（ログ用） */
  operationName: string;
  /** 追加コンテキスト */
  context?: Record<string, unknown>;
}

interface CriticalFetchOptions<T> {
  /** データ取得関数 */
  fetch: () => Promise<T>;
  /** エラーカテゴリ */
  category: ErrorCategory;
  /** 操作名（ログ用） */
  operationName: string;
  /** 追加コンテキスト */
  context?: Record<string, unknown>;
}

/**
 * 安全なデータ取得
 *
 * エラー時はフォールバック値を返し、エラーをログ出力
 * 非クリティカルなデータ取得に使用
 *
 * @example
 * const items = await safeFetch({
 *   fetch: () => prisma.navigationItem.findMany(...),
 *   fallback: [],
 *   category: ErrorCategory.DATABASE,
 *   severity: ErrorSeverity.MEDIUM,
 *   operationName: 'getNavigationItems',
 * })
 */
export async function safeFetch<T>(options: SafeFetchOptions<T>): Promise<T> {
  try {
    return await options.fetch();
  } catch (error) {
    logError(error, {
      category: options.category,
      severity: options.severity,
      context: {
        ...options.context,
        operation: options.operationName,
        fallbackUsed: true,
      },
    });
    return options.fallback;
  }
}

/**
 * クリティカルなデータ取得
 *
 * エラー時は例外をスローし、エラーバウンダリで処理
 * ページレンダリングに必須のデータ取得に使用
 *
 * @example
 * const post = await criticalFetch({
 *   fetch: () => prisma.blogPost.findUnique(...),
 *   category: ErrorCategory.DATABASE,
 *   operationName: 'getBlogPost',
 * })
 */
export async function criticalFetch<T>(
  options: CriticalFetchOptions<T>,
): Promise<T> {
  try {
    return await options.fetch();
  } catch (error) {
    logError(error, {
      category: options.category,
      severity: ErrorSeverity.CRITICAL,
      context: {
        ...options.context,
        operation: options.operationName,
        critical: true,
      },
    });
    throw error;
  }
}

export { ErrorCategory, ErrorSeverity };
