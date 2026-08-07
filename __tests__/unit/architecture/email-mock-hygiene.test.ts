import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const testRoots = [
  path.join(workspaceRoot, "__tests__", "integration"),
  path.join(workspaceRoot, "__tests__", "unit", "shared", "domain"),
  path.join(workspaceRoot, "__tests__", "unit", "domain"),
  path.join(workspaceRoot, "__tests__", "unit", "actions"),
  path.join(workspaceRoot, "__tests__", "unit", "api"),
];

const EMAIL_LIB_DISPATCH = "@/shared/domain/email/lib-dispatch";
const ALLOWED_PARTIAL_EMAIL_DIRS = [
  path.join(workspaceRoot, "__tests__", "unit", "shared", "lib", "email"),
  path.join(workspaceRoot, "__tests__", "unit", "emails"),
  path.join(workspaceRoot, "__tests__", "unit", "email"),
];

function collectTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".test.ts") || fullPath.endsWith(".test.tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function isAllowedPartialEmailMock(file: string): boolean {
  return ALLOWED_PARTIAL_EMAIL_DIRS.some((allowed) =>
    file.startsWith(`${allowed}${path.sep}`),
  );
}

/**
 * 共有 mock を使わない `send` / `lib-dispatch` の部分 mock か（純粋判定）。
 *
 * 共有ヘルパー（`installEmailLibDispatchMock` /
 * `createEmailLibDispatchMockModule`）を通していれば免除。
 */
export function usesPartialEmailMock(source: string): boolean {
  const usesPartialSendMock =
    source.includes('mock.module("@/shared/lib/email/send"') &&
    !source.includes("installEmailLibDispatchMock");
  const usesPartialLibDispatchMock =
    source.includes(`mock.module("${EMAIL_LIB_DISPATCH}"`) &&
    !source.includes("installEmailLibDispatchMock") &&
    !source.includes("createEmailLibDispatchMockModule");
  return usesPartialSendMock || usesPartialLibDispatchMock;
}

describe("email mock hygiene", () => {
  test("検出できる形・できない形（fixture）", () => {
    const sendMock = 'mock.module("@/shared/lib/email/send", () => ({}));';
    const dispatchMock = `mock.module("${EMAIL_LIB_DISPATCH}", () => ({}));`;

    expect(usesPartialEmailMock(sendMock)).toBe(true);
    expect(usesPartialEmailMock(dispatchMock)).toBe(true);

    // 共有ヘルパー経由なら免除。
    expect(
      usesPartialEmailMock(`installEmailLibDispatchMock();
${sendMock}`),
    ).toBe(false);
    expect(
      usesPartialEmailMock(
        `createEmailLibDispatchMockModule();
${dispatchMock}`,
      ),
    ).toBe(false);

    // 別モジュールの mock は対象外。
    expect(
      usesPartialEmailMock('mock.module("@/shared/lib/other", () => ({}));'),
    ).toBe(false);
  });

  test("走査対象が実在する（gate が空振りしていない）", () => {
    const files = testRoots.flatMap((root) => collectTestFiles(root));
    expect(files.length).toBeGreaterThan(50);
  });

  test("domain/integration テストは lib-dispatch 共有 mock を使い send の部分 mock を避ける", () => {
    const offenders: string[] = [];

    for (const root of testRoots) {
      for (const file of collectTestFiles(root)) {
        if (isAllowedPartialEmailMock(file)) continue;
        if (usesPartialEmailMock(readFileSync(file, "utf8"))) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
