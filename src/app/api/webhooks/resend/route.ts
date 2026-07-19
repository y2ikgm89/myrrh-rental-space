/**
 * Resend Webhook API
 *
 * Resend からの Webhook イベントを受信し、Customer の
 * `emailDeliveryStatus` を更新する。Gmail Feb 2024 / Yahoo bulk sender
 * 要件 (complaint rate < 0.3%) 対応として、bounce / complaint を観測した
 * 宛先には sendEmail() 側で送信前に suppression を効かせる。
 *
 * ## 処理イベント（Resend 公式）
 * - email.bounced (bounce.type=Permanent) → HARD_BOUNCED
 * - email.bounced (bounce.type=Temporary) → SOFT_BOUNCED
 * - email.complained → COMPLAINED
 * - email.failed → HARD_BOUNCED（permanent send failure、L3）
 * - email.suppressed → HARD_BOUNCED（Resend 側 suppression list ヒットで
 *   送信ブロック。ローカルの suppression 状態も同期しておく、L3）
 * - その他 (sent / delivered / opened / clicked / delivery_delayed 等) は 200 で ack
 *
 * ## 署名検証（M4）
 * Resend は Webhook の署名を Standard Webhooks 仕様（旧 svix 形式）で送信する。
 * 検証は `standardwebhooks` パッケージ (Resend SDK が内部で使う同じ実装) の
 * `new Webhook(secret).verify(payload, headers)` を直接呼ぶ。
 *
 * 旧実装は `resend.webhooks.verify` を経由していたため、outbound 送信用の
 * API キー (env or DB) が未設定だと webhook まで 503 で落ちる silent bug に
 * なっていた（API キーローテーション中は全イベントが drop）。署名検証には
 * `RESEND_WEBHOOK_SECRET` のみ必要で API キーは無関係のため、outbound
 * client と decoupling する（M4）。
 *
 * @see https://resend.com/docs/webhooks/verify-webhooks-requests
 * @see https://resend.com/docs/webhooks/emails/bounced
 * @see https://resend.com/docs/webhooks/emails/complained
 * @see https://www.standardwebhooks.com/
 * @module api/webhooks/resend
 */

import { unstable_rethrow } from "next/navigation";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { EmailDeliveryStatus } from "@/shared/lib/validations/enums/prisma-types";
import { updateCustomerEmailDeliveryStatusByEmail } from "@/shared/domain/customers/commands";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { serverEnv } from "@/shared/lib/env/server";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

// =============================================================================
// Webhook payload schemas (Resend 公式 docs 準拠)
// =============================================================================

// `email.bounced.data.bounce` の最小スキーマ。
// type: "Permanent" | "Temporary"（SES と同じ語彙を Resend が踏襲）。
const BounceDetailsSchema = z.object({
  type: z.enum(["Permanent", "Temporary"]).optional(),
  subType: z.string().optional(),
  message: z.string().optional(),
});

// email.failed / email.suppressed の追加情報。
// Resend は失敗理由を data.reason（or data.message）で返す事があるため両方許容。
const FailureDetailsSchema = z.object({
  reason: z.string().optional(),
  message: z.string().optional(),
});

// 全イベント共通: type / created_at / data.to / data.email_id を持つ。
const ResendWebhookEventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().optional(),
    to: z.array(z.string()).optional(),
    bounce: BounceDetailsSchema.optional(),
    // email.failed / email.suppressed で使う失敗理由フィールド。
    reason: z.string().optional(),
    message: z.string().optional(),
    failure: FailureDetailsSchema.optional(),
  }),
});

type ResendWebhookEvent = z.infer<typeof ResendWebhookEventSchema>;

// =============================================================================
// POST /api/webhooks/resend
// =============================================================================

export async function POST(request: Request) {
  try {
    // 1. svix headers の早期チェック（body 読み込み前に偽造・無関係リクエストを弾く）
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return jsonError("Missing svix-* headers", 400);
    }

    // 2. Webhook シークレット（env-only — admin UI から設定させない）
    const webhookSecret = serverEnv.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logError(new Error("RESEND_WEBHOOK_SECRET not configured"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "resendWebhook" },
      });
      return jsonError("Resend webhook not configured", 503);
    }

    // 3. raw body 取得（署名検証に必須 — JSON.parse は使わない）
    const payload = await request.text();

    // 4. 署名検証（M4）—— standardwebhooks を直接呼ぶ。
    //    outbound Resend client (getResendClient) は API キー起因で null に
    //    なりうるため、署名検証を outbound client に依存させると API キー
    //    ローテーション中に webhook が全 drop する silent bug になる。
    //    Resend SDK 内部と同じ header name remap を行う
    //    (svix-* → webhook-*、Standard Webhooks 仕様準拠)。
    let verified: unknown;
    try {
      const wh = new Webhook(webhookSecret);
      verified = wh.verify(payload, {
        "webhook-id": svixId,
        "webhook-timestamp": svixTimestamp,
        "webhook-signature": svixSignature,
      });
    } catch (verifyError) {
      logError(normalizeError(verifyError), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "resendWebhookSignatureVerification" },
      });
      return jsonError("Invalid signature", 400);
    }

    // 5. payload を Zod で narrow（verify は string を JSON.parse して unknown を返す）
    const parsed = ResendWebhookEventSchema.safeParse(verified);
    if (!parsed.success) {
      logError(new Error("Resend webhook payload validation failed"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "resendWebhook",
          zodIssues: parsed.error.issues,
        },
      });
      // 形式不一致は 200 で ack（再送ループを避ける）
      return jsonSuccess({ received: true, handled: false });
    }

    // 6. event 処理
    await handleEvent(parsed.data);

    return jsonSuccess({ received: true });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "resendWebhook" },
    });
    // エラーでも 200 を返す（Resend の指数バックオフ再送を防止）
    return jsonSuccess({ received: false });
  }
}

