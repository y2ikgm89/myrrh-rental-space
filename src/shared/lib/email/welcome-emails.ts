import "server-only";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { SITE_DEFAULTS } from "../constants";
import { omitUndefined } from "../serialize";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type { WelcomeEmailData, EmailResult } from "./types";

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendWelcomeEmail(
  data: WelcomeEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();

  const variables = omitUndefined({
    userName: data.customerName,
    customerName: data.customerName,
    loginUrl: data.loginUrl,
    siteName,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.WELCOME,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: resolved.subject,
        react: WelcomeEmail(
          omitUndefined({
            loginUrl: data.loginUrl,
            siteName,
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
      operation: "sendWelcomeEmail",
      email: data.customerEmail,
    },
  );
}
