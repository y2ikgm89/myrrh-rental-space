"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { getUser as getUserQuery } from "@/shared/domain/users/queries";
import { getAdminUrl } from "@/shared/lib/admin-urls";
import { canInviteRole, ROLE_LABELS } from "@/shared/lib/admin-roles";
import {
  createUserSchema,
  updateUserSchema,
} from "@/shared/lib/validations/user";
import {
  createUser as createUserCommand,
  deleteUser as deleteUserCommand,
  updateUser as updateUserCommand,
} from "@/shared/domain/users/commands";
import { DomainError } from "@/shared/domain/domain-error";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { sendStaffAccessGuideEmail } from "@/shared/lib/email/system-emails";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("ユーザー");

type ResendStaffAccessGuideResult = {
  message: string;
};

export async function createUser(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, createUserSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "user",
      action: "create",
      execute: async (user) => {
        const created = await createUserCommand(data, {
          id: user.id,
          role: user.role,
        });
        const emailResult = await sendStaffAccessGuideEmail({
          to: data.email,
          staffName: data.name,
          staffEmail: data.email,
          roleLabel: ROLE_LABELS[data.role],
          adminUrl: getAdminUrl("/"),
        });
        return { id: created.id, emailResult };
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.STAFF);
      },
      resolveAuditResourceId: (result) => result.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }

    if (!result.emailResult.ok && result.emailResult.reason === "disabled") {
      return {
        ok: true,
        successMessage: "スタッフを登録しました。メール送信は無効です。",
      };
    }

    if (!result.emailResult.ok) {
      return {
        ok: true,
        successMessage:
          "スタッフを登録しました。メール送信に失敗したため、管理URLを直接共有してください。",
      };
    }

    return {
      ok: true,
      successMessage: "スタッフを登録し、管理画面の案内メールを送信しました。",
    };
  });
}

export async function updateUser(
  userId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, updateUserSchema, async (data) => {
    const idValid = idSchema.safeParse(userId);
    if (!idValid.success) {
      return { ok: false, error: "ユーザーIDが不正です" };
    }
    const result = await executeAdminMutationResult({
      resource: "user",
      action: "update",
      resourceId: idValid.data,
      execute: async (user) => {
        await updateUserCommand(idValid.data, data, {
          id: user.id,
          role: user.role,
        });
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.STAFF);
        updateTag(getCacheTag.staff.detail(idValid.data));
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function deleteUser(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "delete",
    resourceId: validated.data,
    execute: async (user) => {
      await deleteUserCommand(validated.data, {
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

export async function resendStaffAccessGuide(
  id: string,
): Promise<MutationResult<ResendStaffAccessGuideResult>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "user",
    action: "create",
    resourceId: validated.data,
    execute: async (actor) => {
      const staff = await getUserQuery(validated.data);
      if (!staff) {
        throw new DomainError("スタッフが見つかりません", "NOT_FOUND");
      }

      if (!canInviteRole(actor.role, staff.role)) {
        throw new DomainError(
          "このスタッフに案内メールを送信する権限がありません",
          "FORBIDDEN",
        );
      }

      const emailResult = await sendStaffAccessGuideEmail({
        to: staff.email,
        staffName: staff.name,
        staffEmail: staff.email,
        roleLabel: ROLE_LABELS[staff.role],
        adminUrl: getAdminUrl("/"),
        deliveryKey: `resend/${staff.id}/${randomUUID()}`,
      });

      if (!emailResult.ok && emailResult.reason === "disabled") {
        throw new DomainError(
          "メール送信は無効です。管理URLを直接共有してください。",
          "UNEXPECTED",
        );
      }

      if (!emailResult.ok) {
        throw new DomainError(
          `案内メールの送信に失敗しました: ${emailResult.error}`,
          "UNEXPECTED",
        );
      }

      return { message: "管理画面の案内メールを送信しました。" };
    },
  });
}
