/**
 * src/ 配下で「App Router のエントリーポイントから到達不能なモジュール」を
 * 0 件（allowlist 明記分を除く）に強制する。
 *
 * entrypoint（root）は Next.js App Router の特殊ファイル規約
 * （page/layout/route/error/loading/not-found/...）+ `src/instrumentation.ts` +
 * `src/proxy.ts`。Server Action（`_shared/actions/**`）は必ず client component /
 * page から import されるため convention root から到達するはずで、意図的に
 * root には含めない — root にすると「呼ばれなくなった action」を検出できなくなる。
 *
 * `scripts/**` / `prisma/seed.ts` / `e2e/**` / `__tests__/**` からのみ到達する
 * モジュールも orphan（`src/**` の実行時グラフとしては到達不能）として扱う。
 * これらは「本番コードではなく test/tooling だけが生かしているコード」を検出する
 * ための意図的な設計。
 */

import { describe, expect, test } from "bun:test";
import {
  buildModuleGraph,
  extractImportSpecifiers,
  findReachableFiles,
} from "../../helpers/architecture-fs";

const REPO_ROOT = process.cwd();

/** Next.js App Router 特殊ファイル名規約（拡張子・番号 suffix 込み）。 */
const APP_ROOT_BASENAME_RE =
  /^(page|layout|route|error|loading|not-found|global-not-found|default|template|global-error|forbidden|unauthorized|sitemap|robots|manifest|opengraph-image\d*|twitter-image\d*|icon\d*|apple-icon\d*)\.tsx?$/;

/**
 * 到達不能と判明しても仕様上・設計上問題ない module。
 * 削除・配線を PR で個別に判断できるよう、必ず理由を書く。
 * このテストは「新規の到達不能」だけを 0 件にするための ratchet。
 *
 * Phase B2/B3 で当時の全エントリ（未使用 barrel 5 件・重複 cache tag producer 1 件・
 * 参照されなくなった re-export/定数 2 件）を削除済み。空集合を維持し、
 * 新規の到達不能が出た際にここへ理由付きで追加する。
 */
const REACHABILITY_ALLOWLIST = new Set<string>([]);

/**
 * app root から到達しないが `__tests__/**` からのみ import される（本番コードでは
 * 死んでいるが test だけが生かしている）。gate 自体は root に __tests__ を含めない
 * 設計上、これらも上と同じ orphan 判定になる。理由を明記して同じ扱いにする。
 *
 * Phase B2/B3 で当時の全 4 エントリを解消済み（3 件は re-export shim を削除し
 * 参照元テストの import を live 実装へ retarget、1 件は真の dead code として
 * ファイルごと削除）。空集合を維持する。
 */
const TEST_ONLY_ALLOWLIST = new Set<string>([]);

/** app root から到達しないが scripts/** / prisma/seed.ts からのみ import される。 */
const SCRIPT_ONLY_ALLOWLIST = new Set<string>();

function isAppRootFile(relPath: string): boolean {
  if (!relPath.startsWith("src/app/")) return false;
  const basename = relPath.split("/").at(-1) ?? "";
  return APP_ROOT_BASENAME_RE.test(basename);
}

describe("module reachability", () => {
  const graph = buildModuleGraph(REPO_ROOT);

  const appRoots = graph.files.filter(isAppRootFile);
  const fixedRoots = ["src/instrumentation.ts", "src/proxy.ts"].filter((f) =>
    graph.files.includes(f),
  );
  const roots = [...appRoots, ...fixedRoots];

  test("fixture: JSDoc / ブロックコメントの例示 import は抽出しない", () => {
    // 監査 F-76: 生テキスト走査だと @example の import が実辺になる。
    const source = [
      "/**",
      " * @example",
      " * ```ts",
      ' * import { updateBasicInfo } from "@/shared/domain/settings/commands/site-chrome";',
      " * ```",
      " */",
      'import { executeConformMutation } from "@/shared/lib/forms/conform-action";',
      '/* import { leftover } from "./prismaNamespace"; */',
      '// import { skipped } from "@/shared/lib/validations/settings";',
      'export { ROLE_PERMISSIONS } from "@/shared/lib/admin-permissions";',
    ].join("\n");

    expect(extractImportSpecifiers(source)).toEqual([
      "@/shared/lib/forms/conform-action",
      "@/shared/lib/admin-permissions",
    ]);
  });

  test("sanity: root 数が想定レンジを維持している（regex 破壊の検知）", () => {
    // 実測 336（page 132 / route 76 / loading 74 / error 33 / route.tsx 6 /
    // layout.tsx 6 / not-found 3 / 他少数 + instrumentation.ts + proxy.ts）。
    // 大幅に減った場合は APP_ROOT_BASENAME_RE か src/app 配下の構造変化を疑う。
    expect(roots.length).toBeGreaterThanOrEqual(300);
  });

  test("sanity: 解決できない import specifier は既知の非 TS 資産のみ", () => {
    // CSS / JSON など .ts/.tsx グラフの対象外に解決される import。
    const KNOWN_UNRESOLVED_SUFFIXES = [".css", ".json"];
    const unexpected = graph.unresolvedSpecifiers.filter(
      (entry) => !KNOWN_UNRESOLVED_SUFFIXES.some((suf) => entry.endsWith(suf)),
    );
    expect(unexpected).toEqual([]);
  });

  test("src/app の App Router entrypoint から到達不能な module が無い（allowlist 明記分を除く）", () => {
    const reachable = findReachableFiles(graph, roots);
    const tsFiles = graph.files.filter(
      (f) => !f.endsWith(".d.ts") && (f.endsWith(".ts") || f.endsWith(".tsx")),
    );
    const orphans = tsFiles.filter((f) => !reachable.has(f));

    const allAllowed = new Set([
      ...REACHABILITY_ALLOWLIST,
      ...TEST_ONLY_ALLOWLIST,
      ...SCRIPT_ONLY_ALLOWLIST,
    ]);

    // (a) allowlist に載っているのに実際は到達している → allowlist から削除させる
    //     （architecture-boundaries.test.ts の LIB_TO_DOMAIN_IMPORT_ALLOWLIST と
    //     同じ双方向 ratchet。stale allowlist の放置を防ぐ）。
    const staleAllowlistEntries = [...allAllowed].filter(
      (f) => !orphans.includes(f),
    );
    expect(staleAllowlistEntries).toEqual([]);

    // (b) allowlist にない新規の到達不能は 0 件
    const newOrphans = orphans.filter((f) => !allAllowed.has(f));
    expect(newOrphans).toEqual([]);
  });
});
