import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * dev customer を引くときに**会員行とゲスト行を取り違えない**ことの gate。
 *
 * ## なぜ曖昧になるか
 *
 * `seedDevCustomerAndReservations` は同じ email で **2 行**作る:
 *
 * | 行             | 判別子                            | 用途                      |
 * | -------------- | --------------------------------- | ------------------------- |
 * | 会員           | `userId` あり（`@unique`）        | ログイン後のマイページ    |
 * | ゲスト（履歴） | `userId: null, anonymizedAt:null` | customer merge fixture    |
 *
 * `Customer.emailCanonical` に unique は無い（`@@index` のみ）ので、email だけの
 * `findFirst` は **どちらが返るか保証が無い**。Postgres の返却順は heap の物理順や
 * index の tie-break に依存し、行が更新されるたびに変わりうる。
 *
 * ## 実害
 *
 * ゲスト行が返るとイベント申込がそちらに紐づく。`/mypage/events` は
 * `getCustomerByUserId(user.id)` で会員行を解決する（`userId` が `@unique`）ため、
 * その申込は**画面に出てこない**。`calendar-download.spec.ts` はそれを hard-assert
 * しているので、原因の分かりにくい形で落ちる。
 *
 * ## 不変条件
 *
 * `prisma/seed.ts` と `scripts/e2e/**` / `e2e/helpers/**` で dev customer を引く
 * すべての箇所が、`userId` の述語を持つ（会員なら `not: null`、ゲストなら `null`）。
 * seed は共有ヘルパー `findDevMemberCustomer` を通す。
 */

const root = process.cwd();
const SEED = join(root, "prisma/seed.ts");
const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** `scripts/e2e/*.ts` と `e2e/helpers/*.ts`。 */
function listFixtureSources(): string[] {
  return [
    ...readdirSync(join(root, "scripts/e2e"))
      .filter((n) => n.endsWith(".ts"))
      .map((n) => `scripts/e2e/${n}`),
    ...readdirSync(join(root, "e2e/helpers"))
      .filter((n) => n.endsWith(".ts"))
      .map((n) => `e2e/helpers/${n}`),
  ].sort();
}

/** dev customer を `customer.findFirst` / `findFirstOrThrow` で引いている箇所。 */
function devCustomerLookups(source: string): string[] {
  return [
    ...source.matchAll(
      /customer\.findFirst(?:OrThrow)?\(\{[\s\S]{0,400}?\n\s*\}\)/gu,
    ),
  ]
    .map((m) => m[0])
    .filter(
      (block) =>
        block.includes("DEV_CUSTOMER_EMAIL") ||
        block.includes(DEV_CUSTOMER_EMAIL),
    );
}

describe("dev customer の会員行とゲスト行を取り違えない", () => {
  test("gate が空振りしていない", () => {
    const fixtureHits = listFixtureSources().filter(
      (file) => devCustomerLookups(read(file)).length > 0,
    );
    // fixture 側に実例がある状態を前提にしている（0 件なら marker が腐っている）。
    expect(fixtureHits.length).toBeGreaterThan(0);
  });

  test("fixture の dev customer lookup は userId で会員行に絞る", () => {
    const violations = listFixtureSources().flatMap((file) =>
      devCustomerLookups(read(file))
        .filter((block) => !/userId:/u.test(block))
        .map(
          (block) =>
            `${file}: dev customer を userId の述語なしで引いている（${block.slice(0, 80).replace(/\s+/gu, " ")}…）。会員行とゲスト行のどちらが返るか保証が無い`,
        ),
    );

    expect(violations).toEqual([]);
  });

  test("seed は共有ヘルパー経由で会員行を引く", () => {
    const source = read(SEED);

    expect(source).toContain("async function findDevMemberCustomer");
    // ヘルパー自身が会員行の述語を持つこと。
    const helper = /async function findDevMemberCustomer[\s\S]*?\n\}/u.exec(
      source,
    );
    if (!helper) throw new Error("findDevMemberCustomer が見つかりません");
    expect(helper[0]).toContain("userId: { not: null }");
    expect(helper[0]).toContain("emailCanonical");
  });

  test("seed に userId 述語を持たない dev customer lookup が残っていない", () => {
    const violations = devCustomerLookups(read(SEED))
      .filter((block) => !/userId:/u.test(block))
      .map(
        (block) =>
          `prisma/seed.ts: ${block.slice(0, 100).replace(/\s+/gu, " ")}… — findDevMemberCustomer を使うこと`,
      );

    expect(violations).toEqual([]);
  });

  test("seed に email 直書きの dev customer lookup が無い", () => {
    // 直書きだと定数を変えたときに片方だけ残る。
    const source = read(SEED);
    const literalUses = [
      ...source.matchAll(new RegExp(`"${DEV_CUSTOMER_EMAIL}"`, "gu")),
    ].length;
    // 定数宣言の 1 箇所だけが正しい。
    expect(literalUses).toBe(1);
  });
});
