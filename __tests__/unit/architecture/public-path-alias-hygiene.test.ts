/**
 * `src/app/(public)/_shared` を指す import は `@/public/*` alias を使う。
 *
 * ## 何が抜けていたか
 *
 * 前身は `@/app/(public)/_shared/` という**別 alias 形の 1 通りだけ**を正規表現で
 * 禁じており、**相対 import を一切見ていなかった**。テスト名は
 * 「`_shared` import は `@/public` alias を使う」と主張していたのに、
 * alias を外す最も自然な書き方（`../../_shared/...`）が素通りしていた。
 * 実測: `spaces/[slug]/page.tsx` の 4 行がその形で残っていた。
 *
 * ## 文字列一致ではなくパスを解決する
 *
 * `(public)` の下には `_shared` という名前のディレクトリが **3 つ**ある:
 *
 * | ディレクトリ | alias |
 * | --- | --- |
 * | `(public)/_shared` | `@/public/*` |
 * | `(public)/mypage/_shared` | 無し（route ローカル） |
 * | `(public)/_components/_shared` | 無し（component ローカル） |
 *
 * `_shared/` という**文字列**で判定すると後ろ 2 つを誤検出する（実測: 文字列一致だと
 * 20 件ヒットするが、alias 対象へ解決するのは 4 行だけ）。import 元ディレクトリからの
 * 相対解決を実際に計算し、`(public)/_shared/` に着地するものだけを違反にする。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const publicAppRoot = path.join(workspaceRoot, "src", "app", "(public)");
/** `@/public/*` が指す実ディレクトリ（tsconfig paths の SSoT はそちら）。 */
const ALIASED_SHARED = path.join(publicAppRoot, "_shared");

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

/** `from "…"` / `import("…")` の specifier。行コメントは除く。 */
const SPECIFIER = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gu;

/** `target` が `dir` の内側にあるか（`dir` 自身は含まない）。 */
function isInside(dir: string, target: string): boolean {
  const relative = path.relative(dir, target);
  return (
    relative.length > 0 &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

/**
 * そのファイルが `(public)/_shared` を alias 以外で指している specifier。
 *
 * - 相対 specifier は import 元から解決して着地点で判定する
 * - `@/app/(public)/_shared/…` のような別 alias 形も違反（前身が見ていた唯一の形）
 */
export function aliasBypassingSharedImports(
  fileAbsolutePath: string,
  source: string,
  aliasedSharedDir: string,
): string[] {
  const offenders: string[] = [];
  const fromDir = path.dirname(fileAbsolutePath);

  // **`_shared` の内側から兄弟を指す相対 import は正しい形**。守りたいのは
  // 「外から中へ入るとき alias を使う」であって、中の相互参照ではない。
  // ここを外すと `_shared` 内の 28 ファイルが自分自身への alias を強要される。
  if (isInside(aliasedSharedDir, fileAbsolutePath)) return offenders;

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    for (const match of line.matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2];
      if (specifier === undefined) continue;

      if (specifier.startsWith("@/app/(public)/_shared/")) {
        offenders.push(specifier);
        continue;
      }
      if (!specifier.startsWith(".")) continue;

      const resolved = path.resolve(fromDir, specifier);
      if (isInside(aliasedSharedDir, resolved)) offenders.push(specifier);
    }
  }

  return offenders;
}

describe("public path alias hygiene", () => {
  test("走査対象が実在する（gate 自体が空振りしていない）", () => {
    expect(collectSourceFiles(publicAppRoot).length).toBeGreaterThan(50);
  });

  test("判定が解決先で決まる（fixture）", () => {
    const page = path.join(publicAppRoot, "spaces", "[slug]", "page.tsx");

    // `(public)/_shared` へ着地する相対 import は違反。
    expect(
      aliasBypassingSharedImports(
        page,
        'import { X } from "../../_shared/components/x";',
        ALIASED_SHARED,
      ),
    ).toEqual(["../../_shared/components/x"]);

    // `_shared` の内側から兄弟を指す相対 import は正しい形（外から中への
    // 侵入だけを見る）。
    const insideShared = path.join(
      ALIASED_SHARED,
      "components",
      "layouts",
      "site-cta.tsx",
    );
    expect(
      aliasBypassingSharedImports(
        insideShared,
        'import { C } from "../design-system/container";',
        ALIASED_SHARED,
      ),
    ).toEqual([]);

    // 同じ `_shared/` という綴りでも、別ディレクトリへ着地するなら違反ではない。
    const mypage = path.join(publicAppRoot, "mypage", "settings", "page.tsx");
    expect(
      aliasBypassingSharedImports(
        mypage,
        'import { Y } from "../_shared/actions/account";',
        ALIASED_SHARED,
      ),
    ).toEqual([]);

    // 別 alias 形（前身が見ていた唯一の形）。
    expect(
      aliasBypassingSharedImports(
        page,
        'import { Z } from "@/app/(public)/_shared/lib/z";',
        ALIASED_SHARED,
      ),
    ).toEqual(["@/app/(public)/_shared/lib/z"]);

    // 正しい書き方は拾わない。
    expect(
      aliasBypassingSharedImports(
        page,
        'import { W } from "@/public/lib/w";',
        ALIASED_SHARED,
      ),
    ).toEqual([]);
  });

  test("src/app/(public) から (public)/_shared を指す import は @/public alias を使う", () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(publicAppRoot)) {
      const found = aliasBypassingSharedImports(
        file,
        readFileSync(file, "utf8"),
        ALIASED_SHARED,
      );
      if (found.length === 0) continue;
      offenders.push(
        `${path.relative(workspaceRoot, file).replaceAll("\\", "/")} :: ${found.join(", ")}`,
      );
    }

    expect(offenders).toEqual([]);
  }, 30_000);
});
