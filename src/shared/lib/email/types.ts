/**
 * メールサービス共通型定義
 *
 * @module shared/lib/email/types
 */

import type { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

export type ReservationEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  companyName?: string | null;
  guestName?: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string;
  location?: string;
  icsSequence: number;
};

export type ContactEmailData = {
  inquiryId: string;
  name: string;
  companyName?: string | null;
  email: string;
  subject: string;
  message: string;
};

export type StaffInvitationEmailData = {
  to: string;
  staffName: string;
  setupUrl: string;
  expiresAt: Date;
};

export type InquiryReplyEmailData = {
  inquiryId: string;
  customerName: string;
  customerEmail: string;
  originalSubject: string;
  originalMessage: string;
  replyMessage: string;
  repliedByName: string;
};

export type ReviewReplyEmailData = {
  reviewId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  rating: number;
  originalTitle: string | null;
  originalComment: string | null;
  replyBody: string;
};

export type WelcomeEmailData = {
  customerName: string;
  customerEmail: string;
  loginUrl: string;
};

export type ReminderEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  location: string | undefined;
  notes: string | undefined;
  icsSequence: number;
};

export type PasswordResetEmailData = {
  email: string;
  name: string;
  resetUrl: string;
};

export type StatusChangeEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  oldStatus: ReservationStatus;
  newStatus: ReservationStatus;
  location?: string;
  icsSequence: number;
};

/**
 * メール送信結果。
 *
 * - `{ ok: true; messageId }` — Resend が受理（API レベル成功、配信は別途 webhook で観測）
 * - `{ ok: false; reason: "disabled" }` — RESEND_API_KEY 未設定で no-op
 * - `{ ok: false; reason: "error"; error }` — Resend API エラー（retry 尽きた後）
 */
export type EmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "error"; error: string };
