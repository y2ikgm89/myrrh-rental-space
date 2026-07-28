import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { applyEventRegistrationCancellation } from "./registration-cancel-core";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "./waitlist-locks";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";

const CANCEL_REGISTRATION_SELECT = {
  id: true,
  eventId: true,
  // waitlist promote hook (applyEventRegistrationCancellation →
  // offerNextWaitlistEntryCommand) が対象 (slotId, ticketId) を特定するために必要。
  slotId: true,
  ticketId: true,
  name: true,
  email: true,
  quantity: true,
  status: true,
  paymentStatus: true,
  event: { select: { title: true, slug: true } },
} as const;

/**
 * 申込キャンセルの共通実装。
 *
 * `where` で本人性（会員=customerId / 管理者=フィルタなし / ゲスト=呼び出し元で
 * トークン検証済み）を絞り込んだ上で、実際の状態遷移は atomic claim パターンの
 * {@link applyEventRegistrationCancellation} に委譲する（二重 submit / 同時操作の
 * レースを DB レベルで防ぐ。旧実装の findFirst→update はこの保証が無かった）。
 */
/**
 * `prisma.$transaction` のコールバック内では throw せず、必ず値を return する
 * （reservations/customer-commands.ts と同じ規約）。interactive transaction の
 * callback 内で throw すると、driver adapter 経由の rollback 完了を待つ間に
 * 後続の $transaction 呼び出しが `Unable to start a transaction in the given
 * time` で詰まる事象を実測したため、失敗判定は必ず正常 return し、呼び出し元
 * （transaction の外）で DomainError に変換する。
 */
async function cancelEventRegistrationWithClaim(
  where: { id: string; event: { deletedAt: null }; customerId?: string },
  cancelledByType: (typeof CANCELLED_BY)[keyof typeof CANCELLED_BY],
  expectedCustomerId?: string | null,
) {
  const result = await prisma.$transaction(
    async (tx) => {
      const registration = await tx.eventRegistration.findFirst({
        where,
        select: CANCEL_REGISTRATION_SELECT,
      });
      if (!registration) {
        return {
          success: false,
          code: "NOT_FOUND",
          error: "申込が見つかりません",
        } as const;
      }

      // offerNextWaitlistEntryCommand（applyEventRegistrationCancellation 内部で
      // CONFIRMED または WAITLISTED_OFFERED 由来のキャンセル時に呼ばれる）は
      // 「呼び出し側が事前に advisory lock 728350（イベント単位）を保持している」
      // ことを前提とする。ここで取得してから applyEventRegistrationCancellation
      // に渡すことで、同一 (slotId, ticketId) を対象とする複数のキャンセルが
      // 並行実行された場合でも FIFO 昇格の findFirst → updateMany claim が
      // 直列化される。ロックなしだと、2 件目のキャンセルが 1 件目のコミット未了
      // の行を READ COMMITTED で読んで同じ waitlist 候補を取り合い、updateMany
      // の WHERE が一致せず count=0 になることで無昇格（本来 2 名昇格すべき
      // ところ 1 名しか昇格しない）が起こる。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${registration.eventId}))`;

      const claim = await applyEventRegistrationCancellation(tx, registration, {
        now: new Date(),
        cancelledByType,
        ...(expectedCustomerId !== undefined ? { expectedCustomerId } : {}),
      });
      if (!claim.success) {
        return {
          success: false,
          code: "CONFLICT",
          error: claim.error,
        } as const;
      }

      const updated = await tx.eventRegistration.findUniqueOrThrow({
        where: { id: registration.id },
        select: { icsSequence: true },
      });

      return {
        success: true,
        payload: {
          ...registration,
          icsSequence: updated.icsSequence,
          // FIFO で繰り上げ当選した申込 (CONFIRMED または WAITLISTED_OFFERED
          // 由来のキャンセルで空き枠が発生した場合のみ非 null)。呼び出し側の副作用
          // ヘルパーが「繰り上げ当選メール」送信要否を判断する。
          promoted: claim.promoted,
        },
      } as const;
    },
    { maxWait: 5000, timeout: 10000 },
  );

  if (!result.success) throw new DomainError(result.error, result.code);
  return result.payload;
}

/** 会員のマイページ自己キャンセル（customerId で所有権を強制）。 */
export async function cancelEventRegistrationCommand(
  registrationId: string,
  customerId: string,
) {
  return cancelEventRegistrationWithClaim(
    { id: registrationId, customerId, event: { deletedAt: null } },
    CANCELLED_BY.CUSTOMER_MYPAGE,
  );
}

/** 管理画面からの管理者キャンセル（所有権フィルタなし）。 */
export async function adminCancelEventRegistrationCommand(
  registrationId: string,
) {
  return cancelEventRegistrationWithClaim(
    { id: registrationId, event: { deletedAt: null } },
    CANCELLED_BY.ADMIN,
  );
}

/**
 * トークン経由の申込キャンセル（ゲスト用）
 *
 * 確認メールのキャンセルリンクから呼ばれる。本人性は検証済みトークンが担保するため、
 * customerId による所有権フィルタは行わず registrationId だけで申込を特定する。
 *
 * @param expectedCustomerId 呼び出し側（ログイン中ユーザーの所有権チェック）が
 *   事前読取りした customerId の期待値（`undefined` = 制約なし）。claim との
 *   TOCTOU race を防ぐため、実際の状態変更 UPDATE の WHERE 句にも含めて再検証する
 *   （{@link applyEventRegistrationCancellation} 参照）。
 */
export async function cancelEventRegistrationByToken(
  registrationId: string,
  expectedCustomerId?: string | null,
) {
  return cancelEventRegistrationWithClaim(
    { id: registrationId, event: { deletedAt: null } },
    CANCELLED_BY.CUSTOMER_TOKEN,
    expectedCustomerId,
  );
}
