"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  updateEmailTemplateCommand,
  toggleEmailTemplateEnabledCommand,
} from "@/shared/domain/email-templates/commands";
import {
  emailTemplateFormSchema,
  sendTestEmailSchema,
  type EmailTemplateFormInput,
  type SendTestEmailInput,
} from "@/shared/lib/validations/email-template";
import { isValidEmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { sendTestEmailForType } from "./email-template-test";

export async function updateEmailTemplate(
  type: string,
  input: EmailTemplateFormInput,
): Promise<MutationResult<{ id: string }>> {
  if (!isValidEmailTemplateType(type)) {
    return { error: "無効なメールテンプレート種別です" };
  }
  const parsed = emailTemplateFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "emailTemplate",
    action: "update",
    resourceId: type,
    execute: async () => updateEmailTemplateCommand(type, parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.EMAIL_TEMPLATES);
      updateTag(getCacheTag.emailTemplates.detail(type));
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function toggleEmailTemplateEnabled(
  type: string,
  enabled: boolean,
): Promise<MutationResult<{ id: string }>> {
  if (!isValidEmailTemplateType(type)) {
    return { error: "無効なメールテンプレート種別です" };
  }

  return executeAdminMutationResult({
    resource: "emailTemplate",
    action: "update",
    resourceId: type,
    execute: async () => toggleEmailTemplateEnabledCommand(type, enabled),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.EMAIL_TEMPLATES);
      updateTag(getCacheTag.emailTemplates.detail(type));
    },
  });
}

export async function sendTestEmail(
  input: SendTestEmailInput,
): Promise<MutationResult<null>> {
  const parsed = sendTestEmailSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);
  const { type, subject, greeting, intro, outro } = parsed.data;
  if (!isValidEmailTemplateType(type)) {
    return { error: "無効なメールテンプレート種別です" };
  }

  return executeAdminMutationResult({
    resource: "emailTemplate",
    action: "update",
    execute: async (user) => {
      if (!user.email) {
        throw new Error("テスト送信にはメールアドレスが必要です");
      }
      await sendTestEmailForType({
        type,
        recipient: user.email,
        draft: { subject, greeting, intro, outro },
      });
      return null;
    },
  });
}
