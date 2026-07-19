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
 * - email.bounced (bounce.type=Transient|Undetermined|その他) → SOFT_BOUNCED
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

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { EmailDeliveryStatus } from "@/shared/lib/validations/enums/prisma-types";
import { updateCustomerEmailDeliveryStatusByEmail } from "@/shared/domain/customers/commands";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
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
// Resend 公式ドキュメントの語彙は "Permanent" | "Transient" | "Undetermined"
// （SES 互換）。旧実装は `z.enum(["Permanent","Temporary"])` で narrow していたため、
// Transient / Undetermined を含む実イベントが Zod parse で弾かれ silent に
// handled:false で 200-ack される silent bug になっていた。
// 未知の値を許容し、下記 handleBounced で "Permanent" 以外を SOFT_BOUNCED に
// マップする（M2）。
const BounceDetailsSchema = z.object({
  type: z.string().optional(),
  subType: z.string().optional(),
  message: z.string().optional(),
});

// Resend / SES 公式の bounce.type 語彙。未知値は observability breadcrumb を残す。
const KNOWN_BOUNCE_TYPES = new Set(["Permanent", "Transient", "Undetermined"]);

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

    // 3. Resend client（envOR DB の API キーから）
    const resend = await getResendClient();
    if (!resend) {
      logError(new Error("Resend client not available"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "resendWebhook" },
      });
      return jsonError("Resend webhook not configured", 503);
    }

    // 4. raw body 取得（署名検証に必須 — JSON.parse は使わない）
    const payload = await request.text();

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
    const result = await handleEvent(parsed.data);

    // M3: 個別 recipient 更新が 1 件でも例外を投げた場合は 500 を返し Resend の
    // 再配信に任せる。domain 側 `updateCustomerEmailDeliveryStatusByEmail` は
    // notIn 保護節で成功済み recipient を no-op に丸めるため idempotent。
    if (result.failed > 0) {
      return jsonError("Partial failure processing recipients", 500);
    }

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

/**
 * イベントごとの処理結果集計。
 * - processed: 実際に Customer 行を書き換えた件数
 * - failed:    per-recipient 例外を吸収した件数（>0 なら top-level が 500 を返し
 *              Resend に再配信させる）
 * - appliedStatus: SUPPRESSED_EMAILS invalidation を発火するかの判定に使う
 *                  （L2: SOFT_BOUNCED は suppression set に含まれないため
 *                  CUSTOMERS のみ purge し SUPPRESSED_EMAILS はスキップする）
 */
type EventHandlerResult = {
  processed: number;
  failed: number;
  appliedStatus: EmailDeliveryStatus | null;
};

async function handleEvent(
  event: ResendWebhookEvent,
): Promise<{ processed: number; failed: number }> {
  switch (event.type) {
    case "email.bounced": {
      const result = await handleBounced(event);
      invalidateCustomerCacheForStatus(result);
      return { processed: result.processed, failed: result.failed };
    }
    case "email.complained": {
      const result = await handleComplained(event);
      invalidateCustomerCacheForStatus(result);
      return { processed: result.processed, failed: result.failed };
    }
    default:
      // sent / delivered / opened / clicked / delivery_delayed 等は ack のみ
      return { processed: 0, failed: 0 };
  }
}

/**
 * email.bounced: bounce.type で hard / soft を分岐し Customer を更新。
 *
 * Resend 公式の bounce.type 語彙は "Permanent" | "Transient" | "Undetermined"
 * （SES 互換）。"Permanent" のみ HARD_BOUNCED にマップし、それ以外
 * （Transient / Undetermined / 未知値 / undefined）は SOFT_BOUNCED として扱う。
 * 未知値は observability のため LOW severity で breadcrumb を残す（M2）。
 */
