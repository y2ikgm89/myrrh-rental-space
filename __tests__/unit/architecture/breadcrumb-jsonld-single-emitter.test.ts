/**
 * **BreadcrumbList を出すのはページ側だけ。表示コンポーネントは出さない。**
 *
 * ## なぜ
 *
 * 監査 A-89: 表示用の `Breadcrumb`（`_shared/components/layouts/breadcrumb.tsx`）自身が
 * `BreadcrumbJsonLd` を発行しており、しかも
 * `items.filter((item) => item.href)` で **href を持たない末端（現在ページ）を落として**いた。
 *
 * ページ側も別途 `BreadcrumbJsonLd` を出しているため、blog / news / spaces の詳細ページには
 * BreadcrumbList が 2 本入り、片方は自分自身で終わらない trail
 * （`ホーム › ブログ` で止まり記事名が出ない）になっていた。
 *
 * Google は 1 ページに複数 trail を出すこと自体は許容するので rich result が消える話ではないが、
 * **「そのページを説明する trail が、そのページで終わっていない」**のは端的に誤り。
 *
 * ## 何を見るか
 *
 * 1. 表示コンポーネントが `BreadcrumbJsonLd` を import も描画もしないこと
 * 2. `ArticleLayout` / `Breadcrumb` を使う公開詳細ページが、自前で BreadcrumbList を
 *    1 本持ち、その **trail が「ホーム」で始まる**こと
 *
 * trail の末端がページ自身であることは静的には確かめきれない（変数名を追うだけになる）。
 * ここは「発行元が 1 箇所」と「ホーム始まり」までを見る粗い検査で、
 * 末端の正しさは e2e の JSON-LD 本数契約に任せる。
 *
 * ## 直し方
 *
 * パンくずを出す新しい公開詳細ページを足したら、そのページで `BreadcrumbJsonLd` を
 * `ホーム → 一覧 → 自分自身` の 3 段で出す。表示コンポーネントに戻さない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { stripComments } from "../../helpers/architecture-fs";

/**
 * コメントを落としてから返す。落とさないと、この gate が防ごうとしている
 * 形を説明した JSDoc 自体に引っかかる（実測で踏んだ）。
 */
function readSource(relative: string): string {
  return stripComments(
    readFileSync(join(process.cwd(), ...relative.split("/")), "utf8"),
  );
}

const BREADCRUMB_COMPONENT =
  "src/app/(public)/_shared/components/layouts/breadcrumb.tsx";

/** `Breadcrumb`（表示コンポーネント）経由でパンくずを出す公開詳細ページ。 */
const DETAIL_PAGES = [
  "src/app/(public)/blog/_components/post-detail-page-content.tsx",
  "src/app/(public)/news/_components/news-detail-page-content.tsx",
  "src/app/(public)/events/[slug]/page.tsx",
  "src/app/(public)/spaces/[slug]/page.tsx",
];

describe("BreadcrumbList の発行元はページ側だけ（A-89）", () => {
  test("表示コンポーネントは構造化データを出さない", () => {
    const source = readSource(BREADCRUMB_COMPONENT);

    expect({
      imports: source.includes("BreadcrumbJsonLd"),
      // 末端を落とす filter も一緒に消える（戻すとここが再び真になる）
      dropsLeaf: source.includes("items.filter((item) => item.href)"),
    }).toEqual({ imports: false, dropsLeaf: false });
  });

  test("各詳細ページが自前で 1 本だけ出し、ホームから始まる", () => {
    // 走査規模の下限。配列が空になったら以下は全部素通りする。
    expect(DETAIL_PAGES.length).toBeGreaterThan(3);

    const problems = DETAIL_PAGES.flatMap((relative) => {
      const source = readSource(relative);
      const emissions = [...source.matchAll(/<BreadcrumbJsonLd\b/gu)].length;
      const startsAtHome =
        /<BreadcrumbJsonLd[\s\S]{0,120}?name:\s*"ホーム"/u.test(source);

      const found: string[] = [];
      if (emissions !== 1)
        found.push(`${relative}: emissions=${String(emissions)}`);
      if (!startsAtHome) found.push(`${relative}: ホーム で始まっていない`);
      return found;
    });

    expect(problems).toEqual([]);
  });

  test("判定が差分を検出する（見本）", () => {
    // 落ちるべき形: 表示コンポーネントが JSON-LD を出す
    const emitting = `import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
export function Breadcrumb() {
  return <BreadcrumbJsonLd items={items.filter((item) => item.href)} />;
}`;
    expect(emitting.includes("BreadcrumbJsonLd")).toBe(true);
    expect(emitting.includes("items.filter((item) => item.href)")).toBe(true);

    // 落ちてはいけない形: 表示だけ
    const presentational = `export function Breadcrumb() {
  return <nav aria-label="パンくずリスト" />;
}`;
    expect(presentational.includes("BreadcrumbJsonLd")).toBe(false);

    // ホーム始まりの判定
    const withHome = `<BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },`;
    expect(
      /<BreadcrumbJsonLd[\s\S]{0,120}?name:\s*"ホーム"/u.test(withHome),
    ).toBe(true);

    const withoutHome = `<BreadcrumbJsonLd
        items={[
          { name: "ブログ", url: \`\${baseUrl}/blog\` },`;
    expect(
      /<BreadcrumbJsonLd[\s\S]{0,120}?name:\s*"ホーム"/u.test(withoutHome),
    ).toBe(false);
  });
});
