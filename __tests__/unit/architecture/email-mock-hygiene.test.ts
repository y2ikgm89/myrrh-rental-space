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

describe("email mock hygiene", () => {
  test("domain/integration テストは lib-dispatch 共有 mock を使い send の部分 mock を避ける", () => {
    const offenders: string[] = [];

    for (const root of testRoots) {
      for (const file of collectTestFiles(root)) {
        if (isAllowedPartialEmailMock(file)) continue;
        const source = readFileSync(file, "utf8");
        const usesPartialSendMock =
          source.includes('mock.module("@/shared/lib/email/send"') &&
          !source.includes("installEmailLibDispatchMock");
        const usesPartialLibDispatchMock =
          source.includes(`mock.module("${EMAIL_LIB_DISPATCH}"`) &&
          !source.includes("installEmailLibDispatchMock") &&
          !source.includes("createEmailLibDispatchMockModule");
        if (usesPartialSendMock || usesPartialLibDispatchMock) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
