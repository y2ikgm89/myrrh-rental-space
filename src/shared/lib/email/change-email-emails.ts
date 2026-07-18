import "server-only";
import { ChangeEmailVerificationEmail } from "@/shared/emails/change-email-verification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { hashForKey, sendEmail } from "./send";
import type { ChangeEmailVerificationEmailData, EmailResult } from "./types";

/**
 * マイページからの初回メールアドレス登録の本人確認 URL をお客様へ送信。
 *
 * 送信先は「登録リクエストされた新しいメールアドレス」（Customer.email 未設定
 * ケースで運用するため、既存 Customer.email 宛には送れない = 本人確認としても
 * 意味を持たない）。verificationUrl を踏んで初めて Customer.email へ書き込まれる。
 */
export async function sendChangeEmailVerificationEmail(
  data: ChangeEmailVerificationEmailData,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();

  return sendEmail({
    payload: {
      to: data.email,
      subject: `【メールアドレスの確認】${footer.siteName}`,
      react: ChangeEmailVerificationEmail({
        name: data.name,
        newEmail: data.newEmail,
        verificationUrl: data.verificationUrl,
        siteName: footer.siteName,
        footer,
      }),
    },
    // verificationUrl はトークンを含む一意な URL。同一トークンでの再送信のみ
    // dedupe される。トークンが変わればキーも変わるため、再発行時は新規送信扱い。
    idempotencyKey: `change-email-verification/${hashForKey(data.verificationUrl)}`,
    operation: "sendChangeEmailVerificationEmail",
    context: {
      email: data.email,
    },
  });
}
