/**
 * メールサービス共通型定義
 *
 * @module shared/lib/email/types
 */

import type {
  EventFormatValue,
  PaymentStatus,
  RegistrationStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { TransferAccountType } from "@/shared/lib/validations/enums/helpers";

/** iCal 添付・「カレンダーに追加」リンクの Settings 由来フラグ（lib 側 DTO）。 */
export type CalendarEmailSettings = {
  readonly icalAttachmentEnabled: boolean;
  readonly addToCalendarLinksEnabled: boolean;
};

/** iCal ORGANIZER 行用の Settings 由来データ（lib 側 DTO）。 */
export type IcalOrganizerSettings = {
  readonly name: string;
  readonly email: string;
};

/** send.ts / domain-verification が Resend API を叩くための transport DTO。 */
export type EmailTransportContext = {
  readonly resendApiKey: string | null;
};

/** From / Reply-To 解決用の delivery DTO（toggle 群は含めない）。 */
export type EmailDeliveryContext = {
  readonly senderEmail: string | null;
  readonly senderName: string | null;
  readonly replyToEmail: string | null;
};

/** domain が prefetch して lib `sendEmail` に渡す送信コンテキスト。 */
export type EmailSendContext = {
  readonly transport: EmailTransportContext;
  readonly delivery: EmailDeliveryContext;
  readonly suppressedEmailHashes: ReadonlySet<string>;
};

/** お問い合わせ管理者通知の宛先 + toggle（domain が resolve して lib に渡す）。 */
export type ContactAdminNotificationDelivery = {
  readonly notificationEmails: readonly string[];
};

/** お問い合わせ確認メール render 用（domain が resolve して lib に渡す）。 */
export type ContactConfirmationRenderContext = {
  readonly privacyPolicyUrl?: string;
};

/** 予約リマインダ render 用 Settings DTO（domain が fetch して lib に渡す）。 */
export type ReminderEmailRenderContext = {
  readonly calendarSettings: CalendarEmailSettings;
  readonly deadlineSettings: { readonly cancellationDeadlineHours: number };
  readonly organizer: IcalOrganizerSettings;
};

/** システム通知メールの宛先（domain が resolve して lib に渡す）。 */
export type SystemNotificationDelivery = {
  readonly notificationEmails: readonly string[];
};

/** 顧客一斉配信の送信先（domain が fetch して lib に渡す）。 */
export type CustomerBroadcastRecipient = {
  readonly id: string;
  readonly email: string;
};

/** イベント系メールの render 時に必要な Settings DTO（domain が fetch して lib に渡す）。 */
export type EventEmailRenderContext = {
  readonly calendarSettings: CalendarEmailSettings;
  readonly organizer: IcalOrganizerSettings;
  readonly transferAccounts: readonly TransferAccountEmailDisplay[];
  readonly transferGuidance: string | null;
  readonly onlinePaymentAvailable: boolean;
};

/** 予約メールのキャンセル/変更期限（SettingsReservation 由来）。 */
export type ReservationDeadlineSettings = {
  readonly cancellationDeadlineHours: number;
  readonly modificationDeadlineHours: number;
};

export type TransferAccountEmailDisplay = {
  readonly bankName: string;
  readonly branchName: string;
  readonly accountType: TransferAccountType;
  readonly accountNumber: string;
  readonly accountHolderName: string;
  readonly note?: string | null;
};

/**
 * 予約系メールの render 時に必要な Settings / terms DTO
 * （domain が fetch して lib に渡す）。
 */
export type ReservationEmailRenderContext = {
  readonly calendarSettings: CalendarEmailSettings;
  readonly organizer: IcalOrganizerSettings;
  readonly deadlineSettings: ReservationDeadlineSettings;
  readonly cancellationPolicyUrl: string | undefined;
  readonly transferAccounts: readonly TransferAccountEmailDisplay[];
  readonly transferGuidance: string | null;
  readonly onlinePaymentAvailable: boolean;
};

/** 管理者向けイベント通知メールの宛先（domain が resolve して lib に渡す）。 */
export type EventAdminNotificationDelivery = {
  readonly notificationEmails: readonly string[];
};

/** 管理者向け予約通知メールの宛先（domain が resolve して lib に渡す）。 */
export type ReservationAdminNotificationDelivery = {
  readonly notificationEmails: readonly string[];
};

export type EventCancelledNotificationPayload = {
  readonly eventId: string;
  readonly title: string;
  readonly format: EventFormatValue;
  readonly meetingUrl: string | null;
  readonly updatedAt: Date;
  readonly venueDisplay: string | null;
  readonly registrations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly email: string | null;
    readonly quantity: number;
    readonly icsSequence: number;
    readonly customerId: string | null;
    readonly status: RegistrationStatus;
    readonly slot: { readonly startAt: Date; readonly endAt: Date };
  }>;
};

