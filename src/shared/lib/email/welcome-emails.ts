import "server-only";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult, WelcomeEmailData } from "./types";

export async function sendWelcomeEmail(
  data: WelcomeEmailData,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();

  return sendEmail({
    payload: {
      to: data.customerEmail,
      subject: `【${footer.siteName}】ご登録ありがとうございます`,
      react: WelcomeEmail({
        customerName: data.customerName,
        loginUrl: data.loginUrl,
        siteName: footer.siteName,
        footer,
      }),
    },
    idempotencyKey: `welcome/${hashForKey(data.customerEmail)}`,
    operation: "sendWelcomeEmail",
    context: {
      email: data.customerEmail,
    },
  });
}
