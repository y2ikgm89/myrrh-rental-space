/**
 * 保存されているセクション設定が読めないとき、**読めなかったことを潰さない**。
 *
 * ## 何が起きていたか
 *
 * `parseSectionConfig` は検証に失敗した設定を黙って `getDefaultSectionConfig` へ
 * 差し替えて返していた。公開描画はそれでよい（描けないより出す方がよい）が、
 * **編集画面も同じ関数を通っていた**。
 *
 * 管理者が編集画面を開くと初期値が表示され、無関係な 1 項目を直して保存した時点で
 * 本物の設定が既定値で上書きされて復旧不能になる。顧客からは
 * 「昨日まであった案内文が消えた」「トップの画像が変わった」に見える。
 *
 * schema を狭める変更（select の選択肢を 1 つ削る / maxLength を縮める等）を入れた
 * 瞬間に、その値を保存していた既存セクションが全部これに当たる。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（実 DB のセクションを 1 件作って読み直す）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type QueriesModule = typeof import("@/shared/domain/sections/admin-queries");

let prisma: PrismaModule["prisma"];
let getPageSectionQuery: QueriesModule["getPageSectionQuery"];

let pageId: string;
let defaultConfig: Record<string, unknown>;
const createdSectionIds: string[] = [];

/** 登録済みのセクション型。既定値が定義されているものを使う。 */
const SECTION_TYPE = "faq-list";

describeMaybe("セクション設定の読み取り失敗", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getPageSectionQuery } =
      await import("@/shared/domain/sections/admin-queries"));
    const { getDefaultSectionConfig } =
      await import("@/shared/lib/validations/section-defaults");
    const resolved = getDefaultSectionConfig(SECTION_TYPE);
    // 既定値が無い型を選ぶと、以降の「読める設定」が作れず検査が意味を失う。
    expect(resolved).toBeDefined();
    defaultConfig = resolved as Record<string, unknown>;

    const suffix = crypto.randomUUID();
    const page = await prisma.page.create({
      data: {
        slug: `section-config-probe-${suffix}`,
        title: `Section Config Probe ${suffix}`,
        template: "CUSTOM",
      },
      select: { id: true },
    });
    pageId = page.id;
  });

  afterAll(async () => {
    await prisma.section.deleteMany({ where: { pageId } });
    await prisma.page.deleteMany({ where: { id: pageId } });
    await prisma.$disconnect();
  });

  async function createSection(
    type: string,
    config: unknown,
    order: number,
  ): Promise<string> {
    const section = await prisma.section.create({
      data: {
        pageId,
        type,
        // 検証を通らない値も入れたいので、書込側の検証は経由せず直に入れる
        // （過去の書込経路や schema の絞り込みで実際にこの状態が生まれる）。
        config: config as never,
        order,
      },
      select: { id: true },
    });
    createdSectionIds.push(section.id);
    return section.id;
  }

  test("読めない設定は configUnreadable: true で返る（既定値に潰さない）", async () => {
    // 既定値の `title`（rich text の配列）を別の型で上書きする。schema を狭めた /
    // 旧経路が入れた値としてありうる形。
    const id = await createSection(
      SECTION_TYPE,
      { ...defaultConfig, title: 123 },
      1,
    );

    const section = await getPageSectionQuery(id);

    expect(section).not.toBeNull();
    expect(section?.configUnreadable).toBe(true);
    // 描画のために既定値は入っている（公開側は今までどおり出せる）。
    expect(section?.config).toBeDefined();
  });

  test("読める設定は configUnreadable: false（何でも true にしていない）", async () => {
    const id = await createSection(SECTION_TYPE, defaultConfig, 2);
    const section = await getPageSectionQuery(id);

    expect(section?.configUnreadable).toBe(false);
  });
});
