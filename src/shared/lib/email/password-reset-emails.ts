import "server-only";
import { PasswordResetEmail } from "@/shared/emails/password-reset";
import { SITE_DEFAULTS } from "../constants";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult, PasswordResetEmailData } from "./types";

/**
 * パスワードリセットメールを送信
 */
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData,
): Promise<EmailResult> {
  return sendEmail({
    payload: {
      to: data.email,
      subject: `【パスワードリセット】${SITE_DEFAULTS.name}`,
      react: PasswordResetEmail({
        name: data.name,
        resetUrl: data.resetUrl,
        siteName: SITE_DEFAULTS.name,
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
