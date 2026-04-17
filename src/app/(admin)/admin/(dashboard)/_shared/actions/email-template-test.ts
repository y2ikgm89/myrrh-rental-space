import "server-only";
import { createElement } from "react";
import { EmailLayout } from "@/shared/emails/_layout";
import { getResendClient, getFromAddress } from "@/shared/lib/email/client";
import { renderTemplate } from "@/shared/lib/email/variables";
import { getTemplateVariables } from "@/shared/lib/email/template-registry";
import { getEmailTemplateSettings } from "@/shared/domain/settings/queries/email-template";
import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";

type SendTestEmailForTypeArgs = {
  type: EmailTemplateType;
  recipient: string;
  draft: {
    subject: string;
    greeting: string;
    intro: string;
    outro: string;
  };
};

export async function sendTestEmailForType({
  type,
  recipient,
  draft,
}: SendTestEmailForTypeArgs): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("Resend API キーが未設定です");
  }

  const settings = await getEmailTemplateSettings();

  const variables = Object.fromEntries(
    getTemplateVariables(type).map((v) => [v.name, v.example]),
  );

  const renderedSubject = renderTemplate(draft.subject, variables);
  const subject = settings.emailSubjectPrefix
    ? `${settings.emailSubjectPrefix}${renderedSubject}`
    : renderedSubject;

  const children = [
    createElement(
      "p",
      { key: "greeting" },
      renderTemplate(draft.greeting, variables),
    ),
    createElement(
      "p",
      { key: "intro" },
      renderTemplate(draft.intro, variables),
    ),
    createElement(
      "p",
      { key: "outro", style: { marginTop: "24px" } },
      renderTemplate(draft.outro, variables),
    ),
  ];

  const element = createElement(EmailLayout, {
    preview: `[TEST] ${renderedSubject}`,
    companyName: settings.companyName,
    footerNote: settings.emailFooterNote ?? undefined,
    supportContactText: settings.emailSupportContactText ?? undefined,
    children,
  });

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: recipient,
    subject: `[TEST] ${subject}`,
    react: element,
  });

  if (error) {
    throw new Error(`テスト送信に失敗しました: ${error.message}`);
  }
}
