export const GUEST_STATUS_RESERVATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE =
  "このリンクは別のお客様のご予約です。マイページからご自身のご予約をご確認ください";

export const GUEST_STATUS_EVENT_REGISTRATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE =
  "このリンクは別のお客様のご参加申込です。マイページからご自身の申込をご確認ください";

export type GuestStatusMemberOwnershipCheckResult =
  { kind: "ok" } | { kind: "mismatch" };

/**
 * ゲスト status hub（VIEW / mutation 共通）の member-ownership 判定。
 *
 * - session 無し → ok（token-only アクセス）
 * - resourceCustomerId が null → ok（未 claim のゲスト申込。ログイン済み本人でも通す）
 * - session customer と resource customer が不一致 → mismatch
 */
export function checkGuestStatusMemberOwnership(input: {
  sessionCustomerId: string | null;
  resourceCustomerId: string | null;
}): GuestStatusMemberOwnershipCheckResult {
  if (input.sessionCustomerId === null) {
    return { kind: "ok" };
  }
  if (input.resourceCustomerId === null) {
    return { kind: "ok" };
  }
  if (input.sessionCustomerId !== input.resourceCustomerId) {
    return { kind: "mismatch" };
  }
  return { kind: "ok" };
}
