/**
 * 再同意対象者数を実 Postgres で検証する（監査 A-35）。
 *
 * == なぜ要るのか ==
 *
 * 旧実装は「同意済み customerId を全件 JS 配列へ載せて `IN (...)` に組み直す」2 段クエリ。
 * コメントは「`notIn` で除外しないのは同意者数ぶんの id を SQL に載せずに済ませるため」と
 * 宣言しながら、10 行下でまさにそれをやっていた。8 万人が同意済みなら uuid 8 万個で
 * 3MB 超の SQL テキストになり、規約編集ページのレンダリング本体で `statement_timeout`(15s)
 * に触れれば **規約を直す手段そのものが失われる**。
 *
 * 判定を `NOT EXISTS` 1 本へ移したので、意味が同じであることは実 DB で確かめる。
 * unit テストは mock 越しの配線しか見ない（enum の cast も index の有無も分からない）。
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。SQL そのものが検証対象。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type AdminQueriesModule = typeof import("@/shared/domain/terms/admin-queries");

let prisma: PrismaModule["prisma"];
let getReagreeAffectedCustomerCount: AdminQueriesModule["getReagreeAffectedCustomerCount"];

const CONTENT_HTML = "<p>再同意テスト用の規約本文</p>";
const OTHER_HTML = "<p>古い版の本文</p>";

function sha256(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

let termsId: string;
let otherTermsId: string;
const createdCustomerIds: string[] = [];
let baselineAffected = 0;

async function createCustomer(isActive: boolean): Promise<string> {
  const suffix = crypto.randomUUID();
  const row = await prisma.customer.create({
    data: {
      lastName: "再同意",
      firstName: "太郎",
      email: `reagree-${suffix}@example.com`,
      emailCanonical: `reagree-${suffix}@example.com`,
      isActive,
    },
    select: { id: true },
  });
  createdCustomerIds.push(row.id);
  return row.id;
}

async function agree(input: {
  customerId: string;
  termsId: string;
  contentHtml: string;
  scope: "LOGIN_SIGNUP" | "RESERVATION";
}): Promise<void> {
  await prisma.termsAgreement.create({
    data: {
      termsId: input.termsId,
      customerId: input.customerId,
      contentSnapshot: input.contentHtml,
      contentHash: sha256(input.contentHtml),
      scope: input.scope,
    },
  });
}

describeMaybe("再同意対象者数（NOT EXISTS）", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getReagreeAffectedCustomerCount } =
      await import("@/shared/domain/terms/admin-queries"));

    const suffix = crypto.randomUUID();
    // displayOrder は partial unique。永続 test-db の既存行と衝突させない。
    const maxOrder = await prisma.termsDocument.aggregate({
      _max: { displayOrder: true },
    });
    const baseOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const doc = await prisma.termsDocument.create({
      data: {
        slug: `reagree-${suffix}`,
        title: `再同意テスト ${suffix}`,
        type: "GENERAL",
        contentJson: {},
        contentHtml: CONTENT_HTML,
        scopes: ["LOGIN_SIGNUP"],
        displayOrder: baseOrder,
      },
      select: { id: true },
    });
    termsId = doc.id;

    const other = await prisma.termsDocument.create({
      data: {
        slug: `reagree-other-${suffix}`,
        title: `別規約 ${suffix}`,
        type: "GENERAL",
        contentJson: {},
        contentHtml: OTHER_HTML,
        scopes: ["LOGIN_SIGNUP"],
        displayOrder: baseOrder + 1,
      },
      select: { id: true },
    });
    otherTermsId = other.id;

    // 共有 test-db には他テストが作った顧客も居るので、増分で見る。
    baselineAffected = (await getReagreeAffectedCustomerCount(termsId))
      .affected;
  });

  afterAll(async () => {
    // `terms_agreements` は append-only（`prevent_terms_agreements_mutation`）なので
    // DELETE できない。規約側を soft delete して partial unique を解放すれば、
    // 残った同意行は以後の走査対象にならない（顧客も消す）。
    await prisma.termsDocument.updateMany({
      where: { id: { in: [termsId, otherTermsId] } },
      data: { deletedAt: new Date() },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: createdCustomerIds } },
    });
    await prisma.$disconnect();
  });

  test("現行 hash で同意済みの有効顧客だけが対象から外れる", async () => {
    const agreed = await createCustomer(true);
    const notAgreed = await createCustomer(true);
    await agree({
      customerId: agreed,
      termsId,
      contentHtml: CONTENT_HTML,
      scope: "LOGIN_SIGNUP",
    });

    const result = await getReagreeAffectedCustomerCount(termsId);

    expect(result.affected - baselineAffected).toBe(1);
    expect(typeof notAgreed).toBe("string");
  });

  test("旧 hash / 別 scope / 別規約の同意は対象から外さない", async () => {
    const before = (await getReagreeAffectedCustomerCount(termsId)).affected;

    const staleHash = await createCustomer(true);
    await agree({
      customerId: staleHash,
      termsId,
      contentHtml: OTHER_HTML,
      scope: "LOGIN_SIGNUP",
    });

    const otherScope = await createCustomer(true);
    await agree({
      customerId: otherScope,
      termsId,
      contentHtml: CONTENT_HTML,
      scope: "RESERVATION",
    });

    const otherDoc = await createCustomer(true);
    await agree({
      customerId: otherDoc,
      termsId: otherTermsId,
      contentHtml: CONTENT_HTML,
      scope: "LOGIN_SIGNUP",
    });

    const after = (await getReagreeAffectedCustomerCount(termsId)).affected;

    // 3 人とも「未同意」として数に残る。
    expect(after - before).toBe(3);
  });

  test("退会済み顧客は同意の有無にかかわらず数に入らない", async () => {
    const before = (await getReagreeAffectedCustomerCount(termsId)).affected;

    await createCustomer(false);
    const inactiveAgreed = await createCustomer(false);
    await agree({
      customerId: inactiveAgreed,
      termsId,
      contentHtml: CONTENT_HTML,
      scope: "LOGIN_SIGNUP",
    });

    const after = (await getReagreeAffectedCustomerCount(termsId)).affected;

    expect(after - before).toBe(0);
  });

  test("同一顧客が複数回同意していても二重に引かない", async () => {
    const before = (await getReagreeAffectedCustomerCount(termsId)).affected;

    const twice = await createCustomer(true);
    await agree({
      customerId: twice,
      termsId,
      contentHtml: CONTENT_HTML,
      scope: "LOGIN_SIGNUP",
    });
    await agree({
      customerId: twice,
      termsId,
      contentHtml: CONTENT_HTML,
      scope: "LOGIN_SIGNUP",
    });

    const after = (await getReagreeAffectedCustomerCount(termsId)).affected;

    expect(after - before).toBe(0);
  });
});
