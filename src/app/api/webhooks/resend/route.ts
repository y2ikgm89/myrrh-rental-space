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
 * - その他 (sent / delivered / opened / clicked / delivery_delayed 等) は 200 で ack
 *
 * ## 署名検証
 * Resend は Webhook の署名を svix 形式で送信する。SDK の
 * `resend.webhooks.verify` が svix-id / svix-timestamp / svix-signature の
 * 3 ヘッダを使って HMAC 検証を行い、不正なら throw する（official pattern）。
 *
 * @see https://resend.com/docs/webhooks/verify-webhooks-requests
 * @see https://resend.com/docs/webhooks/emails/bounced
 * @see https://resend.com/docs/webhooks/emails/complained
 * @module api/webhooks/resend
 */

import { revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { EmailDeliveryStatus } from "@/shared/lib/validations/enums/prisma-types";
import { updateCustomerEmailDeliveryStatusByEmail } from "@/shared/domain/customers/commands";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { getResendClient } from "@/shared/lib/email/client";
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

// 全イベント共通: type / created_at / data.to / data.email_id を持つ。
const ResendWebhookEventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().optional(),
    to: z.array(z.string()).optional(),
    bounce: BounceDetailsSchema.optional(),
  }),
});

type ResendWebhookEvent = z.infer<typeof ResendWebhookEventSchema>;

// =============================================================================
// POST /api/webhooks/resend
// =============================================================================

export async function POST(request: Request) {
  try {
    // 1. raw body 取得（署名検証に必須 — JSON.parse は使わない）
    const payload = await request.text();

    // 2. svix headers の早期チェック
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return jsonError("Missing svix-* headers", 400);
    }

    // 3. Webhook シークレット（env-only — admin UI から設定させない）
    const webhookSecret = serverEnv.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logError(new Error("RESEND_WEBHOOK_SECRET not configured"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "resendWebhook" },
      });
      return jsonError("Resend webhook not configured", 503);
    }

    // 4. Resend client（envOR DB の API キーから）
    const resend = await getResendClient();
    if (!resend) {
      logError(new Error("Resend client not available"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "resendWebhook" },
      });
      return jsonError("Resend webhook not configured", 503);
    }

    // 5. svix 署名検証（throws on invalid）
    let verified: unknown;
    try {
      verified = resend.webhooks.verify({
        payload,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret,
      });
    } catch (verifyError) {
      logError(normalizeError(verifyError), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "resendWebhookSignatureVerification" },
      });
      return jsonError("Invalid signature", 400);
    }

    // 6. payload を Zod で narrow（SDK の戻りは unknown 相当）
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

    // 7. event 処理
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

  let totalUpdated = 0;
  for (const recipient of recipients) {
    totalUpdated += await updateCustomerEmailDeliveryStatusByEmail(
      recipient,
      status,
      reason,
    );
  }

  if (totalUpdated > 0) invalidateCustomerCache();
}

/**
 * email.complained: 受信者がスパム報告 → COMPLAINED で永久 suppress。
 */
async function handleComplained(event: ResendWebhookEvent): Promise<void> {
  const recipients = event.data.to ?? [];
  if (recipients.length === 0) return;

  let totalUpdated = 0;
  for (const recipient of recipients) {
    totalUpdated += await updateCustomerEmailDeliveryStatusByEmail(
      recipient,
      EmailDeliveryStatus.COMPLAINED,
      "Recipient marked email as spam",
    );
  }

  if (totalUpdated > 0) invalidateCustomerCache();
}

function invalidateCustomerCache(): void {
  revalidateTag(CACHE_TAGS.CUSTOMERS, CACHE_LIFE.DYNAMIC_DATA);
  // sendEmail() 内の getSuppressedEmailSet() ('use cache') を invalidate して
  // bounce / complaint を観測した宛先への次回送信を即時 suppress。
  revalidateTag(CACHE_TAGS.SUPPRESSED_EMAILS, CACHE_LIFE.DYNAMIC_DATA);
}
