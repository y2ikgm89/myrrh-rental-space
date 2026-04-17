import "server-only";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";
import type { EmailTemplateUpdate } from "./types";

export async function updateEmailTemplateCommand(
  type: EmailTemplateType,
  input: EmailTemplateUpdate,
): Promise<{ id: string }> {
  const existing = await prisma.emailTemplate.findUnique({
    where: { type },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError(
      `メールテンプレートが見つかりません: ${type}`,
      "NOT_FOUND",
    );
  }

  await prisma.emailTemplate.update({
    where: { type },
    data: {
      subject: input.subject,
      greeting: input.greeting,
      intro: input.intro,
      outro: input.outro,
      enabled: input.enabled,
    },
  });

  return { id: existing.id };
}

export async function toggleEmailTemplateEnabledCommand(
  type: EmailTemplateType,
  enabled: boolean,
): Promise<{ id: string }> {
  const existing = await prisma.emailTemplate.findUnique({
    where: { type },
    select: { id: true },
  });

  if (!existing) {
    throw new DomainError(
      `メールテンプレートが見つかりません: ${type}`,
      "NOT_FOUND",
    );
  }

  await prisma.emailTemplate.update({
    where: { type },
    data: { enabled },
  });

  return { id: existing.id };
}
