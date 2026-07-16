/**
 * event-registration-confirmation.tsx の「オンライン参加 URL」section テスト（Phase B.1 task 16）
 *
 * isEventVirtualAccessible(event) が true（ONLINE/HYBRID）のときだけ URL section を
 * 表示し、meetingUrl が null（GOOGLE_MEET write-back 未反映）の場合は「準備中」文言に
 * フォールバックする。OFFLINE では section 自体を出さない。
 */
import { describe, test, expect } from "bun:test";
import { render } from "@react-email/render";
import { EventRegistrationConfirmationEmail } from "@/shared/emails/event-registration-confirmation";
import {
  eventRegistrationConfirmationFixture,
  eventRegistrationConfirmationOnlineFixture,
} from "@/shared/emails/event-registration-confirmation.fixture";

describe("EventRegistrationConfirmationEmail のオンライン参加 URL section (Phase B.1)", () => {
  test("ONLINE + meetingUrl 指定 → URL section を表示する", async () => {
    const text = await render(
      EventRegistrationConfirmationEmail(
        eventRegistrationConfirmationOnlineFixture,
      ),
      { plainText: true },
    );

    expect(text).toContain("オンライン参加 URL");
    expect(text).toContain("https://meet.google.com/example");
  });

  test("OFFLINE → URL section を表示しない", async () => {
    const text = await render(
      EventRegistrationConfirmationEmail(eventRegistrationConfirmationFixture),
      { plainText: true },
    );

    expect(text).not.toContain("オンライン参加 URL");
  });

  test("HYBRID + meetingUrl → URL section を物理会場情報と併記する", async () => {
    const text = await render(
      EventRegistrationConfirmationEmail({
        ...eventRegistrationConfirmationFixture,
        format: "HYBRID",
        meetingUrl: "https://meet.google.com/hybrid-example",
      }),
      { plainText: true },
    );

    expect(text).toContain("会場:");
    expect(text).toContain(eventRegistrationConfirmationFixture.location);
    expect(text).toContain("オンライン参加 URL");
    expect(text).toContain("https://meet.google.com/hybrid-example");
  });

  test("ONLINE + meetingUrl null（GOOGLE_MEET write-back 未反映）→ 準備中メッセージを表示する", async () => {
    const text = await render(
      EventRegistrationConfirmationEmail({
        ...eventRegistrationConfirmationFixture,
        format: "ONLINE",
        meetingUrl: null,
      }),
      { plainText: true },
    );

    expect(text).toContain("オンライン参加 URL");
    expect(text).toContain("URL は開催が近づき次第、別途お知らせします");
  });
});
