/**
 * 顧客向け予約確認メールの「送信待ち」マーカーの操作。
 *
 * ## なぜ列が要るか
 *
 * 確認メールは `applyConfirmationSideEffects` が SwitchBot パスコードの確定を
 * **最大 150 秒**待ってから送る（`DEVICE_LIST_POLL_OFFSETS_MS`）。パスコードを
 * メール本文に載せるための設計で、fire-and-forget だから許されていた。
 *
 * ところが Cloud Run の SIGTERM 猶予は **10 秒**しかない。Next.js standalone は
 * `after()` の保留分を drain してから exit する（`next-server.js` の
 * `createInternalWaitUntil` が `onServerClose` に `awaiter.awaiting()` を登録し、
 * `start-server.js` の SIGTERM handler がそれを await する）が、10 秒で足りなければ
 * SIGKILL で打ち切られる。**150 秒の poll はまず間に合わない。**
 *
 * パスコード自体は SwitchBot webhook と `smart-lock-cleanup` cron が回復する。
 * 回復手段が無いのは**メールだけ**。パスコードの平文はメールに載らず入室ハブで
 * 開示されるが、そのハブへの導線も予約内容の控えも確認メールにしか無いため、
 * 失うと顧客は自分の予約を確認する手段を持たない。
 *
 * そこで `Reservation.confirmationEmailPendingAt` に送信意思を残す。
 * `smartLockReissuePendingAt` と同型の pending マーカー。
 *
 * - 予約作成時（送る意思があるとき）に `now()` を立てる
 * - 送信できた／送らないと確定したときに `null` に戻す
 * - 残っている行は cron が回収する
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  buildEmailPayload,
  fetchReservationForSideEffects,
} from "@/shared/domain/reservations/cancellation/reservation-data";
import {
  getReservationEmailRenderContext,
  isReservationConfirmationEmailEnabled,
  resolveEmailSendContext,
} from "@/shared/domain/settings/queries/email-render-context";
import { sendReservationConfirmationEmail } from "@/shared/lib/email/reservation-emails";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  ReservationStatus,
  SmartLockPasscodeStatus,
} from "@/shared/lib/validations/enums/prisma-types";

/**
 * 送信待ちマーカーを下ろす。
 *
 * 「送れた」ときだけでなく「送らないと確定した」とき（機能 OFF /
 * `sendCustomerEmail: false`）にも呼ぶ。残したままにすると cron が
 * 送るべきでないメールを送る。
 *
 * 送信の失敗では**呼ばない**。マーカーを残すことが再試行の唯一の手段になる。
 */
export async function clearConfirmationEmailPending(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.updateMany({
    where: { id: reservationId, confirmationEmailPendingAt: { not: null } },
    data: { confirmationEmailPendingAt: null },
  });
}

/**
 * 通常経路が終わるのを待つ猶予。
 *
 * SwitchBot の poll は最大 150 秒（`DEVICE_LIST_POLL_OFFSETS_MS`）。まだ走っている
 * かもしれない送信を横から追い越さないよう、その 4 倍の余裕を取る。
 */
const CONFIRMATION_EMAIL_BACKFILL_GRACE_MS = 10 * 60 * 1000;

/** 1 回の実行で扱う上限。cron の実行時間を予測可能に保つ。 */
const CONFIRMATION_EMAIL_BACKFILL_BATCH_SIZE = 50;

/**
 * この予約のスマートロック発行が失敗扱いか。
 *
 * パスコード行が 1 つも無いスペース（= スマートロック未設定）は `false`。
 * 行があるのに CONFIRMED が 1 つも無ければ、猶予を過ぎても確定していないので
 * `true`（メールに fallback 案内を付ける）。
 */
async function isSmartLockIssuanceFailed(
  reservationId: string,
): Promise<boolean> {
  const [total, confirmed] = await Promise.all([
    prisma.smartLockPasscode.count({ where: { reservationId } }),
    prisma.smartLockPasscode.count({
      where: { reservationId, status: SmartLockPasscodeStatus.CONFIRMED },
    }),
  ]);
  return total > 0 && confirmed === 0;
}

/**
 * 送信待ちのまま猶予を過ぎた確認メールを送り直す。
 *
 * **二重送信は Resend の idempotency key が吸収する。** 確認メールは
 * `reservation-confirm/<reservationId>/<icsSequence>` を付けて送っており
 * （`reservation-emails.ts`）、送信後・マーカー解除前に停止しても、次の実行で
 * 同じ key の送信になるので顧客には 1 通しか届かない。だから「送ってから下ろす」
 * 順で書ける — 逆順（先に下ろす）にすると、停止したときに今度こそ失われる。
 */
export async function processPendingReservationConfirmationEmails(): Promise<{
  candidates: number;
  sent: number;
}> {
  const cutoff = new Date(Date.now() - CONFIRMATION_EMAIL_BACKFILL_GRACE_MS);

  const pending = await prisma.reservation.findMany({
    where: {
      confirmationEmailPendingAt: { not: null, lte: cutoff },
      status: ReservationStatus.CONFIRMED,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { confirmationEmailPendingAt: "asc" },
    take: CONFIRMATION_EMAIL_BACKFILL_BATCH_SIZE,
  });

  if (pending.length === 0) {
    return { candidates: 0, sent: 0 };
  }

  const [enabled, renderContext, sendContext] = await Promise.all([
    isReservationConfirmationEmailEnabled(),
    getReservationEmailRenderContext(),
    resolveEmailSendContext(),
  ]);

  if (!enabled || !sendContext) {
    // 「送れなかった」ではなく「送らない」。残すと毎回この cron が拾い続ける。
    for (const { id } of pending) {
      await clearConfirmationEmailPending(id);
    }
    return { candidates: pending.length, sent: 0 };
  }

  let sent = 0;
  for (const { id } of pending) {
    try {
      const reservation = await fetchReservationForSideEffects(id);
      if (!reservation) {
        await clearConfirmationEmailPending(id);
        continue;
      }

      const payload = buildEmailPayload(reservation);
      const issuanceFailed = await isSmartLockIssuanceFailed(id);

      await sendReservationConfirmationEmail(
        issuanceFailed
          ? { ...payload, smartLockIssuanceFailed: true }
          : payload,
        renderContext,
        sendContext,
      );
      await clearConfirmationEmailPending(id);
      sent += 1;
    } catch (error) {
      // 1 件の失敗で残りを落とさない。マーカーは残るので次回に回る。
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "processPendingReservationConfirmationEmails",
          reservationId: id,
        },
      });
    }
  }

  return { candidates: pending.length, sent };
}