// =============================================================================
// Event handlers
// =============================================================================

async function handleEvent(event: ResendWebhookEvent): Promise<void> {
  switch (event.type) {
    case "email.bounced":
      await handleBounced(event);
      break;
    case "email.complained":
      await handleComplained(event);
      break;
    case "email.failed":
      // L3: permanent send failure → HARD_BOUNCED としてローカル状態を同期。
      // Resend 側が再送を試みない失敗（ドメイン拒否など）はローカルでも suppress。
      await handleFailedOrSuppressed(event, extractFailureReason(event));
      break;
    case "email.suppressed":
      // L3: Resend の suppression list ヒットで送信ブロックされた宛先も
      //     HARD_BOUNCED に落として同期（次回 sendEmail() を local-side で防止）。
      await handleFailedOrSuppressed(
        event,
        extractFailureReason(event) ?? "Blocked by Resend suppression list",
      );
      break;
    default:
      // sent / delivered / opened / clicked / delivery_delayed 等は ack のみ
      break;
  }
}

/**
 * email.bounced: bounce.type で hard / soft を分岐し Customer を更新。
 * Resend は SES と同じ "Permanent" / "Temporary" 語彙を使う（公式 payload 準拠）。
 */
async function handleBounced(event: ResendWebhookEvent): Promise<void> {
  const recipients = event.data.to ?? [];
  if (recipients.length === 0) return;

  const bounceType = event.data.bounce?.type;
  const reason =
    event.data.bounce?.message ?? event.data.bounce?.subType ?? null;

  const status: EmailDeliveryStatus =
    bounceType === "Permanent"
      ? EmailDeliveryStatus.HARD_BOUNCED
      : EmailDeliveryStatus.SOFT_BOUNCED;

  const totalUpdated = await applyStatusPerRecipient(
    recipients,
    status,
    reason,
    "resendWebhook.handleBounced",
  );

  if (totalUpdated > 0) invalidateCustomerCache();
}

/**
 * email.complained: 受信者がスパム報告 → COMPLAINED で永久 suppress。
 */
async function handleComplained(event: ResendWebhookEvent): Promise<void> {
  const recipients = event.data.to ?? [];
  if (recipients.length === 0) return;

  const totalUpdated = await applyStatusPerRecipient(
    recipients,
    EmailDeliveryStatus.COMPLAINED,
    "Recipient marked email as spam",
    "resendWebhook.handleComplained",
  );

  if (totalUpdated > 0) invalidateCustomerCache();
}

/**
 * L3: email.failed / email.suppressed 共通ハンドラ。
 * どちらも「Resend 側で送信できなかった／ブロックされた宛先」なので
 * HARD_BOUNCED として suppression 対象に載せる。
 */
async function handleFailedOrSuppressed(
  event: ResendWebhookEvent,
  reason: string | null,
): Promise<void> {
  const recipients = event.data.to ?? [];
  if (recipients.length === 0) return;

  const totalUpdated = await applyStatusPerRecipient(
    recipients,
    EmailDeliveryStatus.HARD_BOUNCED,
    reason,
    `resendWebhook.${event.type}`,
  );

  if (totalUpdated > 0) invalidateCustomerCache();
}

function extractFailureReason(event: ResendWebhookEvent): string | null {
  return (
    event.data.reason ??
    event.data.message ??
    event.data.failure?.reason ??
    event.data.failure?.message ??
    null
  );
}

/**
 * PR-J1 (M3) と同じ pattern: recipient ごとに try/catch で分離し、
 * 1 件の Prisma error が残り宛先を巻き添えにしないようにする。
 * domain 側 `updateCustomerEmailDeliveryStatusByEmail` は notIn 保護節で
 * 成功済み recipient を no-op に丸めるため idempotent（再配信で二重処理 OK）。
 */
async function applyStatusPerRecipient(
  recipients: readonly string[],
  status: EmailDeliveryStatus,
  reason: string | null,
  operation: string,
): Promise<number> {
  let totalUpdated = 0;
  for (const recipient of recipients) {
    try {
      totalUpdated += await updateCustomerEmailDeliveryStatusByEmail(
        recipient,
        status,
        reason,
      );
    } catch (recipientError) {
      unstable_rethrow(recipientError);
      logError(normalizeError(recipientError), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation,
          // recipient そのものは PII のため長さ + 先頭 1 文字だけ残す。
          recipientHint: hashRecipient(recipient),
        },
      });
    }
  }
  return totalUpdated;
}

function hashRecipient(email: string): string {
  const trimmed = email.trim();
  const head = trimmed.slice(0, 1);
  return `${head}***(len=${trimmed.length})`;
}

function invalidateCustomerCache(): void {
  // webhook では `{expire:0}` の blocking immediate-expire を使う。
  // sendEmail() 内の getSuppressedEmailSet() ('use cache') が SWR で stale を
  // 返し続けると、bounce / complaint を観測した直後の送信で silent に
  // suppression が効かず、Gmail / Yahoo bulk sender の complaint rate 上限を
  // 押し上げる silent bug になる。
  //
  // skipCdnPurge: true — CUSTOMERS / SUPPRESSED_EMAILS は共に admin-only の
  // private tag (NEXTJS_TAGS_WITHOUT_CDN_MAPPING allowlist)。CDN 経路に emit
  // されないため SITEMAP co-purge を Cloudflare に飛ばす意味が無い
  // (Codex PR #945 review 対応)。
  invalidateSiteWideCacheFromRouteHandler(
    [CACHE_TAGS.CUSTOMERS, CACHE_TAGS.SUPPRESSED_EMAILS],
    { skipCdnPurge: true },
  );
}
