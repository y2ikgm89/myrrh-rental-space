import "server-only";

import {
  getPendingInvitations as getPendingInvitationsQuery,
  validateInvitationToken as validateInvitationTokenQuery,
} from "@/shared/domain/staff-invitations/queries";
import type { InvitationData } from "@/shared/domain/staff-invitations/types";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { requireAdminPermission } from "./_helpers";

export async function validateInvitationToken(
  token: string,
): Promise<MutationResult<InvitationData>> {
  if (!token) {
    return { error: "招待トークンが必要です" };
  }

  const invitation = await validateInvitationTokenQuery(token);
  if (!invitation) {
    return { error: "無効な招待リンクです" };
  }

  if (invitation.usedAt) {
    return { error: "この招待は既に使用されています" };
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return { error: "この招待は有効期限が切れています" };
  }

  return invitation;
}

export async function getPendingInvitations(): Promise<InvitationData[]> {
  await requireAdminPermission("user", "read");
  return getPendingInvitationsQuery();
}
