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
import type { ReactElement } from "react";

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
import { EventReminderEmail } from "@/shared/emails/event-reminder";
import { eventReminderFixture } from "@/shared/emails/event-reminder.fixture";
import { EventRegistrationCancelledEmail } from "@/shared/emails/event-registration-cancelled";
import { eventRegistrationCancelledFixture } from "@/shared/emails/event-registration-cancelled.fixture";
import { EventRegistrationConfirmationEmail } from "@/shared/emails/event-registration-confirmation";
import { eventRegistrationConfirmationFixture } from "@/shared/emails/event-registration-confirmation.fixture";
import { EventUpdatedNotificationEmail } from "@/shared/emails/event-updated-notification";
import { eventUpdatedNotificationFixture } from "@/shared/emails/event-updated-notification.fixture";
import { EventWaitlistRegisteredEmail } from "@/shared/emails/event-waitlist-registered";
import { eventWaitlistRegisteredFixture } from "@/shared/emails/event-waitlist-registered.fixture";
import { EventWaitlistOfferedEmail } from "@/shared/emails/event-waitlist-offered";
import { eventWaitlistOfferedFixture } from "@/shared/emails/event-waitlist-offered.fixture";
import { EventWaitlistExpiredEmail } from "@/shared/emails/event-waitlist-expired";
import { eventWaitlistExpiredFixture } from "@/shared/emails/event-waitlist-expired.fixture";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { inquiryReplyFixture } from "@/shared/emails/inquiry-reply.fixture";
import { InquiryStatusNotificationEmail } from "@/shared/emails/inquiry-status-notification";
import { inquiryStatusNotificationFixture } from "@/shared/emails/inquiry-status-notification.fixture";
import { DeleteAccountVerificationEmail } from "@/shared/emails/delete-account-verification";
import { deleteAccountVerificationFixture } from "@/shared/emails/delete-account-verification.fixture";
import { ReservationCancelledEmail } from "@/shared/emails/reservation-cancelled";
import { reservationCancelledFixture } from "@/shared/emails/reservation-cancelled.fixture";
import { ReservationConfirmationEmail } from "@/shared/emails/reservation-confirmation";
import { reservationConfirmationFixture } from "@/shared/emails/reservation-confirmation.fixture";
import { ReservationUpdatedEmail } from "@/shared/emails/reservation-updated";
import { reservationUpdatedFixture } from "@/shared/emails/reservation-updated.fixture";
import { ReservationReminderEmail } from "@/shared/emails/reservation-reminder";
import { reservationReminderFixture } from "@/shared/emails/reservation-reminder.fixture";
import { BulkReservationCancelledEmail } from "@/shared/emails/bulk-reservation-cancelled";
import { bulkReservationCancelledFixture } from "@/shared/emails/bulk-reservation-cancelled.fixture";
import { ReservationStatusChangedEmail } from "@/shared/emails/reservation-status-changed";
import { reservationStatusChangedFixture } from "@/shared/emails/reservation-status-changed.fixture";
import { ReviewReplyEmail } from "@/shared/emails/review-reply";
import { reviewReplyFixture } from "@/shared/emails/review-reply.fixture";
import { TestEmail } from "@/shared/emails/test-email";
import { testEmailFixture } from "@/shared/emails/test-email.fixture";
import { WelcomeEmail } from "@/shared/emails/welcome";
import { welcomeFixture } from "@/shared/emails/welcome.fixture";

import { sendEmail } from "@/shared/lib/email/send";
import type { EmailResult } from "@/shared/lib/email/types";

import { EMAIL_TEMPLATE_INDEX, type TemplateKey } from "./data";
import type {
  SendTestInput,
  TemplateEntry,
  TemplateFixtureOverride,
} from "./types";
import type { EmailFooterData } from "@/shared/emails/_shared/footer-data";

