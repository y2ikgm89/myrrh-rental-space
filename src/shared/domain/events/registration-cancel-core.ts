import "server-only";

import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  CANCELLABLE_REGISTRATION_STATUSES,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";
import { offerNextWaitlistEntryCommand } from "./waitlist-commands";

/**
 * イベント参加申込キャンセルの共通コア
 *
 * 会員（マイページ）・ゲスト（メールリンク）・管理者（管理画面）の全キャンセル経路が
 * 共有する。本人性の確認（会員=customerId / ゲスト=トークン / 管理者=RBAC）は
 * 呼び出し側が行い、本関数は「キャンセル可否の判定 → CANCELLED 化（atomic claim）→
 * （CONFIRMED 由来のみ）waitlist FIFO promote」を担う。
 *
 * **Atomic claim**: `updateMany` の WHERE 条件に現在の `status ∈ CANCELLABLE_REGISTRATION_STATUSES`
 * （CONFIRMED / WAITLISTED / WAITLISTED_OFFERED）を含めて DB 側で claim する
 * （`reservations/cancel-core.ts` の `applyCancellation` と同パターン）。
 * 二重 submit や admin/guest 同時操作で両 tx が同じ status を読んでも、UPDATE は
 * 必ずどちらか一方しか count=1 にならない（PostgreSQL の単一 UPDATE は atomic）。
 * これにより通知・メールの二重発火を構造的に防ぐ（従来の findFirst→update は
 * この保証が無かった）。
 *
 * **Waitlist promote**: キャンセル対象が CONFIRMED **または WAITLISTED_OFFERED**
 * だった場合、同一 tx 内で {@link offerNextWaitlistEntryCommand} を呼び、
 * 同じ (slotId, ticketId) の FIFO 先頭を WAITLISTED_OFFERED に昇格させる。
 *
 * - CONFIRMED: 確定枠を実消費していた行が抜けたので、次の WAITLISTED を offer する。
 * - WAITLISTED_OFFERED: 24h 期限内の offer は「その顧客のために予約されている枠」
 *   として実質的に一枠を専有している（cron `waitlist-expire` が offer 期限切れで
 *   EXPIRED 化する経路も同じ理由で `offerNextWaitlistEntryCommand` を必ず呼ぶ）。
 *   ここで promoter を呼ばないと、offer 中のキャンセル → 次の WAITLISTED が
 *   永久に silent に stall する（MYPAGE-EVENT-03）。
 * - WAITLISTED（未 offer）のセルフキャンセルは枠を消費していないため昇格対象外。
 *
 * promoter は `updateMany` の WHERE claim で idempotent なため、cron
 * `waitlist-expire` の重複呼び出しがあっても二重昇格しない（`waitlist-commands.ts`
 * の `offerNextWaitlistEntryCommand` docstring 参照）。
 */

export interface ApplyEventRegistrationCancellationTx {
  readonly eventRegistration: {
    updateMany(args: {
      where: Prisma.EventRegistrationWhereInput;
      data: Prisma.EventRegistrationUncheckedUpdateManyInput;
    }): Promise<{ count: number }>;
    // offerNextWaitlistEntryCommand に tx をそのまま渡すために必要な最小構造
    // （実装は呼ばないが、findFirst と揃えることで real Prisma tx との構造互換を保つ）。
    findFirst(args: {
      where: Prisma.EventRegistrationWhereInput;
      orderBy?: Prisma.EventRegistrationOrderByWithRelationInput;
      select: Prisma.EventRegistrationSelect;
    }): Promise<{
      id: string;
      email: string | null;
    } | null>;
    findUnique(args: {
      where: Prisma.EventRegistrationWhereUniqueInput;
      select: Prisma.EventRegistrationSelect;
    }): Promise<{
      id: string;
      email: string | null;
      offeredAt: Date | null;
      expiresAt: Date | null;
    } | null>;
  };
}

export interface CancellableEventRegistration {
  id: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  slotId: string;
  ticketId: string;
}

/**
 * offerNextWaitlistEntryCommand の戻り値から `promoted` の型だけを再利用する（定義を重複させない）。
 * `registration-cancellation-side-effects.ts` が「繰り上げ当選メール送信要否」の
 * 判定に同じ型をそのまま使うため export する（形状の二重定義を避ける）。
 */
export type WaitlistPromotionOutcome = Awaited<
  ReturnType<typeof offerNextWaitlistEntryCommand>
>["promoted"];

export type CancellationResult =
  | {
      success: true;
      previousStatus: RegistrationStatus;
      /**
       * FIFO で繰り上げ当選した申込（無ければ null）。呼び出し側の副作用ヘルパーが
       * 非 null のとき「繰り上げ当選メール」の送信要否を判断する。
       */
      promoted: WaitlistPromotionOutcome;
    }
  | { success: false; error: string };

