/**
 * メールサービス共通型定義
 *
 * @module shared/lib/email/types
 */

export type ReservationEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes?: string;
  location?: string;
};

export type ContactEmailData = {
  inquiryId: string;
  name: string;
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

export type EmailResult = { success: boolean; error?: string };
