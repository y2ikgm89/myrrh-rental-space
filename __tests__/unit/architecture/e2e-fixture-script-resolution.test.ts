import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * E2E fixture script の解決可能性を機械保証する gate。
 *
 * 背景: `e2e/public/events-registration-toctou-capacity-1.spec.ts` は
 * `path.join(__dirname, "..", "..", "..")` で workspaceRoot を組み立てていたが、
 * 同ファイルは repo root から 2 階層（`e2e/public/`）のため root の 1 つ上を指し、
 * spawn 対象が `Module not found` になっていた。Playwright は spawn 失敗を
 * 個別テストの失敗としてしか報告しないため、**capacity=1 TOCTOU 同時申込テストが
 * 一度も実行されないまま長期潜伏**した（CI run 30577092619 で発覚）。
 *
 * type-check も ESLint も文字列連結で組んだ path は追跡できないので、
 * 「深さ」と「実在」を静的に検証する専用 gate を置く。
 */

const root = process.cwd();
const e2eRoot = join(root, "e2e");

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

interface WorkspaceRootUsage {
  readonly file: string;
  readonly upLevels: number;
  readonly dirDepth: number;
}

/** `path.join(__dirname, "..", "..")` の `".."` 個数を数える */
function findWorkspaceRootUsages(): WorkspaceRootUsage[] {
  return listTypeScriptFiles(e2eRoot).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const match = /path\.join\(__dirname((?:,\s*"\.\.")+)\)/u.exec(source);
    if (!match?.[1]) return [];

    const rel = relative(root, file);
    return [
      {
        file: rel.split(sep).join("/"),
        upLevels: match[1].split("..").length - 1,
        // `e2e/public/x.spec.ts` → ["e2e", "public"] → 2
        dirDepth: rel.split(sep).slice(0, -1).length,
      },
    ];
  });
}

/** spec が spawn する `scripts/e2e/*.ts` のファイル名 */
function findReferencedFixtureScripts(): { file: string; script: string }[] {
  return listTypeScriptFiles(e2eRoot).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const scripts = [...source.matchAll(/"([a-z0-9-]+\.ts)"/gu)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined);

    const rel = relative(root, file).split(sep).join("/");
    return [...new Set(scripts)].map((script) => ({ file: rel, script }));
  });
}

describe("E2E fixture script resolution", () => {
  test("workspaceRoot の `..` 個数が自身のディレクトリ深さと一致する", () => {
    const usages = findWorkspaceRootUsages();

    // gate 自体が空振りしていないことの sanity check
    expect(usages.length).toBeGreaterThan(0);

    const mismatched = usages
      .filter((u) => u.upLevels !== u.dirDepth)
      .map(
        (u) =>
          `${u.file}: ".." × ${u.upLevels} だがディレクトリ深さは ${u.dirDepth}`,
      );

    expect(mismatched).toEqual([]);
  });

  test("spec が参照する scripts/e2e/*.ts が実在する", () => {
    const missing = findReferencedFixtureScripts()
      .filter(({ script }) => !existsSync(join(root, "scripts", "e2e", script)))
      .map(
        ({ file, script }) => `${file} → scripts/e2e/${script} が存在しない`,
      );

    expect(missing).toEqual([]);
  });
});
