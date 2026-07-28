import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SpaceCard（`(public)/_components/space-list/space-card.tsx`）の
 * 空き時間帯バッジに関する drift gate。
 *
 * SpaceCard は DB 依存（`getPublicTaxSettings`）+ `await connection()` を持つ
 * async Server Component のため、RTL でのフルレンダーは重い mock を要する。
 * 既存の house pattern（`receipt-detail-page.test.ts` 等）に倣い、
 * source-text ベースで「文言」「表示条件」「accessible name」の
 * 3 invariants を pin する。
 */
describe("SpaceCard availability badge (spaces-availability-sort follow-up)", () => {
  const sourcePath = join(
    process.cwd(),
    "src/app/(public)/_components/space-list/space-card.tsx",
  );
  const source = readFileSync(sourcePath, "utf8");

  test("空きなしバッジの文言は「指定の日時は空きがありません」で固定する", () => {
    expect(source).toContain(
      '<Badge variant="warning">指定の日時は空きがありません</Badge>',
    );
  });

  test("バッジは isAvailableForSearch === false のときのみレンダーする（true/undefined では出さない）", () => {
    const badgeGate =
      /isAvailableForSearch === false \? \(\s*<Badge variant="warning">指定の日時は空きがありません<\/Badge>\s*\) : null/;
    expect(source).toMatch(badgeGate);
  });

  test("horizontal layout の Link は isAvailableForSearch === false のとき accessible name にバッジの警告を明示する（見た目上の連結テキストに丸投げしない）", () => {
    const linkAriaLabel =
      /<Link\s+href=\{toAppRoute\(`\/spaces\/\$\{slug\}`\)\}\s+aria-label=\{\s*isAvailableForSearch === false\s*\?\s*`\$\{name\}（指定の日時は空きがありません）`\s*:\s*name\s*\}/;
    expect(source).toMatch(linkAriaLabel);
  });

  test("grid layout（デフォルト）は isAvailableForSearch を参照しない（バッジは /spaces 一覧の horizontal layout 専用）", () => {
    // horizontal 分岐の return ブロックが終わった後、grid layout の return が
    // 始まる直前の目印として "{/* Image area */}" コメントを使う（grid 専用）。
    const gridLayoutStart = source.indexOf("{/* Image area */}");
    expect(gridLayoutStart).toBeGreaterThan(-1);
    const gridLayoutSource = source.slice(gridLayoutStart);
    expect(gridLayoutSource).not.toContain("isAvailableForSearch");
  });
});
