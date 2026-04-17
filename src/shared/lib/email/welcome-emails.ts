import "server-only";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { SITE_DEFAULTS } from "../constants";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult, WelcomeEmailData } from "./types";

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendWelcomeEmail(
  data: WelcomeEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();

  return sendEmail({
    payload: {
      to: data.customerEmail,
      subject: `【${siteName}】ご登録ありがとうございます`,
      react: WelcomeEmail({
        customerName: data.customerName,
        loginUrl: data.loginUrl,
        siteName,
      }),
    },
    idempotencyKey: `welcome/${hashForKey(data.customerEmail)}`,
    operation: "sendWelcomeEmail",
    context: {
      email: data.customerEmail,
    },
  });
}