export type EventUpdatedNotificationPayload = {
  readonly eventId: string;
  readonly title: string;
  readonly format: EventFormatValue;
  readonly meetingUrl: string | null;
  readonly updatedAt: Date;
  readonly venueDisplay: string | null;
  readonly registrations: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly email: string | null;
    readonly quantity: number;
    readonly icsSequence: number;
    readonly slotId: string;
    readonly customerId: string | null;
    readonly slot: { readonly startAt: Date; readonly endAt: Date };
  }>;
};

export type EventBroadcastPayload = {
  readonly eventId: string;
  readonly title: string;
  readonly slug: string;
  /**
   * 配信先。**申込単位ではなく人単位**で、正規化メールで重複を畳んだ後の列（監査 A-22）。
   * 一斉配信の本文は人に対して 1 つなので、同じ宲先へ 2 通送らない。
   */
  readonly recipients: ReadonlyArray<{
    readonly id: string;
    readonly email: string;
    readonly customerId: string | null;
  }>;
  readonly skipped: number;
  readonly customerIdByEmail: ReadonlyMap<string, string>;
};

export type InquiryStatusNotificationData = {
  readonly id: string;
  readonly receiptNumber: string;
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly updatedAt: Date;
  readonly customerUserId: string | undefined;
};

/** お問い合わせ続報の管理者通知メール宛先（domain が resolve して lib に渡す）。 */
export type InquiryAdminNotificationDelivery = {
  readonly notificationEmails: readonly string[];
};

export type ReservationEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  companyName?: string | null;
  guestName?: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  /**
   * メール本文に出す料金（**税込**）。
   *
   * 旧実装は税抜の `totalPrice` を「料金:」として税抜と明示せずに出していた
   * （監査 F-74）。公開ページも領収書 PDF も Stripe charge も税込なので、
   * 同じ予約の金額が経路ごとに食い違う。payment feature OFF の運用では同じメールに
   * 「お振込先」が並ぶため、**顧客はメール記載の税抜額を振り込み、税額ぶん不足する**。
   *
   * 返金メールだけは元から税込 (`originalTotal`) を使っており、
   * 同一予約の中でも税抜/税込が混在していた。
   */
  totalPriceWithTax: number | null;
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
   * スマートロック発行が失敗した際の代替入室手段案内フラグ (PR#12)。
   * true のとき確認メール内で「当日運営までお問い合わせください」の fallback
   * セクションを描画する。設定するのは `confirmation-side-effects.ts`
   * （`applyConfirmationSideEffects`）で、失敗判定は「issueSmartLockPasscodes が空を返し、かつ SmartLockPasscode 行が
   * FAILED で存在」の条件。平文パスコードはメールに載せない（予約詳細ハブで開示）。
   */
  smartLockIssuanceFailed?: boolean;
  /** 発行失敗時に案内する連絡先 (null → sender 情報にフォールバック)。 */
  smartLockFallbackContact?: {
    readonly phone?: string | null;
    readonly email?: string | null;
  };
  /** 振込先表示 gate 用。省略時は UNPAID 扱い（新規予約確認）。 */
  paymentStatus?: PaymentStatus;
};

