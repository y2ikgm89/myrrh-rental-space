/**
 * Resend メール送信（公式ベストプラクティス準拠）
 *
 * - Idempotency Key: retry 時の重複送信防止（公式推奨形式 `<event-type>/<entity-id>`）
 * - Auto retry: 429 / 500 系を exponential backoff で自動再試行
 * - 400 / 401 / 403 / 404 / 409 / 422 は即時失敗（公式推奨: 再試行しない）
 *
 * @see https://resend.com/docs/ai-onboarding
 * @see https://resend.com/docs/dashboard/emails/idempotency-keys
 * @module shared/lib/email/send
 */

import "server-only";
import { createHash } from "node:crypto";
import type { CreateEmailOptions } from "resend";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import { getEmailDeliverySettings } from "@/shared/domain/settings/queries/notification";
import { getFromAddress, getResendClient, isEmailEnabled } from "./client";
import { CreateEmailOptionsSchema } from "./schemas";
import type { EmailResult } from "./types";

/** Resend 公式が retry を推奨するエラー名（429 / 500 系） */
const RETRYABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  "rate_limit_exceeded",
  "internal_server_error",
  "application_error",
]);

/** デフォルト最大リトライ回数（公式推奨: 3-5） */
const DEFAULT_MAX_RETRIES = 3;

/** 初期バックオフ（ms）。実際の待機時間は `INITIAL_BACKOFF_MS * 2^attempt + jitter` */
const INITIAL_BACKOFF_MS = 1000;

/** `from` は `getFromAddress()` で自動設定するため payload から除外 */
export type EmailPayload = Omit<CreateEmailOptions, "from">;

export type SendEmailParams = {
  /** Resend `emails.send()` の payload（`from` は自動設定） */
  payload: EmailPayload;
  /**
   * 重複送信防止キー。公式推奨形式 `<event-type>/<entity-id>`（最大 256 文字、24 時間有効）。
   * 再実行時に同一キーなら元レスポンスが返り、異なる payload なら 409 エラー。
   */
  idempotencyKey?: string;
  /** エラーログ用オペレーション名 */
  operation: string;
  /** エラーログ用追加コンテキスト */
  context?: Record<string, unknown>;
  /** 最大リトライ回数（デフォルト: {@link DEFAULT_MAX_RETRIES}） */
  maxRetries?: number;
};

/**
 * メールを送信する。
 *
 * env / 管理画面のいずれにも Resend API キーが無い場合は no-op（`{ success: true }` を返す）。
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  if (!(await isEmailEnabled())) return { success: true };

  const resend = await getResendClient();
  if (!resend) return { success: true };

  const {
    payload,
    idempotencyKey,
    operation,
    context,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = params;

  // 返信先(reply-to)は管理画面設定（settings.replyToEmail）を全送信に注入する。
  // 個別の payload が replyTo を明示していればそちらを優先する。
  const { replyToEmail } = await getEmailDeliverySettings();
  const resolvedReplyTo = payload.replyTo ?? replyToEmail ?? undefined;

  // Resend `CreateEmailOptions` is a discriminated union (react / html / text / template variants).
  // `Omit<U, "from">` + spread does not round-trip back to the original union under
  // `exactOptionalPropertyTypes: true`. Zod 4 公式 `z.custom<T>` で SDK 境界を narrow する。
  const fullPayload = CreateEmailOptionsSchema.parse({
    ...payload,
    from: getFromAddress(),
    ...(resolvedReplyTo !== undefined ? { replyTo: resolvedReplyTo } : {}),
  });

  const errorContext = {
    ...context,
    operation,
    ...(idempotencyKey !== undefined && { idempotencyKey }),
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { error } = idempotencyKey
        ? await resend.emails.send(fullPayload, { idempotencyKey })
        : await resend.emails.send(fullPayload);

      if (!error) return { success: true };

      if (attempt < maxRetries && RETRYABLE_ERROR_NAMES.has(error.name)) {
        await sleep(backoffMs(attempt));
        continue;
      }

      logError(new Error(error.message), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          ...errorContext,
          errorName: error.name,
          attempt: attempt + 1,
        },
      });
      return { success: false, error: "メール送信に失敗しました" };
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: errorContext,
      });
      return { success: false, error: "メール送信に失敗しました" };
    }
  }

  return { success: false, error: "メール送信に失敗しました" };
}

/**
 * URL / トークン / メールアドレス等から idempotency key 用の短い sha256 ハッシュを生成する。
 * 256 文字制限内に収まるよう先頭 32 文字のみ返す。
 */
export function hashForKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function backoffMs(attempt: number): number {
  const base = INITIAL_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * 200;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
