/**
 * レビュー返信メールの memberReservationUrl 出し分けテスト
 *
 * sendReviewReplyEmail() は customerUserId（レビュー投稿者 Customer の User.id）が
 * あるときだけ「マイページで予約を確認する」リンクを含める。レビューはマイページ
 * 経由（要ログイン）でのみ投稿できるため通常は必ず userId があるが、投稿後に
 * User アカウントが削除された場合（onDelete: SetNull）は null になり得るため、
 * customerId の有無ではなく customerUserId を直接見る必要がある。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
mock.module("@/shared/lib/email/send", () => ({ sendEmail: mockSendEmail }));

mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: () =>
    Promise.resolve({
      businessName: "Org",
      address: "",
      phoneNumber: null,
      contactEmail: null,
      siteName: "Org",
      siteUrl: "https://example.com",
      legalLinks: [],
    }),
}));

type MemberUrlProps = { memberReservationUrl?: string };
const mockReviewReplyEmail = mock((props: MemberUrlProps) => props);
mock.module("@/shared/emails/review-reply", () => ({
  ReviewReplyEmail: mockReviewReplyEmail,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendReviewReplyEmail } from "@/shared/lib/email/review-emails";
import type { ReviewReplyEmailData } from "@/shared/lib/email/types";

const DATA: ReviewReplyEmailData = {
  reviewId: "review-abc123",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  rating: 5,
  originalTitle: "良かったです",
  originalComment: "また利用します",
  replyBody: "ありがとうございます",
  reservationId: "reservation-abc123",
  customerUserId: null,
};

const MEMBER_URL_PATTERN = /\/mypage\/reservations\/reservation-abc123$/;

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockReviewReplyEmail.mockClear();
});

describe("sendReviewReplyEmail() の memberReservationUrl 出し分け", () => {
  test("customerUserId ありなら memberReservationUrl を発行する", async () => {
    await sendReviewReplyEmail({ ...DATA, customerUserId: "user-1" });

    const props = mockReviewReplyEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberReservationUrl).toMatch(MEMBER_URL_PATTERN);
  });

  test("customerUserId が null（アカウント削除後含む）なら memberReservationUrl を発行しない", async () => {
    await sendReviewReplyEmail({ ...DATA, customerUserId: null });

    const props = mockReviewReplyEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberReservationUrl).toBeUndefined();
  });
});