/** 全テスト送信メールの subject 先頭に必ず付与する prefix。 */
const TEST_SUBJECT_PREFIX = "[TEST]";

/** Resend `tags` キー: テスト送信は production 配信から完全分離して dashboard で抽出可能にする。 */
const TEST_TAG_CATEGORY = { name: "category", value: "template_test" };

type EmailTemplateProps = {
  footer: EmailFooterData;
};

type RegistryTemplateEntry = Omit<
  TemplateEntry<EmailTemplateProps>,
  "component" | "fixture"
> & {
  component: (props: never) => ReactElement;
  fixture: EmailTemplateProps;
};

function buildIdempotencyKey(key: TemplateKey, staffId: string): string {
  const ts = new Date().getTime();
  const rnd6 = randomUUID().replace(/-/g, "").slice(0, 6);
  return `template-test/${key}/${staffId}/${ts}-${rnd6}`;
}

function buildSubject(label: string): string {
  return `${TEST_SUBJECT_PREFIX} ${label}`;
}

function mergeFixtureOverride<P extends EmailTemplateProps>(
  fixture: P,
  fixtureOverride?: TemplateFixtureOverride,
): P {
  if (fixtureOverride === undefined) return fixture;
  return { ...fixture, ...fixtureOverride };
}

/**
 * 各 entry の sendTest 共通実装。
 *
 * - `mergeRuntime` で fixture を「現在の送信コンテキスト」（recipient / triggered* /
 *   siteName / timestamp）でマージする。デフォルトは fixture そのまま、
 *   `__infra_check` だけ全フィールドを上書きする。
 * - `input.fixtureOverride` は呼び出し側からの追加 override（useRealFooter 等）。
 */
