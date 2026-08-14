import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * `"use server"` ファイルの export 制約 gate。
 *
 * Next.js は `"use server"` ファイルの export を **async 関数だけ**に制限する。
 * object / 配列 / Zod schema などを export すると、モジュール評価時に
 * `A "use server" file can only export async functions, found object.` が throw され、
 * **そのファイル内の Server Action が全滅する**。
 *
 * 厄介なのは検出経路が無いこと:
 * - `next build` は通る（実行時エラーのため）
 * - unit テストも通る（当該 export を `mock.module` で差し替えているため）
 * - つまり production build を実際にリクエストで叩くまで顕在化しない
 *
 * 実害: 2026-07-30 の full CI dispatch で `/admin/customers/new` の customer:create が
 * 500。原因は `actions/customer.ts` が `ANONYMIZED_CUSTOMER_FIELDS`（配列）を
 * export していたこと。広域 E2E が数週間起動不能だった間に混入していた。
 *
 * @see https://nextjs.org/docs/messages/invalid-use-server-value
 */

const SRC_ROOT = join(process.cwd(), "src");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

/**
 * Directive Prologue は**コメントを跨いで成立する**（監査 F-14）。
 *
 * 旧実装は `source.trimStart().slice(0, 40)` が `"use server"` で始まることを
 * 要求していた。このリポジトリで一般的な JSDoc（`/**\n * 顧客 Server Actions。\n *​/`）
 * を先頭に足して directive をその下へ移すと、Next.js / SWC は依然として Server
 * Action file として扱うのに、**この gate の母集合から丸ごと落ちる**。
 *
 * その状態で `export const ANONYMIZED_CUSTOMER_FIELDS = [...]`
 * （2026-07-30 に実際に起きた欠陥そのもの）を足すと、gate も `next build` も unit も
 * 緑のまま本番へ出て、**そのファイル内の Server Action が全て 500 になる**
 * （`A "use server" file can only export async functions, found object.`）。
 *
 * 先頭の空白・行コメント・ブロックコメントを飛ばしてから directive を見る。
 */
export function isUseServerFile(source: string): boolean {
  const withoutLeadingTrivia = source.replace(
    /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/u,
    "",
  );
  return (
    withoutLeadingTrivia.startsWith('"use server"') ||
    withoutLeadingTrivia.startsWith("'use server'")
  );
}

/**
 * 許可される export のみを通す。
 * - `export async function f(` — 関数宣言
 * - `export const f = async (` / `= async function` — async 関数式
 * - `export type` / `export interface` — 型は emit されないため実行時 export にならない
 */
const ALLOWED_EXPORT = [
  /^export\s+async\s+function\s/,
  /^export\s+const\s+[A-Za-z0-9_$]+\s*(?::[^=]+)?=\s*async\s*[(<]/,
  /^export\s+const\s+[A-Za-z0-9_$]+\s*(?::[^=]+)?=\s*async\s+function\b/,
  /^export\s+type\s/,
  /^export\s+interface\s/,
];

describe('"use server" export contract', () => {
  const files = collectSourceFiles(SRC_ROOT).filter((file) =>
    isUseServerFile(readFileSync(file, "utf8")),
  );

  test("判定できる形・できない形（fixture）", () => {
    expect(isUseServerFile('"use server";\nexport async function f() {}')).toBe(
      true,
    );
    expect(isUseServerFile("'use server';\n")).toBe(true);

    // 監査 F-14: 先頭 JSDoc の下に directive がある形。Next は Server Action file と
    // して扱うので、gate の母集合にも入らなければならない。
    expect(
      isUseServerFile(
        '/**\n * 顧客 Server Actions。\n */\n\n"use server";\n\nexport async function f() {}',
      ),
    ).toBe(true);
    // 行コメントでも同じ。
    expect(isUseServerFile('// 顧客 Server Actions\n"use server";\n')).toBe(
      true,
    );

    // directive が無いファイルは対象外のまま。
    expect(isUseServerFile('import "server-only";\n')).toBe(false);
    // コメント内の言及だけでは対象にしない。
    expect(
      isUseServerFile('/** "use server" の話 */\nexport const x = 1;'),
    ).toBe(false);
  });
  test("scans a meaningful number of use-server files", () => {
    // 収集が壊れた（走査パス / 判定ロジックの変化）ことを 0 件で見逃さない
    expect(files.length).toBeGreaterThan(50);
  });

  test("every export is an async function", () => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const relative = file
        .slice(process.cwd().length + 1)
        .replaceAll("\\", "/");

      for (const match of source.matchAll(/^export\s.*$/gm)) {
        const statement = match[0];
        if (ALLOWED_EXPORT.some((pattern) => pattern.test(statement))) continue;

        const line = source.slice(0, match.index).split("\n").length;
        violations.push(
          `${relative}:${line}  ${statement.trim().slice(0, 80)}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});
