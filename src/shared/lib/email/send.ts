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
import { EmailDeliveryStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import { getCustomerEmailDeliveryStatusByEmail } from "@/shared/domain/customers/queries";
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

/** sendEmail() 内で suppress 判定対象とする終端 delivery status */
const SUPPRESSED_DELIVERY_STATUSES: ReadonlySet<EmailDeliveryStatus> = new Set([
  EmailDeliveryStatus.HARD_BOUNCED,
  EmailDeliveryStatus.COMPLAINED,
]);

/** payload.to を string[] に正規化（送信前 suppress 判定用） */
function normalizeRecipients(to: CreateEmailOptions["to"]): string[] {
  if (typeof to === "string") return [to];
  if (Array.isArray(to)) return to;
  return [];
}

/**
 * メールを送信する。
 *
 * Resend API キーが env / 管理画面のいずれにも無い場合は `{ ok: false, reason: "disabled" }` を返す。
 * 既存テンプレ送信経路は `result.ok === false` を「失敗」として log するため動作不変。
 * テスト送信機能は `reason: "disabled"` を「警告」、`reason: "error"` を「エラー」として UI 上区別する。
 *
 * ## Resend Webhook suppression (Gmail Feb 2024 / Yahoo bulk sender 要件 — complaint rate < 0.3%)
 * 宛先の `Customer.emailDeliveryStatus` が `HARD_BOUNCED` / `COMPLAINED` のときは送信せず
 * `{ ok: false, reason: "disabled" }` を返し、監査ログに残す（Resend 側の suppression list を
 * アプリ層で先取りし、API quota / sender reputation を保護）。
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  if (!(await isEmailEnabled())) return { ok: false, reason: "disabled" };

  const resend = await getResendClient();
  if (!resend) return { ok: false, reason: "disabled" };

  const {
    payload,
    idempotencyKey,
    operation,
    context,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = params;

  // === Resend Webhook 由来の suppression check（送信前） ===
  // 宛先のいずれかが HARD_BOUNCED / COMPLAINED なら no-op + audit log。
  // 配信状態は Customer.email (unique) でのみ追跡しているため、
  // staff / system 宛先（DB に Customer レコードなし）は素通りする。
  const recipients = normalizeRecipients(payload.to);
  for (const recipient of recipients) {
    const status = await getCustomerEmailDeliveryStatusByEmail(recipient);
    if (status && SUPPRESSED_DELIVERY_STATUSES.has(status)) {
      logError(
        new Error(`Email suppressed: recipient delivery status is ${status}`),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            ...context,
            operation,
            ...(idempotencyKey !== undefined && { idempotencyKey }),
            recipient,
            deliveryStatus: status,
          },
        },
      );
      return { ok: false, reason: "disabled" };
    }
  }

  // 送信元(from)と返信先(reply-to)は管理画面設定（env 優先・DB フォールバック）を
  // 注入する。個別の payload が replyTo を明示していればそちらを優先する。
  const delivery = await getEmailDeliverySettings();
  const resolvedReplyTo = payload.replyTo ?? delivery.replyToEmail ?? undefined;

  // Resend `CreateEmailOptions` is a discriminated union (react / html / text / template variants).
  // `Omit<U, "from">` + spread does not round-trip back to the original union under
  // `exactOptionalPropertyTypes: true`. Zod 4 公式 `z.custom<T>` で SDK 境界を narrow する。
  const fullPayload = CreateEmailOptionsSchema.parse({
    ...payload,
    from: getFromAddress(delivery.senderEmail, delivery.senderName),
    ...(resolvedReplyTo !== undefined ? { replyTo: resolvedReplyTo } : {}),
  });

  const errorContext = {
    ...context,
    operation,
    ...(idempotencyKey !== undefined && { idempotencyKey }),
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = idempotencyKey
        ? await resend.emails.send(fullPayload, { idempotencyKey })
        : await resend.emails.send(fullPayload);

      if (!error) {
        const messageId = data?.id ?? "";
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
      return { ok: false, reason: "error", error: "メール送信に失敗しました" };
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: errorContext,
      });
      return { ok: false, reason: "error", error: "メール送信に失敗しました" };
    }
  }

  return { ok: false, reason: "error", error: "メール送信に失敗しました" };
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