function makeSendTest<P extends EmailTemplateProps>(
  key: TemplateKey,
  label: string,
  component: (props: P) => ReactElement,
  fixture: P,
  mergeRuntime: (fixture: P, input: SendTestInput) => P = (f) => f,
): TemplateEntry<P>["sendTest"] {
  return async (input: SendTestInput): Promise<EmailResult> => {
    const merged = mergeRuntime(fixture, input);
    const withOverride = mergeFixtureOverride(merged, input.fixtureOverride);

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
type TestEmailProps = Parameters<typeof TestEmail>[0];

function mergeInfraCheckRuntime(
  fixture: TestEmailProps,
  input: SendTestInput,
): TestEmailProps {
  return {
    ...fixture,
    recipientLabel: input.to,
    triggeredByName: input.triggeredByName,
    triggeredByEmail: input.triggeredByEmail,
    siteName: input.siteName,
    timestamp: new Date(),
  };
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

function defineEntry<P extends EmailTemplateProps>(
  key: TemplateKey,
  component: (props: P) => ReactElement,
  fixture: P,
  mergeRuntime?: (fixture: P, input: SendTestInput) => P,
): TemplateEntry<P> {
  const meta = metaFor(key);
  return {
    key,
    ...meta,
    component,
    fixture,
    renderPreview: (fixtureOverride) =>
      component(mergeFixtureOverride(fixture, fixtureOverride)),
    sendTest: makeSendTest(key, meta.label, component, fixture, mergeRuntime),
  };
}

/**
 * 24 エントリの SSoT。registry は `satisfies Record<TemplateKey, …>` で全 key 網羅を
 * compile error で enforce する。
 */
export const EMAIL_TEMPLATE_REGISTRY = {
  "reservation-confirmation": defineEntry(
    "reservation-confirmation",
    ReservationConfirmationEmail,
    reservationConfirmationFixture,
  ),
  "reservation-updated": defineEntry(
    "reservation-updated",
    ReservationUpdatedEmail,
    reservationUpdatedFixture,
  ),
  "reservation-cancelled": defineEntry(
    "reservation-cancelled",
    ReservationCancelledEmail,
    reservationCancelledFixture,
  ),
  "reservation-status-changed": defineEntry(
    "reservation-status-changed",
    ReservationStatusChangedEmail,
    reservationStatusChangedFixture,
  ),
  "reservation-reminder": defineEntry(
    "reservation-reminder",
    ReservationReminderEmail,
    reservationReminderFixture,
  ),
  "bulk-reservation-cancelled": defineEntry(
    "bulk-reservation-cancelled",
    BulkReservationCancelledEmail,
    bulkReservationCancelledFixture,
  ),
  "event-registration-confirmation": defineEntry(
    "event-registration-confirmation",
    EventRegistrationConfirmationEmail,
    eventRegistrationConfirmationFixture,
  ),
  "event-registration-cancelled": defineEntry(
    "event-registration-cancelled",
    EventRegistrationCancelledEmail,
    eventRegistrationCancelledFixture,
  ),
  "event-cancelled-notification": defineEntry(
    "event-cancelled-notification",
    EventCancelledNotificationEmail,
    eventCancelledNotificationFixture,
  ),
  "event-updated-notification": defineEntry(
    "event-updated-notification",
    EventUpdatedNotificationEmail,
    eventUpdatedNotificationFixture,
  ),
  "event-reminder": defineEntry(
    "event-reminder",
    EventReminderEmail,
    eventReminderFixture,
  ),
  "event-admin-notification": defineEntry(
    "event-admin-notification",
    EventAdminNotificationEmail,
    eventAdminNotificationFixture,
  ),
  "event-waitlist-registered": defineEntry(
    "event-waitlist-registered",
    EventWaitlistRegisteredEmail,
    eventWaitlistRegisteredFixture,
  ),
  "event-waitlist-offered": defineEntry(
    "event-waitlist-offered",
    EventWaitlistOfferedEmail,
    eventWaitlistOfferedFixture,
  ),
  "event-waitlist-expired": defineEntry(
    "event-waitlist-expired",
    EventWaitlistExpiredEmail,
    eventWaitlistExpiredFixture,
  ),
  "contact-confirmation": defineEntry(
    "contact-confirmation",
    ContactConfirmationEmail,
    contactConfirmationFixture,
  ),
  "inquiry-reply": defineEntry(
    "inquiry-reply",
    InquiryReplyEmail,
    inquiryReplyFixture,
  ),
  "inquiry-status-notification": defineEntry(
    "inquiry-status-notification",
    InquiryStatusNotificationEmail,
    inquiryStatusNotificationFixture,
  ),
  "admin-notification-reservation": defineEntry(
    "admin-notification-reservation",
    AdminNotificationEmail,
    adminNotificationReservationFixture,
  ),
  "admin-notification-inquiry": defineEntry(
    "admin-notification-inquiry",
    AdminNotificationEmail,
    adminNotificationInquiryFixture,
  ),
  welcome: defineEntry("welcome", WelcomeEmail, welcomeFixture),
  "delete-account-verification": defineEntry(
    "delete-account-verification",
    DeleteAccountVerificationEmail,
    deleteAccountVerificationFixture,
  ),
  "review-reply": defineEntry(
    "review-reply",
    ReviewReplyEmail,
    reviewReplyFixture,
  ),
  __infra_check: defineEntry(
    "__infra_check",
    TestEmail,
    testEmailFixture,
    mergeInfraCheckRuntime,
  ),
} as const satisfies Readonly<Record<TemplateKey, RegistryTemplateEntry>>;

export type EmailTemplateRegistryEntry =
  (typeof EMAIL_TEMPLATE_REGISTRY)[TemplateKey];

/** Unknown key で呼ばれた場合は throw。Server Action で先に Zod 検証する想定。 */
export function getTemplate(key: TemplateKey): EmailTemplateRegistryEntry {
  const entry = EMAIL_TEMPLATE_REGISTRY[key];
  if (!entry) {
    throw new Error(`Unknown email template key: ${key}`);
  }
  return entry;
}
