import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * E2E fixture の `workspaceRoot` 解決ゲート
 *
 * `e2e/**` の spec / helper は fixture スクリプトを
 * `execFile("bun", [path.join(workspaceRoot, "scripts", ...)], { cwd: workspaceRoot })`
 * で起動する。`workspaceRoot` は `path.join(__dirname, "..", ...)` で組み立てるため、
 * ファイルの階層と `".."` の数がずれるとリポジトリ外を指し、spawn が ENOENT で落ちる。
 *
 * これらの spec は opt-in job（`e2e-tests`）でしか走らないため、
 * 実行されないまま壊れたパスが残り続ける。ここで静的に固定する。
 */

const REPO_ROOT = process.cwd();
const E2E_ROOT = join(REPO_ROOT, "e2e");

// `const workspaceRoot = path.join(__dirname, "..", "..")` の `".."` を数える。
const WORKSPACE_ROOT_DECLARATION =
  /const\s+workspaceRoot\s*=\s*(?:path\.)?join\(\s*__dirname\s*,\s*((?:"\.\."\s*,?\s*)+)\)/gu;

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

interface WorkspaceRootDeclaration {
  readonly filePath: string;
  readonly upLevels: number;
}

function collectDeclarations(): WorkspaceRootDeclaration[] {
  const declarations: WorkspaceRootDeclaration[] = [];

  for (const filePath of collectTypeScriptFiles(E2E_ROOT)) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(WORKSPACE_ROOT_DECLARATION)) {
      const segments = match[1];
      if (segments === undefined) continue;
      declarations.push({
        filePath,
        upLevels: [...segments.matchAll(/"\.\."/gu)].length,
      });
    }
  }

  return declarations;
}

describe("E2E fixture workspace root", () => {
  const declarations = collectDeclarations();

  test("scans at least one workspaceRoot declaration", () => {
    // 正規表現が house pattern から外れて 0 件マッチになると
    // ゲートが silent pass するため、走査対象の存在自体を固定する。
    expect(declarations.length).toBeGreaterThan(0);
  });

  for (const { filePath, upLevels } of declarations) {
    const relativePath = relative(REPO_ROOT, filePath).split(sep).join("/");

    test(`${relativePath} resolves workspaceRoot to the repository root`, () => {
      const upSegments = Array.from({ length: upLevels }, () => "..");
      const resolved = resolve(dirname(filePath), ...upSegments);

      expect(resolved).toBe(REPO_ROOT);
    });
  }
});
