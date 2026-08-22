/**
 * 新規 DB を立ち上げるのに必要な初期データは **seed が持つ**。migration SQL に置かない。
 *
 * ## 何が起きたか
 *
 * 8 本の規約（利用規約・プライバシーポリシー・特商法表記ほか）は
 * `prisma/migrations/00000000000000_init/migration.sql` の `INSERT` が SSoT で、
 * `prisma/seed.ts` は「規約は baseline Data Migration で投入済」として一切触らなかった。
 * `EventCategory` の「未分類」も別 migration の `INSERT` 頼みだった。
 *
 * migration 履歴を 1 本の baseline へ畳むとその `INSERT` ごと消える。**DDL は完全なので
 * 適用も起動も成功し**、同意ゲートの必須規約が空集合になっていることに誰かが気付くまで
 * 誰も分からない。イベントは `Event.categoryId` が必須なので 1 件も作れなくなる。
 *
 * ## このゲートが見るもの
 *
 * 「seed が投入する」ことを構造として固定する。データそのものの正しさ（文面が消えて
 * いないか）は実 DB を使う統合テストの領分で、ここでは扱わない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { SEED_TERMS_DOCUMENTS } from "../../../prisma/seed-terms-documents";
import { deriveLexicalContentHtmlFromJsonCore } from "@/admin/components/editor/lexical/preview/derive-lexical-content-html-core";

const SEED_SOURCE = readFileSync(
  join(process.cwd(), "prisma", "seed.ts"),
  "utf8",
);

/** 公開 4 経路の同意ゲートが参照する規約。欠けると同意を求められなくなる。 */
const REQUIRED_SLUGS = [
  "terms-of-use",
  "privacy-policy",
  "cancellation-policy",
  "commercial-transaction",
  "payment-terms",
  "rental-terms",
  "review-guidelines",
  "cookie-policy",
];

/** `async function seedProduction` の本体を切り出す。 */
function productionSeedBody(): string {
  const start = SEED_SOURCE.indexOf("async function seedProduction(");
  expect(start).toBeGreaterThan(-1);
  const rest = SEED_SOURCE.slice(start);
  const end = rest.search(/\n\}/u);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("本番データは seed が持つ", () => {
  test("規約 8 本が seed データに揃っている", () => {
    expect(SEED_TERMS_DOCUMENTS.map((d) => d.slug).sort()).toEqual(
      [...REQUIRED_SLUGS].sort(),
    );
  });

  test("各規約が本文を持ち、contentJson が JSON として妥当", () => {
    for (const doc of SEED_TERMS_DOCUMENTS) {
      expect(doc.contentHtml.length).toBeGreaterThan(500);
      expect(doc.title.trim().length).toBeGreaterThan(0);
      // 壊れた JSON を投入すると parsePrismaInputJson が seed 実行時に throw し、
      // `main().catch` の process.exit(1) で以降の phase が丸ごと走らなくなる。
      expect(() => JSON.parse(doc.contentJson)).not.toThrow();
    }
  });

  /**
   * contentJson が本物の Lexical 構造であること（監査 A-11）。
   *
   * 管理画面は contentJson を正本として扱い、保存時に contentHtml を
   * そこから作り直す（`actions/terms/index.ts` の `toTermsFormInput`）。
   * 以前は 8 件すべての contentJson が「1 段落・1 テキストノード」に潰れており
   * （root.children.length === 1、node 種別は paragraph/text のみ）、
   * contentHtml 側にある見出し 21・表 1・箇条書き 83 といった構造が JSON には
   * 一切無かった。運用者が事業者名を直して 1 回保存するだけで、公開中の規約本文が
   * 壁のような 1 段落に置き換わる（元の HTML はどこにも残らない）。
   *
   * `JSON.parse が通る` だけでは区別できないので、構造そのものを見る。
   */
  test("contentJson が 1 段落に潰れていない（Lexical 構造を保っている）", () => {
    for (const doc of SEED_TERMS_DOCUMENTS) {
      const parsed: unknown = JSON.parse(doc.contentJson);
      const children =
        (parsed as { root?: { children?: unknown[] } }).root?.children ?? [];

      expect({
        slug: doc.slug,
        rootChildren: children.length > 1,
      }).toEqual({ slug: doc.slug, rootChildren: true });
    }
  });

  /**
   * contentJson と contentHtml が同じ文書を表していること（監査 A-11）。
   *
   * 保存経路と同じ `deriveLexicalContentHtmlFromJsonCore` を通すので、
   * ここが一致していれば「管理画面で開いて保存しただけで本文が変わる」ことは無い。
   */
  test("contentHtml は contentJson から派生した値と一致する", () => {
    const mismatched = SEED_TERMS_DOCUMENTS.filter(
      (doc) =>
        deriveLexicalContentHtmlFromJsonCore(doc.contentJson) !==
        doc.contentHtml,
    ).map((doc) => doc.slug);

    expect(mismatched).toEqual([]);
  });

  test("同意を要求する 4 経路がいずれかの規約で覆われている", () => {
    const covered = new Set<string>(
      SEED_TERMS_DOCUMENTS.flatMap((d) => d.scopes.map((s) => String(s))),
    );
    for (const scope of [
      "LOGIN_SIGNUP",
      "RESERVATION",
      "INQUIRY",
      "EVENT_REGISTRATION",
    ]) {
      expect([...covered]).toContain(scope);
    }
  });

  test("displayOrder をデータに書かない（partial unique を literal で占有しない）", () => {
    // `terms_documents_display_order_active_key` に参加する列なので、リテラルを書くと
    // 管理画面での並び替え・追加がその値を占有した瞬間に re-seed が P2002 で落ちる。
    const source = readFileSync(
      join(process.cwd(), "prisma", "seed-terms-documents.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/^\s+displayOrder:/mu);
  });

  test("seedProduction が規約とイベントカテゴリーを投入する", () => {
    const body = productionSeedBody();
    expect(body).toContain("seedTermsDocuments(");
    // 「未分類」が無いと Event.categoryId（必須）を埋められずイベントを作れない。
    expect(body).toContain("seedEventCategories(");
  });

  test("seed が「規約は migration が投入する」前提のコメントを残していない", () => {
    // 移管前の記述が残ると、次に触る人が seed を信用しない。
    expect(SEED_SOURCE).not.toContain(
      "規約は baseline Data Migration で投入済",
    );
    expect(SEED_SOURCE).not.toContain("seed.ts は規約を一切扱わない");
  });

  test("イベントカテゴリーの seed が migration の INSERT に依存していない", () => {
    expect(SEED_SOURCE).not.toContain(
      "migration が投入する「未分類」が占有するため",
    );
  });
});