export type ContactEmailData = {
  inquiryId: string;
  /**
   * Inquiry.receiptNumber (「INQ-XXXXXXXX」形式)。顧客向け・管理者向けの両メールで
   * 目立つ位置に表示し、以後の問い合わせ突合の主キーとして案内する (Medium #16)。
   */
  receiptNumber: string;
  name: string;
  companyName?: string | null;
  email: string;
  /**
   * Inquiry.phoneNumber。ゲストから電話番号が入力されていれば設定される。
   * 管理者通知メールで折り返し先として表示する。未入力なら null/undefined。
   */
  phoneNumber?: string | null;
  subject: string;
  message: string;
  /**
   * ログイン中に送信した場合の Customer.id。ゲスト送信なら null/undefined。
   * マイページ確認リンクの出し分けに使う（送信時点のセッション由来のみを信頼し、
   * 事後に resolveOrCreateGuestInquiryCustomer が発行するゲスト shell とは区別する）。
   */
  customerId?: string | null;
};

export type InquiryCustomerReplyAdminEmailData = {
  inquiryId: string;
  /** Inquiry.receiptNumber (「INQ-XXXXXXXX」形式)。件名・本文で突合の主キー。 */
  receiptNumber: string;
  customerName: string;
  subject: string;
  replyMessage: string;
};

export type InquiryReplyEmailData = {
  inquiryId: string;
  /**
   * Inquiry.receiptNumber (「INQ-XXXXXXXX」形式)。返信メールの件名・本文で
   * 目立つ位置に表示し、以後の問い合わせ突合の主キーとして案内する (Medium #16)。
   */
  receiptNumber: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  message: string;
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
  /**
   * Customer.id (uuid). idempotencyKey に含めることで、同一メールアドレスで
   * delete-account → 24h 内に re-signup したときの Resend 409
   * (`invalid_idempotent_request`) を防ぐ。新規登録ごとに Customer は必ず
   * 新規採番されるため collision しない（RESEND-AUDIT L5）。
   */
  customerId: string;
  customerName: string;
  customerEmail: string;
  /** マイページの完全な URL。テンプレートはこれをそのまま href にする。 */
  mypageUrl: string;
};

/**
 * 領収書新規発行通知メール用データ（ゲスト・会員共通）。
 *
 * `detailUrl` は呼出側が組み立てる（会員 mypage / ゲスト status token URL 等）。
 * PDF API 直リンクは表導線にしない。
 */
export type ReceiptIssuedEmailData = {
  recipientEmail: string;
  serialNo: string;
  recipientName: string;
  subject: string;
  amount: number;
  taxAmount: number;
  issuedAt: Date;
  /** CTA 先（予約/申込詳細）。sender は URL を生成しない。 */
  detailUrl: string;
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
  /** cron リマインダ対象日（JST YYYY-MM-DD）。Resend idempotencyKey 用。 */
  reminderWindowDate: string;
};

export type DeleteAccountVerificationEmailData = {
  email: string;
  name: string;
  deletionUrl: string;
};

export type ChangeEmailVerificationEmailData = {
  /** 送信先 = 登録リクエストされた新しいメールアドレス。 */
  email: string;
  name: string;
  newEmail: string;
  verificationUrl: string;
};

export type CustomerMergeVerificationEmailData = {
  /** 送信先 = guest email（本人確認用）。 */
  email: string;
  name: string;
  guestEmail: string;
  verificationUrl: string;
  reservationCount: number;
  inquiryCount: number;
  reviewCount: number;
  registrationCount: number;
};

/**
 * Phase B.2: series 一括キャンセルの集約通知メール用データ。
 *
 * 顧客向け（`sendBulkReservationCancelledEmail`）・管理者向け
 * （`sendBulkAdminNotification`）の両方が同じ形状を共有する
 * （`cancellation-side-effects.ts` の `applyBulkCancellationSideEffects` が
 * 1 回だけ組み立てて両関数に渡す）。
 */
