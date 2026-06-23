import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { AdminNotificationEmail } from "./admin-notification";

/**
 * 管理者通知メールは discriminated union（reservation | inquiry）のため、
 * レジストリでは 2 エントリに分割する。各バリエーション用のフィクスチャを
 * named export で提供する。
 */

export const adminNotificationReservationFixture = {
  type: "reservation" as const,
  action: "new" as const,
  customerName: "山田 太郎",
  customerEmail: "yamada@example.com",
  guestName: "山田 太郎",
  spaceName: "ミーティングルームA",
  reservationDate: "2026年7月15日 (水)",
  startTime: "13:00",
  endTime: "17:00",
  totalPrice: "8,000円",
  reservationId: "0123ABCD",
  adminUrl:
    "https://example.com/admin/reservations/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof AdminNotificationEmail>[0];

export const adminNotificationInquiryFixture = {
  type: "inquiry" as const,
  name: "山田 太郎",
  email: "yamada@example.com",
  subject: "施設利用に関するお問い合わせ",
  message:
    "来月の研修利用について、空き状況を確認したくご連絡しました。\n希望日時: 2026年8月10日（月）13:00-17:00\n参加人数: 約20名",
  inquiryId: "0123ABCD",
  adminUrl:
    "https://example.com/admin/inquiries/abcdef-0123-4567-89ab-cdef01234567",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof AdminNotificationEmail>[0];