export interface ApplyEventRegistrationCancellationOptions {
  now: Date;
  /**
   * キャンセル経路（DB の cancelledByType に書き込まれる）。
   * - `CUSTOMER_MYPAGE`: 会員のマイページ自己キャンセル
   * - `CUSTOMER_TOKEN`: ゲストのメールリンク経由キャンセル
   * - `ADMIN`: 管理画面からの管理者キャンセル
   */
  cancelledByType: CancelledByType;
  /**
   * ゲストトークン経路で、呼び出し側が事前読取りした `customerId` の期待値
   * （`undefined` = 制約なし）。
   *
   * ログイン中ユーザーが「未 claim（customerId: null）の申込」への操作を許可
   * された後、この UPDATE 実行までの間に別の claim（`claimEventRegistrationForCustomer`）
   * が customerId を書き換えるレースがあり得る。事前チェックとは別クエリで
   * customerId を再読取りするのではなく、状態変更 UPDATE 自体の WHERE 句に
   * 含めることで、claim との race を DB レベルで閉じる（claim 後は count=0 になり
   * 「別の操作で変更されました」エラーとして安全側に倒れる）。
   */
  expectedCustomerId?: string | null;
}

export async function applyEventRegistrationCancellation(
  tx: ApplyEventRegistrationCancellationTx,
  registration: CancellableEventRegistration,
  options: ApplyEventRegistrationCancellationOptions,
): Promise<CancellationResult> {
  // `.includes()` ではなく `.some()` で比較する: gateway 定数は `as const satisfies
  // readonly RegistrationStatus[]` で意図的に狭い literal union 型のまま export されて
  // おり（`readonly RegistrationStatus[]` へ widen していない）、`registration.status`
  // （広い RegistrationStatus 型）を `.includes()` の引数に渡すと型エラーになる。
  if (
    !CANCELLABLE_REGISTRATION_STATUSES.some((s) => s === registration.status)
  ) {
    return { success: false, error: "この申込はキャンセルできません" };
  }

  // Stripe Checkout 進行中 (PENDING) はキャンセル禁止。予約側 applyCancellation と同型。
  // 許すと checkout 完了 webhook の claimEventRegistrationAsPaid が status=CONFIRMED
  // を要求して no-op になり、課金成功 / DB CANCELLED の orphan になる。
  if (registration.paymentStatus === PaymentStatus.PENDING) {
    return {
      success: false,
      error:
        "決済処理中のためキャンセルできません。決済完了後にキャンセルするか、しばらく経ってから再度お試しください。",
    };
  }

  const previousStatus = registration.status;
  const previousSlotId = registration.slotId;
  const previousTicketId = registration.ticketId;

  // Atomic claim: WHERE に status ∈ CANCELLABLE + paymentStatus ≠ PENDING（+ 指定時は
  // customerId 期待値）を含めて二重 submit / 同時操作 / checkout 開始 race を防ぐ。
  const updateResult = await tx.eventRegistration.updateMany({
    where: {
      id: registration.id,
      status: { in: [...CANCELLABLE_REGISTRATION_STATUSES] },
      paymentStatus: { not: PaymentStatus.PENDING },
      ...(options.expectedCustomerId !== undefined
        ? { customerId: options.expectedCustomerId }
        : {}),
    },
    data: {
      status: RegistrationStatus.CANCELLED,
      cancelledAt: options.now,
      cancelledByType: options.cancelledByType,
      icsSequence: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    // 別の操作（admin / 別タブ / claim）が先にステータス・所有者を変更している。
    return {
      success: false,
      error:
        "別の操作で申込のステータスが変更されました。最新の状態をご確認ください",
    };
  }

  // Waitlist promote: CONFIRMED または WAITLISTED_OFFERED だった申込がキャンセル
  // された場合、空いた枠（実確定 or offer 中で予約されていた枠）を FIFO で offer
  // に昇格する。WAITLISTED_OFFERED を含めないと、offer 中の顧客がセルフキャンセル
  // したときに次の WAITLISTED が silent に stall する（MYPAGE-EVENT-03）。
  //
  // advisory lock 728350 は offerNextWaitlistEntryCommand の内部では取得しない
  // （同関数の docstring 参照）。呼び出し元の cancelEventRegistrationWithClaim
  // （registration-commands.ts）が applyEventRegistrationCancellation を呼ぶ直前に
  // 同一 tx 上で取得済みであるため、ここで改めて取得する必要はない。
  //
  // 24h 期限切れ (waitlist-expire cron) 経路と WAITLISTED_OFFERED セルフキャンセルが
  // 同時に走った場合でも二重昇格はしない: (1) 元 offer 行の遷移は本関数の updateMany
  // (status ∈ CANCELLABLE) と cron の updateMany (status = WAITLISTED_OFFERED) が
  // 両方 status で claim するため、どちらか一方だけが成功する。(2) 成功側が呼ぶ
  // offerNextWaitlistEntryCommand も同じ (slotId, ticketId) の WAITLISTED を
  // updateMany で atomic claim するため、外側 tx が 728350 で直列化されている限り
  // FIFO 先頭は 1 回しか昇格しない。
  let promoted: WaitlistPromotionOutcome = null;
  if (
    previousStatus === RegistrationStatus.CONFIRMED ||
    previousStatus === RegistrationStatus.WAITLISTED_OFFERED
  ) {
    const offer = await offerNextWaitlistEntryCommand(tx, {
      slotId: previousSlotId,
      ticketId: previousTicketId,
      now: options.now,
    });
    promoted = offer.promoted;
  }

  return { success: true, previousStatus, promoted };
}
