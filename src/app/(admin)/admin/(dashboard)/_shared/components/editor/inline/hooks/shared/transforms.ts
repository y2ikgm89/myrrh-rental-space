/**
 * 型安全な変換関数
 *
 * フォームデータ ⇔ サーバーデータの変換ユーティリティ
 * 型アサーション完全排除
 */

import { isValidLayoutWidth } from "@/shared/lib/validations/enums/guards";
import type { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import {
  formatDateTimeLocalInJst,
  parseDateTimeLocalAsJst,
} from "@/shared/lib/date-format";

// =============================================================================
// 日時変換（`@/shared/lib/date-format` の SSoT helper を経由）
// =============================================================================

/**
 * Date 型から `<input type="datetime-local">` 用の JST 文字列に変換。
 * 旧 `format(d, "yyyy-MM-dd'T'HH:mm")` (date-fns) はブラウザ tz 依存だったため、
 * `formatDateTimeLocalInJst`（`Asia/Tokyo` 固定）に統一。
 */
export function toFormDateString(
  date: Date | string | null | undefined,
): string {
  if (!date) return "";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return "";
  return formatDateTimeLocalInJst(dateObj);
}

/**
 * フォーム文字列（datetime-local 形式）から Date 型に変換。
 * 旧 `new Date(value)` はサーバ tz 解釈で UTC ずれを起こしていたため、
 * `parseDateTimeLocalAsJst`（JST 固定 parse → UTC Date）に統一。
 */
export function toSubmitDate(value: string): Date | undefined {
  if (!value) return undefined;
  const date = parseDateTimeLocalAsJst(value);
  return isNaN(date.getTime()) ? undefined : date;
}

// =============================================================================
// コンテンツ幅変換
// =============================================================================

/**
 * LayoutWidthからフォーム用文字列に変換
 * @param width - LayoutWidth | null | undefined
 * @returns 文字列（nullの場合は空文字列）
 */
export function toFormContentWidth(
  width: LayoutWidth | null | undefined,
): string {
  return width ?? "";
}

/**
 * フォーム文字列からLayoutWidthに変換（送信用）
 * @param value - フォームの文字列（optional型にも対応）
 * @returns LayoutWidth | null（無効な値の場合はnull）
 */
export function toSubmitContentWidth(
  value: string | undefined,
): LayoutWidth | null {
  return value && isValidLayoutWidth(value) ? value : null;
}

/**
 * フォーム文字列からLayoutWidthに変換（undefined版）
 * @param value - フォームの文字列（optional型にも対応）
 * @returns LayoutWidth | undefined
 */
export function toSubmitContentWidthUndefined(
  value: string | undefined,
): LayoutWidth | undefined {
  return value && isValidLayoutWidth(value) ? value : undefined;
}

// =============================================================================
// 数値変換
// =============================================================================

/**
 * 数値からフォーム用文字列に変換
 * @param value - number | null | undefined
 * @returns 文字列
 */
export function toFormNumberString(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * フォーム文字列から数値に変換（送信用）
 * @param value - フォームの文字列（optional型にも対応）
 * @returns number | null（空文字列またはundefinedの場合はnull）
 */
export function toSubmitNumber(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

/**
 * フォーム文字列から数値に変換（undefined版）
 * @param value - フォームの文字列（optional型にも対応）
 * @returns number | undefined
 */
export function toSubmitNumberUndefined(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

// =============================================================================
// オプション文字列変換
// =============================================================================

/**
 * nullable文字列からフォーム用文字列に変換
 * @param value - string | null | undefined
 * @returns 文字列（nullの場合は空文字列）
 */
export function toFormString(value: string | null | undefined): string {
  return value ?? "";
}

/**
 * フォーム文字列からnullable文字列に変換（送信用）
 * @param value - フォームの文字列（optional型にも対応）
 * @returns string | null（空文字列またはundefinedの場合はnull）
 */
export function toNullableString(value: string | undefined): string | null {
  return value || null;
}

/**
 * フォーム文字列からundefinedable文字列に変換（送信用）
 * @param value - フォームの文字列（optional型にも対応）
 * @returns string | undefined（空文字列またはundefinedの場合はundefined）
 */
export function toUndefinedString(
  value: string | undefined,
): string | undefined {
  return value || undefined;
}

// =============================================================================
// タグ変換（Post用）
// =============================================================================

/**
 * タグ配列からフォーム用文字列に変換
 * @param tags - string[] | null | undefined
 * @returns カンマ区切り文字列
 */
export function toTagsString(tags: string[] | null | undefined): string {
  return tags?.join(", ") ?? "";
}

/**
 * フォーム文字列からタグ配列に変換（送信用）
 * @param value - カンマ区切り文字列（optional型にも対応）
 * @returns string[]
 */
export function parseTagsString(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// =============================================================================
// nullable boolean変換
// =============================================================================

/**
 * nullable booleanからフォーム用値に変換
 * @param value - boolean | null | undefined
 * @returns boolean | null
 */
export function toFormNullableBoolean(
  value: boolean | null | undefined,
): boolean | null {
  return value ?? null;
}
