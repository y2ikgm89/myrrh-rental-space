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
 * webhook secret のみ必要で API キーは無関係のため、outbound client と
 * decoupling する（M4）。
 *
 * 秘密は Settings.resendWebhookSecret (DB 暗号化 canonical、Tier 2) →
 * `RESEND_WEBHOOK_SECRET` env fallback (local dev 用) の順で解決する
 * (`getResendWebhookSecret`、stripeWebhookSecret と同パターン)。
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
import { getResendWebhookSecret } from "@/shared/domain/settings/api-key-queries";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
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

// email.failed / email.suppressed の追加情報（L3）。
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
    // email.failed / email.suppressed で使う失敗理由フィールド（L3）。
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

    // 2. Webhook シークレット (DB canonical → env fallback、Tier 2)。
    // [[project_integration-secrets-two-tier-split-2026-07-06]] に従い
    // stripeWebhookSecret と同型で admin UI から rotate 可能な DB 管理を優先。
    // env (`RESEND_WEBHOOK_SECRET`) は local dev 用の fallback のみ。
    const webhookSecret = await getResendWebhookSecret();
    if (!webhookSecret) {
      logError(new Error("Resend webhook secret not configured"), {
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
    // 未知例外は 500 を返し Resend 再配信に任せる（M3 partial failure と同方針）。
    // per-recipient 更新は idempotent なため再送しても安全。
    return jsonError("Internal error processing webhook", 500);
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
    case "email.failed": {
      // L3: permanent send failure → HARD_BOUNCED としてローカル状態を同期。
      // Resend 側が再送を試みない失敗（ドメイン拒否など）はローカルでも suppress。
      const result = await handleFailedOrSuppressed(
        event,
        extractFailureReason(event),
      );
      invalidateCustomerCacheForStatus(result);
      return { processed: result.processed, failed: result.failed };
    }
    case "email.suppressed": {
      // L3: Resend の suppression list ヒットで送信ブロックされた宛先も
      //     HARD_BOUNCED に落として同期（次回 sendEmail() を local-side で防止）。
      const result = await handleFailedOrSuppressed(
        event,
        extractFailureReason(event) ?? "Blocked by Resend suppression list",
      );
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
 * L3: email.failed / email.suppressed 共通ハンドラ。
 * どちらも「Resend 側で送信できなかった／ブロックされた宛先」なので
 * HARD_BOUNCED として suppression 対象に載せる。
 * M3 の per-recipient try/catch + L2 の status-aware invalidator と統合。
 */
async function handleFailedOrSuppressed(
  event: ResendWebhookEvent,
  reason: string | null,
): Promise<EventHandlerResult> {
  const recipients = event.data.to ?? [];
  if (recipients.length === 0) {
    return { processed: 0, failed: 0, appliedStatus: null };
  }

  const { processed, failed } = await applyStatusPerRecipient(
    recipients,
    EmailDeliveryStatus.HARD_BOUNCED,
    reason,
    `resendWebhook.${event.type}`,
    event.data.email_id ?? null,
  );

  return {
    processed,
    failed,
    appliedStatus: EmailDeliveryStatus.HARD_BOUNCED,
  };
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
