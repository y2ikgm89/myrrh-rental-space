/**
 * customer merge token TTL gate — TTL が 1 時間を超えないことを pin する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const COMMAND_FILE = join(
  ROOT,
  "src",
  "shared",
  "domain",
  "customers",
  "customer-merge-commands.ts",
);

describe("customer-merge token TTL contract", () => {
  test("CUSTOMER_MERGE_TOKEN_TTL_MS is exactly one hour", () => {
    const source = readFileSync(COMMAND_FILE, "utf8");
    expect(source).toMatch(
      /export const CUSTOMER_MERGE_TOKEN_TTL_MS = 60 \* 60 \* 1000;/u,
    );
    expect(source).not.toMatch(/CUSTOMER_MERGE_TOKEN_TTL_MS = 2 \* 60/u);
  });
});
