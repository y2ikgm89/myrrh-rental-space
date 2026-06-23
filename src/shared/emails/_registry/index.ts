/**
 * メールテンプレート レジストリ（server-only な完全版）。
 *
 * - 値の SSoT は `./data.ts`（`TEMPLATE_KEYS` / `EMAIL_TEMPLATE_INDEX`）
 * - 完全 registry はテンプレ component + fixture + sendTest を保持
 *
 * 設計判断（再 litigate 禁止）:
 *
 *  - **sendTest は sender ラッパー（`src/shared/lib/email/*`）を経由せず `sendEmail` を直接呼ぶ。**
 *    テンプレ render 結果 + subject + recipient のみテスト用に上書きし、idempotency key 形状や tags は
 *    テスト送信専用 namespace（`template-test/<key>/...`、`category=template_test`）に統一。
 *    既存 sender に optional 引数を混入せずに済むため、production 送信パスへの侵襲がゼロ。
 *
 *  - **`__infra_check` は runtime に fixture を上書き**（recipientLabel / triggeredBy* / siteName /
 *    timestamp = 「本物の送信者・宛先・時刻」）。それ以外のエントリは static fixture を使う
 *    （プレビュー UI と完全一致）。
 *
 *  - **`fixtureOverride`** を SendTestInput で受けて make-send-test 側で fixture に浅マージする。
 *    呼び出し側（Server Action）が `useRealFooter` 時に `{footer: realFooter}` を渡せば、
 *    registry 経由で同じ sendEmail パス（idempotency key / tags / headers の SSoT）を使える。
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import {
  adminNotificationInquiryFixture,
  adminNotificationReservationFixture,
} from "@/shared/emails/admin-notification.fixture";
import { ContactConfirmationEmail } from "@/shared/emails/contact-confirmation";
import { contactConfirmationFixture } from "@/shared/emails/contact-confirmation.fixture";
import { EventAdminNotificationEmail } from "@/shared/emails/event-admin-notification";
import { eventAdminNotificationFixture } from "@/shared/emails/event-admin-notification.fixture";
import { EventCancelledNotificationEmail } from "@/shared/emails/event-cancelled-notification";
import { eventCancelledNotificationFixture } from "@/shared/emails/event-cancelled-notification.fixture";
import { EventRegistrationCancelledEmail } from "@/shared/emails/event-registration-cancelled";
import { eventRegistrationCancelledFixture } from "@/shared/emails/event-registration-cancelled.fixture";
import { EventRegistrationConfirmationEmail } from "@/shared/emails/event-registration-confirmation";
import { eventRegistrationConfirmationFixture } from "@/shared/emails/event-registration-confirmation.fixture";
import { EventUpdatedNotificationEmail } from "@/shared/emails/event-updated-notification";
import { eventUpdatedNotificationFixture } from "@/shared/emails/event-updated-notification.fixture";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { inquiryReplyFixture } from "@/shared/emails/inquiry-reply.fixture";
import { InquiryStatusNotificationEmail } from "@/shared/emails/inquiry-status-notification";
import { inquiryStatusNotificationFixture } from "@/shared/emails/inquiry-status-notification.fixture";
import { PasswordResetEmail } from "@/shared/emails/password-reset";
import { passwordResetFixture } from "@/shared/emails/password-reset.fixture";
import { ReservationCancelledEmail } from "@/shared/emails/reservation-cancelled";
import { reservationCancelledFixture } from "@/shared/emails/reservation-cancelled.fixture";
import { ReservationConfirmationEmail } from "@/shared/emails/reservation-confirmation";
import { reservationConfirmationFixture } from "@/shared/emails/reservation-confirmation.fixture";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { reservationReminderFixture } from "@/shared/emails/reservation-reminder.fixture";
import { ReservationStatusChangedEmail } from "@/shared/emails/reservation-status-changed";
import { reservationStatusChangedFixture } from "@/shared/emails/reservation-status-changed.fixture";
import { ReviewReplyEmail } from "@/shared/emails/review-reply";
import { reviewReplyFixture } from "@/shared/emails/review-reply.fixture";
import { StaffInvitationEmail } from "@/shared/emails/staff-invitation";
import { staffInvitationFixture } from "@/shared/emails/staff-invitation.fixture";
import { TestEmail } from "@/shared/emails/test-email";
import { testEmailFixture } from "@/shared/emails/test-email.fixture";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { welcomeFixture } from "@/shared/emails/welcome.fixture";

import { sendEmail } from "@/shared/lib/email/send";
import type { EmailResult } from "@/shared/lib/email/types";

import { EMAIL_TEMPLATE_INDEX, type TemplateKey } from "./data";
import type { SendTestInput, TemplateEntry } from "./types";

/** 全テスト送信メールの subject 先頭に必ず付与する prefix。 */
const TEST_SUBJECT_PREFIX = "[TEST]";

