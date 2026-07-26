import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import { getNotificationStaffCandidates } from "@/shared/domain/users/queries";

const INVALID_STAFF_IDS_MESSAGE =
  "通知先スタッフに選択できないユーザーが含まれています。ページを再読み込みしてから保存してください";

/**
 * 送信された notificationStaffIds がすべて管理ロールのスタッフに属することを検証し、
 * 検証済みリストを返す。許可外 ID が 1 件でもあれば VALIDATION で即 fail（tamper 検知）。
 *
 * 許可条件は `getNotificationStaffCandidates()` と同一（DASHBOARD_ROLES）。
 */
export async function assertAllowlistedNotificationStaffIds(
  submittedIds: string[],
): Promise<string[]> {
  if (submittedIds.length === 0) {
    return [];
  }

  const candidates = await getNotificationStaffCandidates();
  const allowlist = new Set(candidates.map((candidate) => candidate.id));
  const hasInvalid = submittedIds.some((id) => !allowlist.has(id));
  if (hasInvalid) {
    throw new DomainError(INVALID_STAFF_IDS_MESSAGE, "VALIDATION");
  }

  return submittedIds;
}
