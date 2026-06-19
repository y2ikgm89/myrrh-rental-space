import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";

export async function getNotificationEmailAddresses(): Promise<string[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NOTIFICATION_SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          notificationEmailAddresses: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getNotificationEmailAddresses",
  });

  if (!settings?.notificationEmailAddresses) {
    return [];
  }

  return settings.notificationEmailAddresses
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
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
  /** 新規イベント申込の管理者通知を送るか */
  notifyEventRegistration: boolean;
  /** イベント申込キャンセルの管理者通知を送るか */
  notifyEventCancellation: boolean;
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
 * カラム欠損時は schema の `@default(true)` と同じく送信側に倒す。
 */
export async function getEmailDeliverySettings(): Promise<EmailDeliverySettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.NOTIFICATION_SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          sendReservationConfirmationEmail: true,
          notifyNewReservation: true,
          notifyReservationChange: true,
          notifyReservationCancel: true,
          notifyNewInquiry: true,
          notifyEventRegistration: true,
          notifyEventCancellation: true,
          senderEmail: true,
          senderName: true,
          replyToEmail: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getEmailDeliverySettings",
  });

  return {
    sendReservationConfirmationEmail:
      settings?.sendReservationConfirmationEmail ?? true,
    notifyNewReservation: settings?.notifyNewReservation ?? true,
    notifyReservationChange: settings?.notifyReservationChange ?? true,
    notifyReservationCancel: settings?.notifyReservationCancel ?? true,
    notifyNewInquiry: settings?.notifyNewInquiry ?? true,
    notifyEventRegistration: settings?.notifyEventRegistration ?? true,
    notifyEventCancellation: settings?.notifyEventCancellation ?? true,
    senderEmail: settings?.senderEmail ?? null,
    senderName: settings?.senderName ?? null,
    replyToEmail: settings?.replyToEmail ?? null,
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
      prisma.settings.findUnique({
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