export type BulkReservationCancelledEmailData = {
  seriesId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  /** キャンセル対象になった各 instance の日時（表示用整形は sender 側で行う）。 */
  instances: { startTime: Date; endTime: Date }[];
  reason?: string;
  /**
   * 24h 内の複数回 partial cancel を Resend の idempotency 409 で silent drop
   * させないための batch 識別子（RESEND-AUDIT L6）。
   *
   * 呼出側 (`applyBulkCancellationSideEffects`) が batch 開始時に
   * `crypto.randomUUID()` で 1 度だけ生成し、顧客向け・管理者向けの両送信で
   * 同じ値を共有する（この batch の 2 通は同じ nonce で冪等リトライ可）。
   * 別 batch では別 nonce になるため、Resend の同一キー再送で payload が
   * 異なる (instances[]/reason 差分) 場合の 409 = 送信 skip を回避する。
   *
   * `sendEventBroadcast` の `broadcastNonce` と同じ設計。
   */
  batchNonce: string;
};

export type ReservationRefundEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  /**
   * 今回の返金額 (円)。`refundReservationPaymentCommand` の `refundAmount` を
   * そのまま渡す。
   */
  refundAmount: number;
  /**
   * 累積返金額 (円)。同一予約への複数回の部分返金を経た合計値。
   * `refundReservationPaymentCommand` の `cumulativeAmount` を渡す。
   */
  cumulativeRefundAmount: number;
  /**
   * 予約の元請求額 (円)。`totalPriceWithTax` を優先 (Stripe charge SSoT)。
   * "累計 X 円 / 元 Y 円" 表示のため fetchReservationEmailData 経由で流す。
   */
  originalTotal: number;
  /** cumulative = originalTotal なら true (REFUNDED)、未満なら false (PARTIALLY_REFUNDED)。 */
  isFullyRefunded: boolean;
  /** 管理者入力の返金理由。空 / 未指定なら文面から省略。 */
  reason?: string;
  /**
   * Refund.id (Stripe refund の primary key)。idempotencyKey に含めて
   * 同一予約への複数回返金 (累計上書きシナリオ) で Resend の silent drop を防ぐ。
   */
  refundId: string;
  /** 会員予約の User.id (ゲスト予約なら null/undefined)。マイページ URL の出し分けに使う。 */
  userId?: string | null;
};

export type StatusChangeEmailData = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  /** メール本文に出す料金（**税込**）。理由は `ReservationEmailData` と同じ（監査 F-74）。 */
  totalPriceWithTax: number | null;
  oldStatus: ReservationStatus;
  newStatus: ReservationStatus;
  location?: string;
  icsSequence: number;
  /**
   * 会員予約の User.id。ゲストは `null`。
   *
   * **optional にしない（監査 A-21）。** 呼出側が 3 箇所で手組みしており、
   * 全部で渡し忘れていた。落ちると会員にもゲスト用の 90 日トークン URL が出る。
   */
  userId: string | null;
};

/**
 * メール送信結果。
 *
 * - `{ ok: true; messageId }` — Resend が受理（API レベル成功、配信は別途 webhook で観測）
 * - `{ ok: false; reason: "disabled" }` — RESEND_API_KEY 未設定 / 送信機能自体が OFF で no-op
 * - `{ ok: false; reason: "suppressed"; suppressedRecipients }` —
 *   全宛先が suppression list（HARD_BOUNCED / COMPLAINED）に該当し送信できなかった。
 *   一部宛先のみ suppressed のケースは対象を除外して送信を継続するため、この分岐には入らない
 *   （drop したアドレスは warning log のみ）。
 * - `{ ok: false; reason: "error"; error }` — Resend API エラー（retry 尽きた後）
 */
export type EmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "suppressed"; suppressedRecipients: readonly string[] }
  | { ok: false; reason: "error"; error: string };
