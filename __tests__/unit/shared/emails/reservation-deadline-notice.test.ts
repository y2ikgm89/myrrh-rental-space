/**
 * reservation-confirmation / reservation-updated の
 * 「キャンセル・変更期限」案内文レンダリングテスト
 *
 * バグ: 予約確認・変更メールの案内文は「ご予約のキャンセル・変更は…時間前まで」と
 * 単一の cancellationDeadlineHours だけで両方の期限を代弁していたが、
 * キャンセル期限と変更期限は admin 設定で独立に変更できるため、値が異なる場合
 * 変更期限の案内が実際の設定と乖離していた。
 * modificationDeadlineHours を追加し、両者が異なる場合は文言を分離する。
 */
import { describe, test, expect } from "bun:test";
import { render } from "@react-email/render";
import { ReservationConfirmationEmail } from "@/shared/emails/reservation-confirmation";
import { reservationConfirmationFixture } from "@/shared/emails/reservation-confirmation.fixture";
import { ReservationUpdatedEmail } from "@/shared/emails/reservation-updated";
import { reservationUpdatedFixture } from "@/shared/emails/reservation-updated.fixture";

describe("ReservationConfirmationEmail の期限案内文", () => {
  test("キャンセル期限と変更期限が同じ場合は統合文言（キャンセル・変更は同一時間前まで）", async () => {
    const text = await render(
      ReservationConfirmationEmail({
        ...reservationConfirmationFixture,
        cancellationDeadlineHours: 24,
        modificationDeadlineHours: 24,
      }),
      { plainText: true },
    );

    expect(text).toContain("ご予約のキャンセル・変更は");
    expect(text).not.toContain("変更は 6 時間前まで");
  });

  test("キャンセル期限と変更期限が異なる場合は文言を分離し、両方の実値を表示する", async () => {
    const text = await render(
      ReservationConfirmationEmail({
        ...reservationConfirmationFixture,
        cancellationDeadlineHours: 24,
        modificationDeadlineHours: 6,
      }),
      { plainText: true },
    );

    expect(text).not.toContain("ご予約のキャンセル・変更は");
    expect(text).toContain("ご予約のキャンセルは");
    expect(text).toContain("24 時間前まで");
    expect(text).toContain("変更は");
    expect(text).toContain("6 時間前まで");
  });
});

describe("ReservationUpdatedEmail の期限案内文", () => {
  test("キャンセル期限と変更期限が同じ場合は統合文言（キャンセル・変更は同一時間前まで）", async () => {
    const text = await render(
      ReservationUpdatedEmail({
        ...reservationUpdatedFixture,
        cancellationDeadlineHours: 24,
        modificationDeadlineHours: 24,
      }),
      { plainText: true },
    );

    expect(text).toContain("ご予約のキャンセル・変更は");
    expect(text).not.toContain("変更は 6 時間前まで");
  });

  test("キャンセル期限と変更期限が異なる場合は文言を分離し、両方の実値を表示する", async () => {
    const text = await render(
      ReservationUpdatedEmail({
        ...reservationUpdatedFixture,
        cancellationDeadlineHours: 24,
        modificationDeadlineHours: 6,
      }),
      { plainText: true },
    );

    expect(text).not.toContain("ご予約のキャンセル・変更は");
    expect(text).toContain("ご予約のキャンセルは");
    expect(text).toContain("24 時間前まで");
    expect(text).toContain("変更は");
    expect(text).toContain("6 時間前まで");
  });
});
