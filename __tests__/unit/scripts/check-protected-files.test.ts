import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const SCRIPT = readFileSync(
  join(process.cwd(), "scripts/check-protected-files.sh"),
  "utf8",
);

function readAssignedRegex(name: string): RegExp {
  const match = new RegExp(`^${name}='([^']+)'$`, "m").exec(SCRIPT);
  if (!match?.[1]) {
    throw new Error(`${name} が scripts/check-protected-files.sh にありません`);
  }
  return new RegExp(match[1]);
}

function isBlockedEnvFile(name: string): boolean {
  const include = readAssignedRegex("ENV_INCLUDE_RE");
  const exclude = readAssignedRegex("ENV_EXCLUDE_RE");
  return include.test(name) && !exclude.test(name);
}

const MUST_BLOCK = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
  ".env.production.local",
  ".env.development.local",
  ".env.test.local",
] as const;

const MUST_PASS = [
  ".env.example",
  ".env.sample",
  ".env.production.example",
  ".envrc",
  "README.md",
] as const;

describe("check-protected-files .env guard", () => {
  test("Next.js 複層名を含む秘密ファイルを落とす", () => {
    expect(MUST_BLOCK.map((name) => [name, isBlockedEnvFile(name)])).toEqual(
      MUST_BLOCK.map((name) => [name, true]),
    );
  });

  test("example/sample と非 .env ファイルは通す", () => {
    expect(MUST_PASS.map((name) => [name, isBlockedEnvFile(name)])).toEqual(
      MUST_PASS.map((name) => [name, false]),
    );
  });
});
