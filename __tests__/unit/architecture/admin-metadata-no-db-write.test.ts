/**
 * 管理ダッシュボードの `generateMetadata` は DB へ書かない。
 *
 * ## なぜ
 *
 * `pages/[slug]/edit/page.tsx` の `generateMetadata` が
 * `ensureSystemPageCommand(slug)` を呼んでいた（監査 A-55）。
 *
 * - `generateMetadata` は**認可を一切通らない**。page 本体は
 *   `requirePageEditPage()` を通るが、metadata は別に評価される。
 *   結果、`SYSTEM_PAGES` に slug を足した直後は、閲覧専用ロールが URL を
 *   開くだけで `isPublished: true` の公開ページが作られた。
 * - `generateMetadata` と page 本体は**並行に走る**。両方が
 *   `findUnique` → `create` するので、初回アクセスで slug の unique 制約により
 *   P2002 が起きうる。
 *
 * `_shared/lib/admin-action.ts` が「認証 → 解決 → 認可 → 実行」を不変条件として
 * 明文化しているのに、page 層の metadata だけがその外側にいた。
 *
 * ## 何を見るか
 *
 * `(dashboard)/**` の `page.tsx` / `layout.tsx` について、
 * `@/shared/domain/**\/*commands` から import した名前が
 * `generateMetadata` の本体で呼ばれていないこと。
 *
 * 「書き込みかどうか」を関数名から推測するのではなく、**import 元のモジュールが
 * commands かどうか**で見る。この repo は queries / commands をモジュールで
 * 分けているので、これが一番誤判定の少ない切り口。
 *
 * 粗さの申告: page 本体での書き込みは見ていない（本体は認可 guard を通るので
 * 別の gate = `admin-page-auth-before-suspense.test.ts` の担当）。
 * また `@/admin/actions/**`（Server Action）は button の onClick に bind して
 * 渡すのが正しい使い方なので対象外。
 *
 * ## 直し方
 *
 * `generateMetadata` から書き込みを外す。表示に必要な値が DB に無いなら、
 * 定数（`SYSTEM_PAGES` 等）から引くか、フォールバック文言を出す。
 * 行の作成は page 本体（認可後）か起動時の bootstrap が行う。
 */

import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import {
  collectSourceFiles,
  stripComments,
} from "../../helpers/architecture-fs";

const DASHBOARD_ROOT = "src/app/(admin)/admin/(dashboard)";

/** `@/shared/domain/**\/*commands` から import した名前。 */
function commandImportNames(source: string): string[] {
  const names: string[] = [];
  const importRe =
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"(@\/shared\/domain\/[^"]*commands)"/gu;

  for (const match of source.matchAll(importRe)) {
    for (const raw of (match[1] ?? "").split(",")) {
      const name = raw
        .trim()
        .split(/\s+as\s+/u)
        .pop()
        ?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

/**
 * `generateMetadata` の本体を切り出す。
 *
 * 行頭 `}` では**多行シグネチャの `}: PageProps)` で止まる**ので、
 * 次の top-level 宣言までを本体として取る。
 */
function generateMetadataBody(source: string): string | null {
  const start = source.indexOf("export async function generateMetadata(");
  if (start < 0) return null;

  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

function callsName(body: string, name: string): boolean {
  return new RegExp(String.raw`\b${name}\s*[<(]`, "u").test(body);
}

describe("admin の generateMetadata は DB へ書かない（A-55）", () => {
  const files = collectSourceFiles(DASHBOARD_ROOT)
    .filter((path) => path.endsWith("page.tsx") || path.endsWith("layout.tsx"))
    .map((path) => ({
      path: path.replaceAll("\\", "/"),
      source: stripComments(readFileSync(path, "utf8")),
    }));

  test("走査対象が十分にある", () => {
    expect(files.length).toBeGreaterThan(60);
    expect(
      files.filter((file) => generateMetadataBody(file.source) !== null).length,
    ).toBeGreaterThan(20);
  });

  test("generateMetadata が commands を呼んでいない", () => {
    const violations = files.flatMap((file) => {
      const body = generateMetadataBody(file.source);
      if (!body) return [];

      return commandImportNames(file.source)
        .filter((name) => callsName(body, name))
        .map(
          (name) => `${file.path}: generateMetadata が ${name} を呼んでいる`,
        );
    });

    expect(violations).toEqual([]);
  });

  test("判定が差分を検出する（見本）", () => {
    const offending = `import { ensureSystemPageCommand } from "@/shared/domain/pages/commands";
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  await ensureSystemPageCommand(slug);
  return { title: "x" };
}
export default async function Page() {}`;
    const names = commandImportNames(offending);
    expect(names).toEqual(["ensureSystemPageCommand"]);
    expect(
      callsName(generateMetadataBody(offending) ?? "", names[0] ?? ""),
    ).toBe(true);

    // 落ちてはいけない形: 呼ぶのは本体だけ（認可の後ろ）
    const allowed = `import { ensureSystemPageCommand } from "@/shared/domain/pages/commands";
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}
export default async function Page({ params }: PageProps) {
  await requirePageEditPage();
  await ensureSystemPageCommand((await params).slug);
}`;
    expect(
      callsName(generateMetadataBody(allowed) ?? "", "ensureSystemPageCommand"),
    ).toBe(false);

    // queries からの import は対象外
    expect(
      commandImportNames(
        `import { getPageWithSections } from "@/admin/queries/page-section";`,
      ),
    ).toEqual([]);
  });
});
