import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readStaffDetailPage(): string {
  return readFileSync(
    join(root, "src/app/(admin)/admin/(dashboard)/staff/[id]/page.tsx"),
    "utf8",
  );
}

describe("staff detail page", () => {
  test("does not show fixed access-model fields for every staff user", () => {
    const source = readStaffDetailPage();

    expect(source).not.toContain('label="認証方式"');
    expect(source).not.toContain("Google IAP</Badge>");
    expect(source).not.toContain('label="ロール管理"');
    expect(source).not.toContain(
      "Google Admin のロール別グループ所属から自動同期されます",
    );
    expect(source).toContain('label="ロール"');
  });
});
