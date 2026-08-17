/**
 * Resend メール送信（公式ベストプラクティス準拠）
 *
 * - Idempotency Key: retry 時の重複送信防止（公式推奨形式 `<event-type>/<entity-id>`）
 * - Auto retry: 429 / 500 系の named error、およびネットワーク/transport の throw を
 *   exponential backoff で自動再試行
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
import { notifyConnectionApiResult } from "@/shared/lib/integration-health-port";
import { IntegrationKey } from "@/shared/lib/validations/enums/prisma-types";
import { getFromAddress, getResendClientForApiKey } from "./client";
import { normalizeEmailForIdentity } from "./normalize-email";
import { hashSuppressedEmailCandidate } from "./suppression-hash";
import { CreateEmailOptionsSchema } from "./schemas";
import type { EmailResult, EmailSendContext } from "./types";

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

/** payload.to を string[] に正規化（送信前 suppress 判定用） */
function normalizeRecipients(to: CreateEmailOptions["to"]): string[] {
  if (typeof to === "string") return [to];
  if (Array.isArray(to)) return to;
  return [];
}

/**
 * メールを送信する。
 *
 * Settings / suppression / Resend key は domain が `EmailSendContext` に詰めて渡す。
 * transport が無効なら `{ ok: false, reason: "disabled" }` を返す。
 */
export async function sendEmail(
  params: SendEmailParams,
  context: EmailSendContext,
): Promise<EmailResult> {
  const apiKey = context.transport.resendApiKey;
  if (!apiKey) return { ok: false, reason: "disabled" };

  const resend = getResendClientForApiKey(apiKey);

  const {
    payload,
    idempotencyKey,
    operation,
    context: logContext,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = params;

  const recipients = normalizeRecipients(payload.to);
  const suppressedRecipients: string[] = [];
  let filteredRecipients: string[] = recipients;
  if (recipients.length > 0) {
    const suppressedSet = context.suppressedEmailHashes;
    filteredRecipients = [];
    for (const recipient of recipients) {
      const candidateHash = hashSuppressedEmailCandidate(
        normalizeEmailForIdentity(recipient),
      );
      if (suppressedSet.has(candidateHash)) {
        suppressedRecipients.push(recipient);
      } else {
        filteredRecipients.push(recipient);
      }
    }

    if (suppressedRecipients.length > 0 && filteredRecipients.length === 0) {
      logError(
        new Error(
          `All recipients suppressed: ${suppressedRecipients.join(", ")}`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            ...logContext,
            operation,
            ...(idempotencyKey !== undefined && { idempotencyKey }),
            suppressedRecipients,
          },
        },
      );
      return {
        ok: false,
        reason: "suppressed",
        suppressedRecipients,
      };
    }

    if (suppressedRecipients.length > 0) {
      logError(
        new Error(
          `Dropping suppressed recipients: ${suppressedRecipients.join(", ")}`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            ...logContext,
            operation,
            ...(idempotencyKey !== undefined && { idempotencyKey }),
            droppedRecipients: suppressedRecipients,
            remainingRecipients: filteredRecipients,
          },
        },
      );
    }
  }

  const delivery = context.delivery;
  const resolvedReplyTo = payload.replyTo ?? delivery.replyToEmail ?? undefined;

  const errorContext = {
    ...logContext,
    operation,
    ...(idempotencyKey !== undefined && { idempotencyKey }),
  };

  const shouldRewriteTo =
    recipients.length > 0 && suppressedRecipients.length > 0;
  let fullPayload: CreateEmailOptions;
  try {
    fullPayload = CreateEmailOptionsSchema.parse({
      ...payload,
      from: getFromAddress(delivery.senderEmail, delivery.senderName),
      ...(shouldRewriteTo ? { to: filteredRecipients } : {}),
      ...(resolvedReplyTo !== undefined ? { replyTo: resolvedReplyTo } : {}),
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: errorContext,
    });
    return { ok: false, reason: "error", error: "メール送信に失敗しました" };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = idempotencyKey
        ? await resend.emails.send(fullPayload, { idempotencyKey })
        : await resend.emails.send(fullPayload);

      if (!error) {
        const messageId = data?.id ?? "";
        await recordResendHealth({ ok: true });
        return { ok: true, messageId };
      }

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
      await recordResendHealth({ ok: false, reason: "error" }, error);
      return { ok: false, reason: "error", error: "メール送信に失敗しました" };
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }

      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          ...errorContext,
          attempt: attempt + 1,
        },
      });
      await recordResendHealth({ ok: false, reason: "error" }, error);
      return { ok: false, reason: "error", error: "メール送信に失敗しました" };
    }
  }

  await recordResendHealth({ ok: false, reason: "error" });
  return { ok: false, reason: "error", error: "メール送信に失敗しました" };
}

async function recordResendHealth(
  result: { ok: boolean; reason?: string },
  error?: unknown,
): Promise<void> {
  if (result.ok) {
    await notifyConnectionApiResult(IntegrationKey.RESEND, { success: true });
    return;
  }
  if (result.reason !== "error") return;
  await notifyConnectionApiResult(IntegrationKey.RESEND, {
    success: false,
    error: error ?? new Error("Resend send failed"),
  });
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
