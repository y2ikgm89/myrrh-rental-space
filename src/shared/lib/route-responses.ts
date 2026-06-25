import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * 認証 (401) を示すメッセージパターン。
 * checkAdminAuth が未ログイン時に返す「ログインが必要です」と一致。
 * docs/api-conventions.md の status code 規約に対応。
 */
const UNAUTHENTICATED_MESSAGE_PATTERNS = ["ログイン"] as const;

/**
 * 認可 (403) を示すメッセージパターン。
 * checkPermission / canAccessAdmin が権限不足時に返す
 * 「管理者権限が必要です」「<resource>の<action>権限がありません」
 * 「このリソースへのアクセス権がありません」と一致。
 */
const FORBIDDEN_MESSAGE_PATTERNS = ["権限", "アクセス権"] as const;

/**
 * AuthResult / PermissionResult の error.error メッセージから
 * HTTP status code を判定する。
 *
 * - 未認証 (no session) = 401
 * - 認証済 + 権限不足 = 403
 * - その他 (バリデーション等) = 400
 *
 * @see docs/api-conventions.md
 */
export function getRouteErrorStatus(message: string): number {
  if (
    UNAUTHENTICATED_MESSAGE_PATTERNS.some((pattern) =>
      message.includes(pattern),
    )
  ) {
    return 401;
  }
  if (FORBIDDEN_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return 403;
  }
  return 400;
}

export function jsonError(
  error: string,
  status = 400,
): NextResponse<{ error: string }> {
  return NextResponse.json({ error }, { status });
}

export function jsonSuccess<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function jsonValidationError(
  error: ZodError,
  fallback = "入力内容に誤りがあります",
): NextResponse<{ error: string }> {
  return jsonError(error.issues[0]?.message ?? fallback, 400);
}
