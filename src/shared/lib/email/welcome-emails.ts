import "server-only";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { SITE_DEFAULTS } from "../constants";
import { sendEmail } from "./send";
import type { WelcomeEmailData, EmailResult } from "./types";

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendWelcomeEmail(
  data: WelcomeEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【${siteName}】ご登録ありがとうございます`,
        react: WelcomeEmail({
          customerName: data.customerName,
          loginUrl: data.loginUrl,
          siteName,
        }),
      }),
    {
      operation: "sendWelcomeEmail",
      email: data.customerEmail,
    },
  );
}
