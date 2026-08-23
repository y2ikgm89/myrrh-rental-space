import "server-only";

import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { RESERVATION_WRITE_TX_OPTIONS } from "@/shared/db/transaction-options";
import { asyncPaymentFailsafeCutoff } from "@/shared/domain/payment/async-payment-expiry";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { MS_PER_MINUTE } from "@/shared/lib/date-format";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";
import { lockSpaceForTransaction } from "@/shared/domain/reservations/space-locks";
import { releaseCouponUsage } from "@/shared/domain/reservations/payloads";

/**
 * PENDING 予約の fail-safe 有効期限（分）。**checkout 開始時刻** (Reservation.paymentInitiatedAt)
 * からこの分数を超えて `paymentStatus = PENDING` のまま残っている予約を cron が自動 CANCELLED
 * 遷移させる。
 *
 * Stripe Checkout Session の既定 expiration (24h) より短く、実運用の
 * 「決済に迷って離脱」パターンを吸収する余地を持たせて 60 分を採用。
 * `createCheckoutSessionCommand` の UNPAID/FAILED → PENDING claim (payment-commands.ts)
 * と、`checkout.session.expired` webhook (`claimReservationAsFailed`) の
 * どちらも届かないケース (webhook 未設定、ネットワーク断、Stripe 側障害) に
 * 対する最終セーフティネット。
 *
 * 予約作成時刻 (createdAt) ではなく checkout 開始時刻で判定するため、予約作成から時間を
 * おいて決済を開始したケース (Codex P1: PR#1042) を誤爆せず、FAILED → PENDING の
 * 再 checkout でも refresh される。
 */
export const PENDING_RESERVATION_EXPIRY_MINUTES = 60;

/**
 * 決済が成立しないまま枠を握っている予約の枝。
 *
 * `reservations_no_active_time_overlap_excl` は `status ∈ {PENDING, CONFIRMED}` で
 * 枠を占有する。**`paymentStatus` は見ていない。** したがって決済が終端に落ちても
 * `status` を動かさない限り枠は空かない。ここが唯一その責務を負う。
 *
 * - **PENDING（通常）**: カード決済の離脱など。`PENDING_RESERVATION_EXPIRY_MINUTES`。
 * - **PENDING（非同期決済の待機中）**: `stripePaymentIntentId` が入っているのは
 *   konbini / customer_balance の `checkout.session.completed` が
 *   `payment_status !== "paid"` で届き `savePaymentIntentId` が PaymentIntent だけ
 *   保存した状態に限られる（カード決済は completed 時点で "paid" なので fulfill 経路に
 *   入りここを通らない）。「客が払込票を受け取り、これから支払う」であって放置ではない。
 *   60 分で CANCELLED にすると、数日後に支払われた時点で `async_payment_succeeded` が
 *   届き、キャンセル済み予約への自動返金が走る。枠も失われ、入金と返金の履歴だけが残る。
 *   ただし**無条件には除外しない**。fail-safe cron の存在理由は「webhook が届かなくても
 *   在庫を解放する」ことなので、webhook が書き込む列を根拠に永久除外すると成立しない。
 *   長いが有限の `ASYNC_PAYMENT_FAILSAFE_EXPIRY_DAYS` を当てる。
 * - **FAILED**: `checkout.session.expired` / `async_payment_failed` の webhook が
 *   `claimReservationAsFailed` 経由で書き込む終端。`buildFailedClaimUpdateData()` は
 *   `paymentStatus` しか更新しないので、この枝が無いと**枠が恒久的に埋まったままになる**
 *   （イベント側 `unpaid-expiry.ts` には元から FAILED の枝がある。予約側だけ欠けていた）。
 *
 * PENDING の 2 枝は `paymentInitiatedAt` で判定する（再 checkout のたびに refresh され、
 * 「最後に決済を始めてから何分経ったか」を表す）。FAILED は専用列 `paymentFailedAt` で
 * 判定する（理由は該当箇所のコメント）。
 */
function stalePaymentBranches(cutoff: Date, asyncCutoff: Date) {
  return [
    {
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: null,
      paymentInitiatedAt: { lt: cutoff },
    },
    {
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: { not: null },
      paymentInitiatedAt: { lt: asyncCutoff },
    },
    // FAILED は「失敗してから何分経ったか」で見る。基準に何を使うかは 2 回間違えた:
    //
    // - `paymentInitiatedAt`: Stripe session の `expires_at` は checkout 開始 +
    //   PENDING_RESERVATION_EXPIRY_MINUTES に揃えてあるので、
    //   `checkout.session.expired` が届く時点で既に cutoff を過ぎている。
    //   FAILED が書かれた瞬間に回収対象になり、`createCheckoutSessionCommand` が
    //   用意している FAILED → PENDING の再決済導線が使えない。
    // - `updatedAt`: 「行が最後に触られた時刻」であって失敗時刻ではない。
    //   `calendar-sync-retry` cron が 15 分ごとに `calendarSyncError` を書き直すため、
    //   Google Calendar が落ちている間 60 分の cutoff に永久に到達せず枠を握り続ける。
    //
    // 専用列 `paymentFailedAt` を見る。書き込むのは `claimReservationAsFailed` だけ。
    {
      paymentStatus: PaymentStatus.FAILED,
      paymentFailedAt: { lt: cutoff },
    },
    // 本列の導入前に FAILED になった行は `paymentFailedAt` が null のまま残る。
    // 放置すると枠を永久に握るので、この枝で回収する。
    //
    // 基準は `createdAt`。`updatedAt` を使うと上と同じ livelock が legacy 行に残る
    // （calendar-sync リトライが 15 分ごとに更新するため cutoff に到達しない）。
    // `createdAt` は `@default(now())` で以後変化せず、必ず値を持つ。
    // この枝に入るのは「列の導入より前に失敗した行」だけなので `createdAt` は
    // 常に cutoff より過去にあり、判定は決定的になる。
    //
    // migration でバックフィルしないのは、data repair を migration に入れない
    // というリポジトリの規約による（`.claude/skills/new-migration`）。
    // 新規の FAILED は必ず `paymentFailedAt` を持つので、この枝は既存行が
    // 掃けた時点で削除してよい。
    {
      paymentStatus: PaymentStatus.FAILED,
      paymentFailedAt: null,
      createdAt: { lt: cutoff },
    },
  ];
}

