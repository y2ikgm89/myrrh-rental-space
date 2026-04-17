import "server-only";
import { PasswordResetEmail } from "@/shared/emails/password-reset";
import { SITE_DEFAULTS } from "../constants";
import { omitUndefined } from "../serialize";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type { PasswordResetEmailData, EmailResult } from "./types";

/**
 * パスワードリセットメールを送信
 */
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData,
): Promise<EmailResult> {
  const variables = omitUndefined({
    userName: data.name,
    resetUrl: data.resetUrl,
    siteName: SITE_DEFAULTS.name,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.PASSWORD_RESET,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.email,
        subject: resolved.subject,
        react: PasswordResetEmail(
          omitUndefined({
            resetUrl: data.resetUrl,
            siteName: SITE_DEFAULTS.name,
            greeting: resolved.greeting,
            intro: resolved.intro,
            outro: resolved.outro,
            preview: resolved.preview,
            companyName: resolved.companyName,
            footerNote: resolved.footerNote,
            supportContactText: resolved.supportContactText,
          }),
        ),
      }),
    {
      operation: "sendPasswordResetEmail",
      email: data.email,
    },
  );
}