async function handleBounced(
  event: ResendWebhookEvent,
): Promise<EventHandlerResult> {
  const recipients = event.data.to ?? [];
  if (recipients.length === 0) {
    return { processed: 0, failed: 0, appliedStatus: null };
  }

  const bounceType = event.data.bounce?.type;
  const reason =
    event.data.bounce?.message ?? event.data.bounce?.subType ?? null;

  // 未知の bounce.type は breadcrumb（次回の taxonomy drift を silent に流さない）。
  if (bounceType !== undefined && !KNOWN_BOUNCE_TYPES.has(bounceType)) {
    logError(new Error(`Unknown Resend bounce.type: ${bounceType}`), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "resendWebhook.handleBounced",
        bounceType,
        emailId: event.data.email_id ?? null,
      },
    });
  }

  const status: EmailDeliveryStatus =
    bounceType === "Permanent"
      ? EmailDeliveryStatus.HARD_BOUNCED
      : EmailDeliveryStatus.SOFT_BOUNCED;

  const { processed, failed } = await applyStatusPerRecipient(
    recipients,
    status,
    reason,
    "resendWebhook.handleBounced",
    event.data.email_id ?? null,
  );

  return { processed, failed, appliedStatus: status };
}

/**
 * email.complained: 受信者がスパム報告 → COMPLAINED で永久 suppress。
 */
async function handleComplained(
  event: ResendWebhookEvent,
): Promise<EventHandlerResult> {
  const recipients = event.data.to ?? [];
  if (recipients.length === 0) {
    return { processed: 0, failed: 0, appliedStatus: null };
  }

  const { processed, failed } = await applyStatusPerRecipient(
    recipients,
    EmailDeliveryStatus.COMPLAINED,
    "Recipient marked email as spam",
    "resendWebhook.handleComplained",
    event.data.email_id ?? null,
  );

  return {
    processed,
    failed,
    appliedStatus: EmailDeliveryStatus.COMPLAINED,
  };
}

/**
 * M3: recipient ごとに try/catch で分離して更新する。single throw が残り宛先の
 * 更新を巻き添えにしないよう aggregation する。呼び出し側（POST）は
 * `failed > 0` を検出したら 500 を返し Resend に再配信させる。
 * domain 側の `notIn` 保護節が成功済み recipient を no-op に丸めるため、
 * 再配信で二重処理が起きても副作用は発生しない。
 */
async function applyStatusPerRecipient(
  recipients: readonly string[],
  status: EmailDeliveryStatus,
  reason: string | null,
  operation: string,
  emailId: string | null,
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      const updated = await updateCustomerEmailDeliveryStatusByEmail(
        recipient,
        status,
        reason,
      );
      if (updated > 0) processed += updated;
    } catch (recipientError) {
      unstable_rethrow(recipientError);
      failed += 1;
      logError(normalizeError(recipientError), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation,
          emailId,
          // recipient そのものは PII のため hash / 長さのみ残す。
          recipientHash: hashRecipient(recipient),
        },
      });
    }
  }

  return { processed, failed };
}

function hashRecipient(email: string): string {
  // 単純な長さ + 先頭 1 文字。詳細な調査は Resend 側 dashboard + AuditLog を辿る。
  const trimmed = email.trim();
  const head = trimmed.slice(0, 1);
  return `${head}***(len=${trimmed.length})`;
}

/**
 * L2: SUPPRESSED_EMAILS への tag invalidation は「suppression set が実際に
 * 変わり得る status」の書込に限定する（HARD_BOUNCED / COMPLAINED のみ）。
 * SOFT_BOUNCED は suppression 対象外なのに SUPPRESSED_EMAILS を毎回 purge
 * すると、送信直後のバウンス嵐で cache churn が発生し `getSuppressedEmailSet`
 * の cold read + Prisma 走査を無意味に多発させる。
 *
 * CUSTOMERS 側は admin リストの updatedAt / 状態バッジの反映が要るため
 * SOFT_BOUNCED でも invalidate する。processed==0（notIn 保護で全 no-op）
 * の場合は両方スキップ。
 */
function invalidateCustomerCacheForStatus(result: EventHandlerResult): void {
  if (result.processed === 0 || result.appliedStatus === null) return;

  const isSuppressionStatus =
    result.appliedStatus === EmailDeliveryStatus.HARD_BOUNCED ||
    result.appliedStatus === EmailDeliveryStatus.COMPLAINED;

  const tags = isSuppressionStatus
    ? [CACHE_TAGS.CUSTOMERS, CACHE_TAGS.SUPPRESSED_EMAILS]
    : [CACHE_TAGS.CUSTOMERS];

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
  invalidateSiteWideCacheFromRouteHandler(tags, { skipCdnPurge: true });
}
