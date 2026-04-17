"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  createInvitationSchema,
  setupPasswordSchema,
  type CreateInvitationInput,
  type SetupPasswordInput,
} from "@/shared/lib/validations/staff-invitation";
import {
  deleteInvitation as deleteInvitationCommand,
  resendInvitation as resendInvitationCommand,
  sendInvitation as sendInvitationCommand,
  setupPassword as setupPasswordCommand,
} from "@/shared/domain/staff-invitations/commands";
import { isDomainError } from "@/shared/domain/domain-error";
import type { InvitationData } from "@/shared/domain/staff-invitations/types";
import { CACHE_TAGS } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";

const invitationIdSchema = z.string().uuid({ error: "招待IDが不正です" });

export async function sendInvitation(
  input: CreateInvitationInput,
): Promise<MutationResult<InvitationData>> {
  const parsed = createInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "create",
    execute: async (user) =>
      sendInvitationCommand(parsed.data, { id: user.id, role: user.role }),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
    resolveAuditResourceId: (invitation) => invitation.id,
  });
}

export async function setupPassword(
  input: SetupPasswordInput,
): Promise<MutationResult<{ userId: string }>> {
  const parsed = setupPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  try {
    const result = await setupPasswordCommand(parsed.data);
    updateTag(CACHE_TAGS.STAFF);

    return result;
  } catch (error) {
    if (isDomainError(error)) {
      return { error: error.message };
    }

    throw error;
  }
}

export async function deleteInvitation(id: string): Promise<MutationResult> {
  const validated = invitationIdSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteInvitationCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
  });
}

export async function resendInvitation(id: string): Promise<MutationResult> {
  const validated = invitationIdSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "create",
    resourceId: validated.data,
    execute: async () => {
      await resendInvitationCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
  });
}
