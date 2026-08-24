/**
 * 期限切れの短命トークン台帳が実 DB から消えることの検査。
 *
 * ## なぜ実 DB でやるのか
 *
 * unit テストは Prisma へ渡す WHERE の**形**しか固定できない。
 * 「`expiresAt < now` が本当に期限切れ行だけを消し、まだ有効な行を巻き込まない」
 * は境界の両側に行を置いて実際に流さないと証明できない。
 *
 * ## 何を固定するか
 *
 * 1. 期限切れの行は消える（**消費済み・未消費の両方**）
 * 2. まだ有効な行は残る
 * 3. 2 テーブル（email 変更 / 顧客統合）の両方に効く
 *
 * ## 背景
 *
 * この 2 テーブルは行が消える経路が「同じ顧客が再リクエストしたとき」と
 * 「退会・匿名化したとき」しか無かった。どちらも起きなければ
 * `new_email` / `guest_email`（VarChar(254) の平文メールアドレス）が
 * 無期限に残る。`@@index([expiresAt])` は張られているのに購読者が 0 だった。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（`bun run test:integration` が docker-compose の
 * test-db 既定値を注入する）。gateway は import 時の `process.env.DATABASE_URL` を
 * 読むため動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/data-retention/commands");

let prisma: PrismaModule["prisma"];
let purgeExpiredPendingCustomerTokens: CommandsModule["purgeExpiredPendingCustomerTokens"];

const NOW = new Date("2027-01-15T00:00:00.000Z");
const EXPIRED = new Date("2027-01-14T23:00:00.000Z");
const STILL_VALID = new Date("2027-01-15T01:00:00.000Z");

describeMaybe("短命トークン台帳の期限切れ purge — 実 Postgres", () => {
  const customerIds: string[] = [];

  async function createCustomer(label: string): Promise<string> {
    const email = `pending-token-${label}-${crypto.randomUUID()}@example.com`;
    const customer = await prisma.customer.create({
      data: {
        email,
        emailCanonical: email.toLowerCase(),
        lastName: "台帳",
        firstName: label,
      },
      select: { id: true },
    });
    customerIds.push(customer.id);
    return customer.id;
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ purgeExpiredPendingCustomerTokens } =
      await import("@/shared/domain/data-retention/commands"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    // トークン台帳は Customer に onDelete: Cascade で紐づく。
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.$disconnect();
  });

  test("期限切れだけを消し、まだ有効な行は残す（消費済みも期限で消える）", async () => {
    const owner = await createCustomer("owner");
    const mergeSource = await createCustomer("source");

    const rows = await prisma.$transaction(async (tx) => {
      const expiredUnconsumed = await tx.pendingCustomerEmailChange.create({
        data: {
          customerId: owner,
          newEmail: "expired-unconsumed@example.com",
          newEmailCanonical: "expired-unconsumed@example.com",
          tokenHash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
          expiresAt: EXPIRED,
        },
        select: { id: true },
      });
      const expiredConsumed = await tx.pendingCustomerEmailChange.create({
        data: {
          customerId: owner,
          newEmail: "expired-consumed@example.com",
          newEmailCanonical: "expired-consumed@example.com",
          tokenHash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
          expiresAt: EXPIRED,
          consumedAt: EXPIRED,
        },
        select: { id: true },
      });
      const stillValid = await tx.pendingCustomerEmailChange.create({
        data: {
          customerId: owner,
          newEmail: "still-valid@example.com",
          newEmailCanonical: "still-valid@example.com",
          tokenHash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
          expiresAt: STILL_VALID,
        },
        select: { id: true },
      });
      const expiredMerge = await tx.pendingCustomerMerge.create({
        data: {
          targetCustomerId: owner,
          sourceCustomerId: mergeSource,
          guestEmail: "expired-merge@example.com",
          tokenHash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
          expiresAt: EXPIRED,
        },
        select: { id: true },
      });
      const validMerge = await tx.pendingCustomerMerge.create({
        data: {
          targetCustomerId: owner,
          sourceCustomerId: mergeSource,
          guestEmail: "valid-merge@example.com",
          tokenHash: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
          expiresAt: STILL_VALID,
        },
        select: { id: true },
      });
      return {
        expiredUnconsumed: expiredUnconsumed.id,
        expiredConsumed: expiredConsumed.id,
        stillValid: stillValid.id,
        expiredMerge: expiredMerge.id,
        validMerge: validMerge.id,
      };
    });

    const purged = await purgeExpiredPendingCustomerTokens(NOW);
    expect(purged).toEqual({ emailChanges: 2, merges: 1 });

    const survivingEmailChanges =
      await prisma.pendingCustomerEmailChange.findMany({
        where: {
          id: {
            in: [rows.expiredUnconsumed, rows.expiredConsumed, rows.stillValid],
          },
        },
        select: { id: true },
      });
    expect(survivingEmailChanges.map(({ id }) => id)).toEqual([
      rows.stillValid,
    ]);

    const survivingMerges = await prisma.pendingCustomerMerge.findMany({
      where: { id: { in: [rows.expiredMerge, rows.validMerge] } },
      select: { id: true },
    });
    expect(survivingMerges.map(({ id }) => id)).toEqual([rows.validMerge]);

    // 2 回目は対象ゼロ（cron は at-least-once）。
    expect(await purgeExpiredPendingCustomerTokens(NOW)).toEqual({
      emailChanges: 0,
      merges: 0,
    });
  });
});
