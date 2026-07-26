import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { DASHBOARD_ROLES } from "@/shared/lib/admin-roles";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { mergeRecipients } from "@/shared/lib/email/recipients";

/**
 * 通知先（スタッフ＋カスタム）を解決した実メールアドレス一覧を返す。
 *
 * - スタッフは `User.id` で保存し、ここで毎回 findMany して**現在の**メールに解決する
 *   （メール変更・退職に自動追従。意図的に非キャッシュ＝stale を作らない）。
 * - カスタムは `notificationEmailAddresses`（PostgreSQL text[] / Prisma String[]）。
 * - 重複は大文字小文字無視で除去（スタッフ優先・順序保持）。
 */
export async function getNotificationEmailAddresses(): Promise<string[]> {
  const settings = await safeFetch({
    fetch: () =>
      prisma.settingsNotification.findUnique({
        where: { id: "singleton" },
        select: {
          notificationEmailAddresses: true,
          notificationStaffIds: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getNotificationEmailAddresses",
  });

  const customEmails = settings?.notificationEmailAddresses ?? [];

  const staffIds = settings?.notificationStaffIds ?? [];
  let staffEmails: string[] = [];
  if (staffIds.length > 0) {
    // 退職・ロール降格などで非スタッフになった ID はメールを送らない。
    const users = await safeFetch({
      fetch: () =>
        prisma.user.findMany({
          where: {
            id: { in: staffIds },
            role: { in: [...DASHBOARD_ROLES] },
          },
          select: { email: true },
        }),
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getNotificationEmailAddresses.staff",
    });
    staffEmails = users.map((u) => u.email);
  }

  return mergeRecipients(staffEmails, customEmails);
}

export type EmailDeliverySettings = {
  /** 予約確認メール（予約者宛）を送るか */
  sendReservationConfirmationEmail: boolean;
  /** 新規予約の管理者通知を送るか */
  notifyNewReservation: boolean;
  /** 予約変更の管理者通知を送るか */
  notifyReservationChange: boolean;
  /** 予約キャンセルの管理者通知を送るか */
  notifyReservationCancel: boolean;
  /** 新規お問い合わせの管理者通知を送るか */
  notifyNewInquiry: boolean;
  /** お問い合わせ続報（顧客返信）の管理者通知を送るか */
  notifyInquiryCustomerReply: boolean;
  /** 新規イベント申込の管理者通知を送るか */
  notifyEventRegistration: boolean;
  /** イベントキャンセル待ち登録の管理者通知を送るか (満員状態の needs-attention シグナル) */
  notifyEventWaitlistRegistration: boolean;
  /** イベント申込キャンセルの管理者通知を送るか */
  notifyEventCancellation: boolean;
  /** イベント前日リマインダーを参加者へ送るか（既定 false = opt-in） */
  notifyEventReminder: boolean;
  /** 送信元メールアドレス（env EMAIL_FROM 未設定時のフォールバック。未設定なら null） */
  senderEmail: string | null;
  /** 送信者名（env EMAIL_FROM_NAME 未設定時のフォールバック。未設定なら null） */
  senderName: string | null;
  /** 全送信メールに付与する返信先（未設定なら null） */
  replyToEmail: string | null;
};

/**
 * メール配信のトグル設定をまとめて取得する。
 *
 * 各送信関数（`reservation-emails` / `contact-emails`）と `send.ts`（返信先注入）が
 * 参照する。`STATIC_SETTINGS` ライフで `NOTIFICATION_SETTINGS` タグにより無効化される。
 *
 * 管理者向け notify* は SettingsNotification 行が欠落・取得失敗時 fail-closed（すべて false）。
 * 行が存在すれば DB @default(true) をそのまま使う。顧客向け予約確認メールのみ
 * SettingsReservation 欠落時 true（schema @default(true)）を維持する。
 */
export async function getEmailDeliverySettings(): Promise<EmailDeliverySettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NOTIFICATION_SETTINGS);

  const [notification, organization, reservation] = await Promise.all([
    safeFetch({
      fetch: () =>
        prisma.settingsNotification.findUnique({
          where: { id: "singleton" },
          select: {
            notifyNewReservation: true,
            notifyReservationChange: true,
            notifyReservationCancel: true,
            notifyNewInquiry: true,
            notifyInquiryCustomerReply: true,
            notifyEventRegistration: true,
            notifyEventWaitlistRegistration: true,
            notifyEventCancellation: true,
            notifyEventReminder: true,
          },
        }),
      fallback: null,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getEmailDeliverySettings.notification",
    }),
    safeFetch({
      fetch: () =>
        prisma.settingsOrganization.findUnique({
          where: { id: "singleton" },
          select: {
            senderEmail: true,
            senderName: true,
            replyToEmail: true,
          },
        }),
      fallback: null,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getEmailDeliverySettings.organization",
    }),
    safeFetch({
      fetch: () =>
        prisma.settingsReservation.findUnique({
          where: { id: "singleton" },
          select: {
            sendReservationConfirmationEmail: true,
          },
        }),
      fallback: null,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getEmailDeliverySettings.reservation",
    }),
  ]);

  return {
    sendReservationConfirmationEmail:
      reservation?.sendReservationConfirmationEmail ?? true,
    notifyNewReservation: notification?.notifyNewReservation ?? false,
    notifyReservationChange: notification?.notifyReservationChange ?? false,
    notifyReservationCancel: notification?.notifyReservationCancel ?? false,
    notifyNewInquiry: notification?.notifyNewInquiry ?? false,
    notifyInquiryCustomerReply:
      notification?.notifyInquiryCustomerReply ?? false,
    notifyEventRegistration: notification?.notifyEventRegistration ?? false,
    notifyEventWaitlistRegistration:
      notification?.notifyEventWaitlistRegistration ?? false,
    notifyEventCancellation: notification?.notifyEventCancellation ?? false,
    // schema の @default(false) と揃える（他の notify* とは既定値が異なる）
    notifyEventReminder: notification?.notifyEventReminder ?? false,
    senderEmail: organization?.senderEmail ?? null,
    senderName: organization?.senderName ?? null,
    replyToEmail: organization?.replyToEmail ?? null,
  };
}

export async function getCalendarEmailSettings(): Promise<{
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
}> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NOTIFICATION_SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settingsGoogleCalendar.findUnique({
        where: { id: "singleton" },
        select: {
          icalAttachmentEnabled: true,
          addToCalendarLinksEnabled: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getCalendarEmailSettings",
  });

  return {
    icalAttachmentEnabled: settings?.icalAttachmentEnabled ?? true,
    addToCalendarLinksEnabled: settings?.addToCalendarLinksEnabled ?? true,
  };
}