/** Resend `tags` キー: テスト送信は production 配信から完全分離して dashboard で抽出可能にする。 */
const TEST_TAG_CATEGORY = { name: "category", value: "template_test" };

function buildIdempotencyKey(key: TemplateKey, staffId: string): string {
  const ts = new Date().getTime();
  const rnd6 = randomUUID().replace(/-/g, "").slice(0, 6);
  return `template-test/${key}/${staffId}/${ts}-${rnd6}`;
}

function buildSubject(label: string): string {
  return `${TEST_SUBJECT_PREFIX} ${label}`;
}

/**
 * 各 entry の sendTest 共通実装。
 *
 * - `mergeRuntime` で fixture を「現在の送信コンテキスト」（recipient / triggered* /
 *   siteName / timestamp）でマージする。デフォルトは fixture そのまま、
 *   `__infra_check` だけ全フィールドを上書きする。
 * - `input.fixtureOverride` は呼び出し側からの追加 override（useRealFooter 等）。
 */
function makeSendTest<P>(
  key: TemplateKey,
  label: string,
  component: (props: P) => import("react").ReactElement,
  fixture: P,
  mergeRuntime: (fixture: P, input: SendTestInput) => P = (f) => f,
): TemplateEntry<P>["sendTest"] {
  return async (input: SendTestInput): Promise<EmailResult> => {
    const merged = mergeRuntime(fixture, input);
    const withOverride = (
      input.fixtureOverride
        ? { ...(merged as Record<string, unknown>), ...input.fixtureOverride }
        : merged
    ) as P;

    return sendEmail({
      payload: {
        to: input.to,
        subject: buildSubject(label),
        react: component(withOverride),
        tags: [
          TEST_TAG_CATEGORY,
          { name: "template", value: key },
          ...(input.simulatorAddress
            ? [{ name: "simulator", value: "true" }]
            : []),
        ],
        headers: { "X-Template-Test": key },
      },
      idempotencyKey: buildIdempotencyKey(key, input.staffId),
      operation: "settings.template_test_send",
      context: { templateKey: key, recipient: input.to },
    });
  };
}

/** `__infra_check` 専用: TestEmail の identity フィールドを送信時値で上書き。 */
function mergeInfraCheckRuntime<P extends Record<string, unknown>>(
  fixture: P,
  input: SendTestInput,
): P {
  return {
    ...fixture,
    recipientLabel: input.to,
    triggeredByName: input.triggeredByName,
    triggeredByEmail: input.triggeredByEmail,
    siteName: input.siteName,
    timestamp: new Date(),
  } as P;
}

/** EMAIL_TEMPLATE_INDEX から meta を引いて entry を組み立てる（label/description/category の二重定義を避ける）。 */
function metaFor(key: TemplateKey): {
  label: string;
  description: string;
  category: import("./data").TemplateCategory;
} {
  const item = EMAIL_TEMPLATE_INDEX.find((i) => i.key === key);
  if (!item) {
    throw new Error(`Template meta missing for key: ${key}`);
  }
  return {
    label: item.label,
    description: item.description,
    category: item.category,
  };
}

function defineEntry<P>(
  key: TemplateKey,
  component: (props: P) => import("react").ReactElement,
  fixture: P,
  mergeRuntime?: (fixture: P, input: SendTestInput) => P,
): TemplateEntry<P> {
  const meta = metaFor(key);
  return {
    key,
    ...meta,
    component,
    fixture,
    sendTest: makeSendTest(key, meta.label, component, fixture, mergeRuntime),
  };
}

/**
 * 19 エントリの SSoT。registry は `satisfies Record<TemplateKey, …>` で全 key 網羅を
 * compile error で enforce する。
 */
