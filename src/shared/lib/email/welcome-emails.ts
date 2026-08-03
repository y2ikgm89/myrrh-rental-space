import "server-only";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { sendEmail } from "./send";
import type { EmailResult, WelcomeEmailData, EmailSendContext } from "./types";

export async function sendWelcomeEmail(
  data: WelcomeEmailData,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();

  return sendEmail(
    {
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
      // Customer.id is unique per registration lifecycle (uuid, never recycled
      // across delete-account → re-signup). Keying on the email hash instead
      // collides within Resend's 24h idempotency TTL and silent-drops the
      // welcome email for the re-registered customer (RESEND-AUDIT L5).
      idempotencyKey: `welcome/${data.customerId}`,
      operation: "sendWelcomeEmail",
      context: {
        email: data.customerEmail,
      },
    },
    sendContext,
  );
}
