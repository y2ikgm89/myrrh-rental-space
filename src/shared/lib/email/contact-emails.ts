/**
 * お問い合わせ関連メール
 *
 * お問い合わせ確認、管理者通知メールの送信。
 *
 * @module shared/lib/email/contact-emails
 */

import "server-only";
import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import { ContactConfirmationEmail } from "@/shared/emails/contact-confirmation";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import {
  getEmailDeliverySettings,
  getNotificationEmailAddresses,
} from "@/shared/domain/settings/queries/notification";
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";
import { PRIVACY_POLICY_TERMS_TYPE } from "@/shared/lib/validations/terms";
import { getAdminUrl } from "../admin-urls";
import { getAppUrl } from "../constants";
import { sendEmail } from "./send";
import type { ContactEmailData, EmailResult } from "./types";

/**
 * お問い合わせ ID から、会員向けマイページの問い合わせ詳細 URL を組み立てる。
 * userId が無い（ゲスト送信・未ログイン）場合は undefined を返す。
 */
export function buildMemberInquiryUrl(
  userId: string | null | undefined,
  inquiryId: string,
): string | undefined {
  if (!userId) return undefined;
  return `${getAppUrl()}/mypage/inquiries/${inquiryId}`;
}

/**
 * 公開中のプライバシーポリシー規約の絶対 URL を解決する。該当文書が無ければ
 * undefined を返し、呼び出し側はプレーンテキストにフォールバックする。
 */
async function resolvePrivacyPolicyUrl(): Promise<string | undefined> {
  const doc = await getPublishedTermsByType(PRIVACY_POLICY_TERMS_TYPE);
  return doc ? `${getAppUrl()}/terms/${doc.slug}` : undefined;
}

/**
 * お問い合わせ確認メールを送信
 */
export async function sendContactConfirmationEmail(
  data: ContactEmailData,
): Promise<EmailResult> {
  const [footer, privacyPolicyUrl] = await Promise.all([
    getEmailFooterData(),
    resolvePrivacyPolicyUrl(),
  ]);
  const memberInquiryUrl = buildMemberInquiryUrl(
    data.customerId,
    data.inquiryId,
  );

  return sendEmail({
    payload: {
      to: data.email,
      subject: `【お問い合わせ受付】${data.subject}`,
      react: ContactConfirmationEmail({
        name: data.name,
        subject: data.subject,
        message: data.message,
        ...(memberInquiryUrl !== undefined ? { memberInquiryUrl } : {}),
        ...(privacyPolicyUrl !== undefined ? { privacyPolicyUrl } : {}),
        footer,
      }),
    },
    idempotencyKey: `contact-confirm/${data.inquiryId}`,
    operation: "sendContactConfirmationEmail",
    context: {
      inquiryId: data.inquiryId,
      email: data.email,
    },
  });
}

/**
 * お問い合わせ管理者通知メールを送信
 */
export async function sendContactAdminNotification(
  data: ContactEmailData,
): Promise<EmailResult> {
  const { notifyNewInquiry } = await getEmailDeliverySettings();
  if (!notifyNewInquiry) return { ok: false, reason: "disabled" };

  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { ok: false, reason: "disabled" };

  const footer = await getEmailFooterData();

  return sendEmail({
    payload: {
      to: notificationEmails,
      subject: `【新規お問い合わせ】${data.subject} - ${data.name}様`,
      react: AdminNotificationEmail({
        type: "inquiry",
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
        inquiryId: data.inquiryId.slice(0, 8).toUpperCase(),
        adminUrl: getAdminUrl(`/inquiries/${data.inquiryId}`),
        footer,
      }),
    },
    idempotencyKey: `contact-admin/${data.inquiryId}`,
    operation: "sendContactAdminNotification",
    context: {
      inquiryId: data.inquiryId,
    },
  });
}
