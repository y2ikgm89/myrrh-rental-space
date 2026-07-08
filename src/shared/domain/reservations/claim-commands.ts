import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * ゲスト予約を会員Customerへ再紐付けする（compare-and-swap）。
 *
 * email の一致では判断しない。呼び出し元（`/claim/reservation` action）が
 * 署名付き claim トークンの保有 + OAuth 認証の両方を確認した上でのみ呼ぶ。
 *
 * 「先着1名のみ成立」を保証する: 現在の customerId を読み、それが既に
 * 別の会員（userId が非null）に紐付いていれば横取りを拒否する。読んだ
 * customerId をそのまま updateMany の WHERE ガードに使うことで、UPDATE の
 * WHERE 再評価（PostgreSQL の行ロック取得後に最新コミット済み状態で評価される）
 * により、同時に2件の claim が競合しても後着は必ず 0 件更新になる
 * （`claimReservationAsPaid` と同じ「updateMany の WHERE で claim」パターン）。
 *
 * @returns 既に自分（`toCustomerId`）へclaim済みの場合も idempotent に `claimed: true`。
 *   既に他の会員へclaim済み、または予約が存在しない場合は `claimed: false`。
 */
export async function claimReservationForCustomer(
  reservationId: string,
  toCustomerId: string,
): Promise<{ claimed: boolean }> {
  const current = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { customerId: true },
  });
  if (!current) {
    return { claimed: false };
  }

  if (current.customerId === toCustomerId) {
    return { claimed: true };
  }

  const currentCustomer = await prisma.customer.findUnique({
    where: { id: current.customerId },
    select: { userId: true },
  });
  if (currentCustomer?.userId != null) {
    return { claimed: false };
  }

  const result = await prisma.reservation.updateMany({
    where: { id: reservationId, customerId: current.customerId },
    data: { customerId: toCustomerId },
  });
  return { claimed: result.count > 0 };
}
