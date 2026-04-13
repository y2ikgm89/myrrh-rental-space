/**
 * 共通メール送信ロジック
 *
 * Resend API 呼び出しとエラーハンドリングを一箇所に集約。
 *
 * @module shared/lib/email/send
 */

import "server-only";
import type { Resend } from "resend";
import { getResendClient, getFromAddress, isEmailEnabled } from "./client";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "../errors/server";
import type { EmailResult } from "./types";

/**
 * メールを送信する共通関数
 *
 * Email が無効、または Resend クライアントが取得できない場合は
 * `{ success: true }` を返してスキップします。
 *
 * @param fn - Resend クライアントを受け取り `resend.emails.send()` を呼び出すコールバック
 * @param context - エラーログ用のコンテキスト情報
 * @returns 送信結果
 */
export async function sendEmail(
  fn: (
    resend: Resend,
    from: string,
  ) => Promise<{ error: { message: string } | null }>,
  context: Record<string, unknown>,
): Promise<EmailResult> {
  if (!isEmailEnabled()) {
    return { success: true };
  }

  const resend = getResendClient();
  if (!resend) {
    return { success: true };
  }

  try {
    const { error: sendError } = await fn(resend, getFromAddress());

    if (sendError) {
      logError(new Error(sendError.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context,
      });
      return { success: false, error: "メール送信に失敗しました" };
    }

    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context,
    });
    return { success: false, error: "メール送信に失敗しました" };
  }
}

export { isEmailEnabled, getFromAddress };
