import "server-only";
import { PasswordResetEmail } from "@/shared/emails/password-reset";
import { SITE_DEFAULTS } from "../constants";
import { sendEmail } from "./send";
import type { PasswordResetEmailData, EmailResult } from "./types";

/**
 * パスワードリセットメールを送信
 */
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData,
): Promise<EmailResult> {
  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.email,
        subject: `【パスワードリセット】${SITE_DEFAULTS.name}`,
        react: PasswordResetEmail({
          name: data.name,
          resetUrl: data.resetUrl,
          siteName: SITE_DEFAULTS.name,
        }),
      }),
    {
      operation: "sendPasswordResetEmail",
      email: data.email,
    },
  );
}
