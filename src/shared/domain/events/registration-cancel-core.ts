import "server-only";

import { RegistrationStatus } from "@generated/prisma/enums";
import type { CancelledByType } from "@/shared/lib/validations/enums/helpers";

/**
 * イベント参加申込キャンセルの共通コア
 *
 * 会員（マイページ）・ゲスト（メールリンク）・管理者（管理画面）の全キャンセル経路が
 * 共有する。本人性の確認（会員=customerId / ゲスト=トークン / 管理者=RBAC）は
 * 呼び出し側が行い、本関数は「キャンセル可否の判定 → CANCELLED 化（atomic claim）」を担う。
 *
 * **Atomic claim**: `updateMany` の WHERE 条件に現在の `status: CONFIRMED` を含めて
 * DB 側で claim する（`reservations/cancel-core.ts` の `applyCancellation` と同パターン）。
 * 二重 submit や admin/guest 同時操作で両 tx が CONFIRMED を読んでも、UPDATE は
 * 必ずどちらか一方しか count=1 にならない（PostgreSQL の単一 UPDATE は atomic）。
 * これにより通知・メールの二重発火を構造的に防ぐ（従来の findFirst→update は
 * この保証が無かった）。
 */

export interface ApplyEventRegistrationCancellationTx {
  readonly eventRegistration: {
    updateMany(args: object): Promise<{ count: number }>;
  };
}

/** キャンセルを受け付ける申込ステータス */
export const CANCELLABLE_REGISTRATION_STATUSES: readonly RegistrationStatus[] =
  [RegistrationStatus.CONFIRMED];

export interface CancellableEventRegistration {
  id: string;
  status: RegistrationStatus;
}

export type CancellationResult =
  { success: true } | { success: false; error: string };

export interface ApplyEventRegistrationCancellationOptions {
  now: Date;
  /**
   * キャンセル経路（DB の cancelledByType に書き込まれる）。
   * - `CUSTOMER_MYPAGE`: 会員のマイページ自己キャンセル
   * - `CUSTOMER_TOKEN`: ゲストのメールリンク経由キャンセル
   * - `ADMIN`: 管理画面からの管理者キャンセル
   */
  cancelledByType: CancelledByType;
}

export async function applyEventRegistrationCancellation(
  tx: ApplyEventRegistrationCancellationTx,
  registration: CancellableEventRegistration,
  options: ApplyEventRegistrationCancellationOptions,
): Promise<CancellationResult> {
  if (!CANCELLABLE_REGISTRATION_STATUSES.includes(registration.status)) {
    return { success: false, error: "この申込はキャンセルできません" };
  }

  // Atomic claim: WHERE に status: CONFIRMED を含めて二重 submit / 同時操作の
  // レースを DB レベルで防ぐ。
  const updateResult = await tx.eventRegistration.updateMany({
    where: {
      id: registration.id,
      status: { in: [...CANCELLABLE_REGISTRATION_STATUSES] },
    },
    data: {
      status: RegistrationStatus.CANCELLED,
      cancelledAt: options.now,
      cancelledByType: options.cancelledByType,
      icsSequence: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    // 別の操作（admin / 別タブ）が先にキャンセルを完了している。
    return {
      success: false,
      error:
        "別の操作で申込のステータスが変更されました。最新の状態をご確認ください",
    };
  }

  return { success: true };
}