export const EMAIL_TEMPLATE_REGISTRY = {
  "reservation-confirmation": defineEntry(
    "reservation-confirmation",
    ReservationConfirmationEmail as (
      p: unknown,
    ) => import("react").ReactElement,
    reservationConfirmationFixture as unknown,
  ),
  "reservation-cancelled": defineEntry(
    "reservation-cancelled",
    ReservationCancelledEmail as (p: unknown) => import("react").ReactElement,
    reservationCancelledFixture as unknown,
  ),
  "reservation-status-changed": defineEntry(
    "reservation-status-changed",
    ReservationStatusChangedEmail as (
      p: unknown,
    ) => import("react").ReactElement,
    reservationStatusChangedFixture as unknown,
  ),
  "reservation-reminder": defineEntry(
    "reservation-reminder",
    ReservationReminderEmail as (p: unknown) => import("react").ReactElement,
    reservationReminderFixture as unknown,
  ),
  "event-registration-confirmation": defineEntry(
    "event-registration-confirmation",
    EventRegistrationConfirmationEmail as (
      p: unknown,
    ) => import("react").ReactElement,
    eventRegistrationConfirmationFixture as unknown,
  ),
  "event-registration-cancelled": defineEntry(
    "event-registration-cancelled",
    EventRegistrationCancelledEmail as (
      p: unknown,
    ) => import("react").ReactElement,
    eventRegistrationCancelledFixture as unknown,
  ),
  "event-cancelled-notification": defineEntry(
    "event-cancelled-notification",
    EventCancelledNotificationEmail as (
      p: unknown,
    ) => import("react").ReactElement,
    eventCancelledNotificationFixture as unknown,
  ),
  "event-updated-notification": defineEntry(
    "event-updated-notification",
    EventUpdatedNotificationEmail as (
      p: unknown,
    ) => import("react").ReactElement,
    eventUpdatedNotificationFixture as unknown,
  ),
  "event-admin-notification": defineEntry(
    "event-admin-notification",
    EventAdminNotificationEmail as (p: unknown) => import("react").ReactElement,
    eventAdminNotificationFixture as unknown,
  ),
  "contact-confirmation": defineEntry(
    "contact-confirmation",
    ContactConfirmationEmail as (p: unknown) => import("react").ReactElement,
    contactConfirmationFixture as unknown,
  ),
  "inquiry-reply": defineEntry(
    "inquiry-reply",
    InquiryReplyEmail as (p: unknown) => import("react").ReactElement,
    inquiryReplyFixture as unknown,
  ),
  "inquiry-status-notification": defineEntry(
    "inquiry-status-notification",
    InquiryStatusNotificationEmail as (
      p: unknown,
    ) => import("react").ReactElement,
    inquiryStatusNotificationFixture as unknown,
  ),
  "admin-notification-reservation": defineEntry(
    "admin-notification-reservation",
    AdminNotificationEmail as (p: unknown) => import("react").ReactElement,
    adminNotificationReservationFixture as unknown,
  ),
  "admin-notification-inquiry": defineEntry(
    "admin-notification-inquiry",
    AdminNotificationEmail as (p: unknown) => import("react").ReactElement,
    adminNotificationInquiryFixture as unknown,
  ),
  welcome: defineEntry(
    "welcome",
    WelcomeEmail as (p: unknown) => import("react").ReactElement,
    welcomeFixture as unknown,
  ),
  "password-reset": defineEntry(
    "password-reset",
    PasswordResetEmail as (p: unknown) => import("react").ReactElement,
    passwordResetFixture as unknown,
  ),
  "staff-invitation": defineEntry(
    "staff-invitation",
    StaffInvitationEmail as (p: unknown) => import("react").ReactElement,
    staffInvitationFixture as unknown,
  ),
  "review-reply": defineEntry(
    "review-reply",
    ReviewReplyEmail as (p: unknown) => import("react").ReactElement,
    reviewReplyFixture as unknown,
  ),
  __infra_check: defineEntry(
    "__infra_check",
    TestEmail as (p: unknown) => import("react").ReactElement,
    testEmailFixture as unknown,
    mergeInfraCheckRuntime as (
      fixture: unknown,
      input: SendTestInput,
    ) => unknown,
  ),
} as const satisfies Readonly<Record<TemplateKey, TemplateEntry<unknown>>>;

/** Unknown key で呼ばれた場合は throw。Server Action で先に Zod 検証する想定。 */
export function getTemplate(key: TemplateKey): TemplateEntry<unknown> {
  const entry = EMAIL_TEMPLATE_REGISTRY[key];
  if (!entry) {
    throw new Error(`Unknown email template key: ${key}`);
  }
  return entry;
}
