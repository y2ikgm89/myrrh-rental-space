/**
 * customer.merge audit log gate — self-serve merge action が admin merge と同型の
 * `customer.merge` 監査ログを fire-and-forget で記録することを pin する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const ACTION_FILE = join(
  ROOT,
  "src",
  "app",
  "(public)",
  "mypage",
  "_shared",
  "actions",
  "customer-merge.ts",
);

describe("customer-merge audit log contract", () => {
  test("confirmCustomerMergeAction records customer.merge audit log", () => {
    const source = readFileSync(ACTION_FILE, "utf8");
    expect(source).toMatch(/resource:\s*"customer\.merge"/u);
    expect(source).toMatch(/fireAndForget\s*\(/u);
    expect(source).toMatch(/createAuditLogRecord\s*\(/u);
    expect(source).toMatch(/channel:\s*"customer-mypage"/u);
  });
});
