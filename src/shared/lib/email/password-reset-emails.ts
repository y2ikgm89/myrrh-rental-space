import "server-only";
import { PasswordResetEmail } from "@/shared/emails/password-reset";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult, PasswordResetEmailData } from "./types";

/**
 * パスワードリセットメールを送信
 */
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();

  return sendEmail({
    payload: {
      to: data.email,
      subject: `【パスワードリセット】${footer.siteName}`,
      react: PasswordResetEmail({
        name: data.name,
        resetUrl: data.resetUrl,
        siteName: footer.siteName,
        footer,
      }),
    },
    // resetUrl は一意なトークンを含むため、同一リクエスト再試行のみ dedupe される
    idempotencyKey: `password-reset/${hashForKey(data.resetUrl)}`,
    operation: "sendPasswordResetEmail",
    context: {
      email: data.email,
    },
  });
}
