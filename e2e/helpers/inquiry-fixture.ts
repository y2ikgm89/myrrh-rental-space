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
 * dev customer の「解決済お問い合わせ」fixture を seed 状態へ戻す。
 *
 * 顧客返信は 3 つの副作用を持ち、いずれも seed では戻らない:
 *
 * 1. `InquiryReply`（marker 本文）が append される。seed の `ensureInquiryReply` は
 *    本文一致の存在チェックなので消さない → run のたびに 1 件ずつ増え、spec 自身の
 *    `postedReply`（marker 本文で絞った article）が strict mode violation になる
 * 2. status が RESOLVED → IN_PROGRESS へ reopen される。seed の inquiry 作成は
 *    「無ければ作る」だけで status を書き戻さない → 「解決済」fixture が
 *    IN_PROGRESS のまま固定化する
 * 3. reopen の `InquiryStatusHistory` 行が残る —— **これは戻さない**。
 *    `inquiry_status_history` は append-only で、DB trigger
 *    `prevent_inquiry_status_history_mutation` が UPDATE / DELETE を拒否する
 *    （gate: `__tests__/unit/architecture/inquiry-status-history-append-only.test.ts`）。
 *    そもそも履歴は積み上がるのが正しく、spec も件数を assert しない。
 *    bypass GUC は seed と data-retention purge 専用なので E2E から使わない。
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
  await client.inquiry.update({
    where: { id: inquiry.id },
    data: { status: "RESOLVED" },
  });
}
