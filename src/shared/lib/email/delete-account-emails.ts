import "server-only";
import { DeleteAccountVerificationEmail } from "@/shared/emails/delete-account-verification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { hashForKey, sendEmail } from "./send";
import type { DeleteAccountVerificationEmailData, EmailResult } from "./types";

/**
 * アカウント削除確認メールを送信
 */
export async function sendDeleteAccountVerificationEmail(
  data: DeleteAccountVerificationEmailData,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();

  return sendEmail({
    payload: {
      to: data.email,
      subject: `【アカウント削除の確認】${footer.siteName}`,
      react: DeleteAccountVerificationEmail({
        name: data.name,
        deletionUrl: data.deletionUrl,
        siteName: footer.siteName,
        footer,
      }),
    },
    // deletionUrl は一意なトークンを含むため、同一リクエスト再試行のみ dedupe される
    idempotencyKey: `delete-account-verification/${hashForKey(data.deletionUrl)}`,
    operation: "sendDeleteAccountVerificationEmail",
    context: {
      email: data.email,
    },
  });
}
