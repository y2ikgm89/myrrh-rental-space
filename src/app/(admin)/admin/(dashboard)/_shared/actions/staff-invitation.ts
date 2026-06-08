"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  createInvitationSchema,
  setupPasswordSchema,
  type SetupPasswordInput,
} from "@/shared/lib/validations/staff-invitation";
import {
  deleteInvitation as deleteInvitationCommand,
  resendInvitation as resendInvitationCommand,
  sendInvitation as sendInvitationCommand,
  setupPassword as setupPasswordCommand,
} from "@/shared/domain/staff-invitations/commands";
import { isDomainError } from "@/shared/domain/domain-error";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";

const invitationIdSchema = z.uuid({ error: "招待IDが不正です" });

export async function sendInvitation(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    createInvitationSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "user",
        action: "create",
        execute: async (user) =>
          sendInvitationCommand(data, { id: user.id, role: user.role }),
        afterSuccess: () => {
          updateTag(CACHE_TAGS.STAFF);
        },
        resolveAuditResourceId: (invitation) => invitation.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
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
    execute: async (user) => {
      await resendInvitationCommand(validated.data, {
        id: user.id,
        role: user.role,
      });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.STAFF);
    },
  });
}
