import "server-only";

import { getEmailTemplate } from "@/shared/domain/email-templates/queries";
import { getEmailTemplateSettings } from "@/shared/domain/settings/queries/email-template";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";

import { renderTemplate } from "./variables";

export type ResolvedTemplate = {
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
  preview: string;
  companyName: string;
  footerNote?: string;
  supportContactText?: string;
  enabled: boolean;
};

export async function resolveTemplate(
  type: EmailTemplateType,
  variables: Record<string, string>,
): Promise<ResolvedTemplate | null> {
  const [template, settings] = await Promise.all([
    getEmailTemplate(type),
    getEmailTemplateSettings(),
  ]);

  if (!template) return null;

  const subjectPrefix = settings.emailSubjectPrefix ?? "";
  const renderedSubject = renderTemplate(template.subject, variables);

  return {
    subject: subjectPrefix
      ? `${subjectPrefix}${renderedSubject}`
      : renderedSubject,
    greeting: renderTemplate(template.greeting, variables),
    intro: renderTemplate(template.intro, variables),
    outro: renderTemplate(template.outro, variables),
    preview: renderedSubject,
    companyName: settings.companyName,
    ...(settings.emailFooterNote
      ? { footerNote: settings.emailFooterNote }
      : {}),
    ...(settings.emailSupportContactText
      ? { supportContactText: settings.emailSupportContactText }
      : {}),
    enabled: template.enabled,
  };
}
