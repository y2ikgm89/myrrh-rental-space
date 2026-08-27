/**
 * エラーハンドリング共通型定義
 */

/**
 * エラーカテゴリ - 発生源による分類
 */
export type ErrorCategory =
  | "DATABASE"
  | "EXTERNAL_API"
  | "VALIDATION"
  | "AUTHORIZATION"
  | "CACHE"
  | "UNKNOWN";

export const ErrorCategory: Record<ErrorCategory, ErrorCategory> = {
  DATABASE: "DATABASE",
  EXTERNAL_API: "EXTERNAL_API",
  VALIDATION: "VALIDATION",
  AUTHORIZATION: "AUTHORIZATION",
  CACHE: "CACHE",
  UNKNOWN: "UNKNOWN",
};

/**
 * エラー深刻度 - 対応の緊急性による分類
 */
export type ErrorSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const ErrorSeverity: Record<ErrorSeverity, ErrorSeverity> = {
  /** システム障害、ユーザーは続行不可 */
  CRITICAL: "CRITICAL",
  /** 機能障害、フォールバック利用可能 */
  HIGH: "HIGH",
  /** 部分的障害、機能低下 */
  MEDIUM: "MEDIUM",
  /** 軽微な問題、サイレント回復 */
  LOW: "LOW",
};

/**
 * エラーログコンテキスト
 */
export interface ErrorLogContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  context?: Record<string, unknown>;
  userId?: string;
  timestamp?: Date;
}

// =============================================================================
// Error Utilities
// =============================================================================

/** error 形状のオブジェクトから拾う慣用フィールド（並びがそのまま message の順）。 */
const NON_ERROR_FIELDS = ["name", "code", "status", "message"] as const;

/** 組み立てた message の上限。長い payload をそのまま持ち回らない。 */
const MAX_NON_ERROR_MESSAGE_LENGTH = 500;

/**
 * error 形状の field が 1 つも無いときの戻り値。
 *
 * 従来の `String(value)` と同じ結果だが、**明示的に書く**。narrowing 後の値に
 * 対する `String()` は `@typescript-eslint/no-base-to-string` が正しく指摘する
 * とおり必ずこの文字列になるので、呼び出しに見せかけない。
 *
 * 独自 `toString` を持つオブジェクトは意図的に特別扱いしない — error 形状では
 * ないし、任意の `toString` を呼ぶこと自体が同じルールの警告対象。
 */
const UNDESCRIBABLE_OBJECT = "[object Object]";

function isNonErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 非 Error の値を人が読める文字列にする。
 *
 * `String(value)` は plain object を **`"[object Object]"`** に潰し、原因を完全に
 * 失う。実測: CI run 33028420525 で Cloud Error Reporting に
 * `Error: [object Object]` が `@type ReportedErrorEvent` として入っていた
 * （Resend の接続失敗。何が起きたのか一切残っていない）。
 *
 * **payload を丸ごと文字列化はしない。** この戻り値は UI にも出るため、拾うのは
 * error 形状の慣用フィールドだけに限り、露出の度合いを「Error の `message` を
 * そのまま見せている現状」と揃える。該当が 1 つも無ければ元の `String()` に戻す
 * （`"[object Object]"` になるが、少なくとも今より悪くはならない）。
 */
function describeNonError(value: unknown): string {
  if (!isNonErrorRecord(value)) {
    return String(value);
  }

  const parts: string[] = [];
  for (const field of NON_ERROR_FIELDS) {
    const raw = value[field];
    if (typeof raw === "string" && raw !== "") {
      parts.push(`${field}=${raw}`);
    } else if (typeof raw === "number") {
      parts.push(`${field}=${String(raw)}`);
    }
  }
  if (parts.length === 0) {
    return UNDESCRIBABLE_OBJECT;
  }

  const described = parts.join(" ");
  return described.length > MAX_NON_ERROR_MESSAGE_LENGTH
    ? `${described.slice(0, MAX_NON_ERROR_MESSAGE_LENGTH)}…`
    : described;
}

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
    return error;
  }
  return new Error(describeNonError(error));
}

/**
 * エラーメッセージを安全に取得
 *
 * @param error - catch句で受け取った不明な値
 * @returns エラーメッセージ文字列
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return describeNonError(error);
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
  readonly code = "RESERVATION_OVERLAP" as const;

  constructor(message = "選択された時間帯は既に予約されています") {
    super(message);
    this.name = "ReservationOverlapError";
  }
}

/**
 * ReservationOverlapError の型ガード
 */
export function isReservationOverlapError(
  error: unknown,
): error is ReservationOverlapError {
  return error instanceof ReservationOverlapError;
}