interface ExpiredReservationLog {
  readonly id: string;
  readonly customerId: string;
  readonly spaceId: string;
  readonly ageMinutes: number;
}

interface ExpirePendingReservationsResult {
  readonly expired: readonly ExpiredReservationLog[];
  readonly total: number;
}

/**
 * 1 cron 走査の上限（監査 A-36）。
 *
 * 旧実装は `take` も `orderBy` も無しに候補を全件取り、1 件ずつ
 * 「advisory lock 付きトランザクション + 外部 I/O」を直列に回していた。
 * Stripe の webhook 配信障害が数時間続いて候補が数千件になれば、
 * 300s の attempt_deadline を超え、Cloud Scheduler が同じ走査を最大 3 回投げ直す。
 * この負荷は max 1 インスタンス / 1 CPU の**公開サービス**に乗る。
 *
 * 15 分間隔なので、一回で処理しきれない分は次回に回しても滞留は解消する。
 * `WAITLIST_EXPIRE_SCAN_LIMIT`（N-07 の是正）と同型。
 */
export const PENDING_EXPIRE_SCAN_LIMIT = 200;

/**
 * 決済が成立しないまま期限を過ぎた予約を CANCELLED に遷移させ、
 * 空き枠（DB EXCLUDE 制約）を解放する。対象の枝は `stalePaymentBranches` が持つ。
 *
 * claim 成功後の副作用（SSoT = `applyCancellationSideEffects`）:
 * - クーポン usageCount の戻し（tx 内で完了済み）
 * - GCal / メール / 通知 / SmartLock / 集約 AuditLog
 * - Stripe Checkout Session の expire（`applyCancellationSideEffects` 内）
 *
 * `applyCancellation` は PENDING を拒否するため使わない。本 cron が PENDING を
 * CANCELLED に claim した直後に副作用を発火する。
 *
 * cron から呼ぶ想定 (`/api/cron/pending-reservation-expire`)。他経路からは呼ばない。
 */
export async function expireStalePendingReservationsCommand(): Promise<ExpirePendingReservationsResult> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - PENDING_RESERVATION_EXPIRY_MINUTES * MS_PER_MINUTE,
  );
  const asyncCutoff = asyncPaymentFailsafeCutoff(now);
  const cancellationReason =
    "決済が成立しないまま期限を経過したため自動キャンセル";

  // 1) 対象候補を select（副作用・監査用メタを確保）
  const candidates = await prisma.reservation.findMany({
    where: {
      deletedAt: null,
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
      },
      OR: stalePaymentBranches(cutoff, asyncCutoff),
    },
    // 古い候補から確実に消化する（監査 A-36）。
    orderBy: { paymentInitiatedAt: "asc" },
    take: PENDING_EXPIRE_SCAN_LIMIT,
    select: {
      id: true,
      customerId: true,
      spaceId: true,
      paymentInitiatedAt: true,
      couponId: true,
    },
  });

  if (candidates.length === 0) {
    return { expired: [], total: 0 };
  }

  const expiredLogs: ExpiredReservationLog[] = [];

  // 2) 予約ごとに atomic claim + coupon decrement を同一 tx で実行する。
  //    旧実装は bulk updateMany の後に coupon を別クエリで戻しており、
  //    プロセスクラッシュで usageCount が strand する余地があった。
  for (const candidate of candidates) {
    const initiatedAt = candidate.paymentInitiatedAt;
    const ageMinutes = initiatedAt
      ? Math.floor((now.getTime() - initiatedAt.getTime()) / MS_PER_MINUTE)
      : PENDING_RESERVATION_EXPIRY_MINUTES;

    const claimed = await prisma.$transaction(async (tx) => {
      await lockSpaceForTransaction(tx, candidate.spaceId);

      const updateResult = await tx.reservation.updateMany({
        where: {
          id: candidate.id,
          deletedAt: null,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          // 候補抽出と同じ述語を claim でも再強制する。候補 select から claim までの
          // 間に非同期決済の `checkout.session.completed` が届いて PaymentIntent が
          // 入った行を、ここで取りこぼさないため。
          OR: stalePaymentBranches(cutoff, asyncCutoff),
        },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: now,
          cancelledByType: CANCELLED_BY.SYSTEM,
          cancellationReason,
          icsSequence: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        return false;
      }

      if (candidate.couponId) {
        await releaseCouponUsage(tx, { couponId: candidate.couponId });
      }

      return true;
    }, RESERVATION_WRITE_TX_OPTIONS);

    if (claimed) {
      expiredLogs.push({
        id: candidate.id,
        customerId: candidate.customerId,
        spaceId: candidate.spaceId,
        ageMinutes,
      });
    }
  }

  // 3) claim 成功分の副作用。クーポン戻しは上記 tx 内で完了済み。
  for (const log of expiredLogs) {
    try {
      await applyCancellationSideEffects({
        reservationId: log.id,
        cancellationReason,
        channel: "system",
        actorUserId: null,
        request: { ip: null, userAgent: null },
        awaitCompletion: true,
      });
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "pendingExpirySideEffects",
          reservationId: log.id,
        },
      });
    }
  }

  return { expired: expiredLogs, total: expiredLogs.length };
}
