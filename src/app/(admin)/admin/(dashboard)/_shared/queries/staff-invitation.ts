import "server-only";

import { z } from "zod";
import { createFailure, createSuccess, type ActionResult } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import {
  getPendingInvitations as getPendingInvitationsQuery,
  validateInvitationToken as validateInvitationTokenQuery,
} from "@/shared/domain/staff-invitations/queries";
import type { InvitationData } from "@/shared/domain/staff-invitations/types";
import { requireAdminPermission } from "./_helpers";

const invitationTokenSchema = z.string().min(1, { error: "招待トークンが必要です" });

export async function validateInvitationToken(
  token: string,
): Promise<ActionResult<InvitationData>> {
  const validated = invitationTokenSchema.safeParse(token);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const invitation = await validateInvitationTokenQuery(validated.data);
  if (!invitation) {
    return createFailure("無効な招待リンクです");
  }

  if (invitation.usedAt) {
    return createFailure("この招待は既に使用されています");
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return createFailure("この招待は有効期限が切れています");
  }

  return createSuccess("有効な招待です", invitation);
}

export async function getPendingInvitations(): Promise<InvitationData[]> {
  await requireAdminPermission("user", "read");
  return getPendingInvitationsQuery();
}
