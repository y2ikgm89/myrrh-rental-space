/**
 * お問い合わせスレッドのグローバル可変状態を seed 直後の形へ戻す helper。
 *
 * 復元は **必ず `afterEach` / `afterAll` から呼ぶ**
 * （規約: `.claude/rules/testing-e2e.md`）。
 *
 * @module e2e/helpers/inquiry-fixture
 */

import { inquiryFixtures } from "../fixtures";
import { getE2EPrismaClient } from "./e2e-prisma";

/**
 * `replyToInquiryAsCustomerCommand` が RESOLVED / FLAGGED を IN_PROGRESS へ
 * reopen するときに残す `InquiryStatusHistory.reason`。seed はこの履歴行を
 * 作らない（`prisma/seed.ts` に `inquiryStatusHistory` の書込は無い）ため、
 * 存在するものは E2E が作ったものだけ。
 */
const CUSTOMER_REPLY_REOPEN_REASON = "customer-reply-reopen";

/**
 * dev customer の「解決済お問い合わせ」fixture を seed 状態へ戻す。
 *
 * 顧客返信は 3 つの副作用を持ち、いずれも seed では戻らない:
 *
 * 1. `InquiryReply`（marker 本文）が append される。seed の `ensureInquiryReply` は
 *    本文一致の存在チェックなので消さない → run のたびに 1 件ずつ増え、spec 自身の
 *    `getByText(replyBody)` が strict mode violation になる
 * 2. status が RESOLVED → IN_PROGRESS へ reopen される。seed の inquiry 作成は
 *    「無ければ作る」だけで status を書き戻さない → 「解決済」fixture が
 *    IN_PROGRESS のまま固定化する
 * 3. reopen の `InquiryStatusHistory` 行が残る
 */
export async function restoreDevCustomerResolvedInquiry(): Promise<void> {
  const client = getE2EPrismaClient();
  const inquiry = await client.inquiry.findFirst({
    where: { subject: inquiryFixtures.devCustomerResolvedSubject },
    select: { id: true },
  });
  if (!inquiry) {
    throw new Error(
      `Seed contract broken: inquiry "${inquiryFixtures.devCustomerResolvedSubject}" not found.`,
    );
  }

  await client.inquiryReply.deleteMany({
    where: {
      inquiryId: inquiry.id,
      body: inquiryFixtures.e2eCustomerReplyMarker,
    },
  });
  await client.inquiryStatusHistory.deleteMany({
    where: { inquiryId: inquiry.id, reason: CUSTOMER_REPLY_REOPEN_REASON },
  });
  await client.inquiry.update({
    where: { id: inquiry.id },
    data: { status: "RESOLVED" },
  });
}
