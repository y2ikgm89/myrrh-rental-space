/**
 * メールサービス共通型定義
 *
 * @module shared/lib/email/types
 */

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
  oldStatus: string;
  newStatus: string;
  location?: string;
  icsSequence: number;
};

export type EmailResult = { success: boolean; error?: string };
