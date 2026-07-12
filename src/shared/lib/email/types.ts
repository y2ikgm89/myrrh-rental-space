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
  /**
   * 予約に紐づく会員 ID。会員予約なら User.id、ゲスト予約なら null/undefined。
   * メール本文の動線を「会員=マイページ詳細リンク」「ゲスト=暗号化トークン URL」に
   * 出し分けるために使う。
   */
  userId?: string | null;
  /**
   * 予約確定時に発行されたスマートロックの一時パスコード一覧。
   * 対象スペースにスマートロックデバイスが無ければ undefined/空配列。
   */
  smartLockPasscodes?: { deviceName: string; passcode: string }[];
  /**
   * スマートロック発行が失敗した際の代替入室手段案内フラグ (PR#12)。
   * true のとき確認メール内で「当日運営までお問い合わせください」の fallback
   * セクションを描画する。設定するのは呼び出し側 (issueSmartLockAndSendConfirmationEmail)
   * で、失敗判定は「issueSmartLockPasscodes が空を返し、かつ SmartLockPasscode 行が
   * FAILED で存在」の条件。
   */
  smartLockIssuanceFailed?: boolean;
  /** 発行失敗時に案内する連絡先 (null → sender 情報にフォールバック)。 */
  smartLockFallbackContact?: {
    readonly phone?: string | null;
    readonly email?: string | null;
  };
};

export type ContactEmailData = {
  inquiryId: string;
  name: string;
  companyName?: string | null;
  email: string;
  subject: string;
  message: string;
  /**
   * ログイン中に送信した場合の Customer.id。ゲスト送信なら null/undefined。
   * マイページ確認リンクの出し分けに使う（送信時点のセッション由来のみを信頼し、
   * 事後に resolveOrCreateGuestInquiryCustomer が発行するゲスト shell とは区別する）。
   */
  customerId?: string | null;
};

export type InquiryReplyEmailData = {
  inquiryId: string;
  customerName: string;
  customerEmail: string;
  originalSubject: string;
  originalMessage: string;
  replyMessage: string;
  repliedByName: string;
  /** 問い合わせに紐づく Customer の User.id。ログイン可能な実アカウントが無ければ null。 */
  customerUserId?: string | null;
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
  /** レビュー元の予約 ID。マイページ確認リンクの組み立てに使う。 */
  reservationId: string;
  /** レビュー投稿者 Customer の User.id。ログイン可能な実アカウントが無ければ null。 */
  customerUserId: string | null;
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
  /** 会員予約の場合の User.id。ゲストなら null/undefined。 */
  userId?: string | null;
};

export type DeleteAccountVerificationEmailData = {
  email: string;
  name: string;
  deletionUrl: string;
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
  /** 会員予約の場合の User.id。ゲストなら null/undefined。 */
  userId?: string | null;
  /** CONFIRMEDへの遷移時に発行されたスマートロックの一時パスコード一覧 */
  smartLockPasscodes?: { deviceName: string; passcode: string }[];
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
