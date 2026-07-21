import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ADMIN_DASHBOARD_ROOT = join(
  ROOT,
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function readAdminFile(...segments: string[]): string {
  return readFileSync(join(ADMIN_DASHBOARD_ROOT, ...segments), "utf8");
}

/**
 * Round-5 audit Finding #11 / #12: terms/agreements と events/[id]/waitlist の
 * 読取ページが `_shared/queries` の RBAC ラッパーを経由せず
 * `shared/domain/**\/admin-queries` を直接 import しており、
 * `requireAdminPermission` を一切通らずに閲覧可能だった（sidebar 上は
 * 権限フィルタで非表示になるだけで、直接 URL アクセスは防がれていなかった）。
 * terms 配下・events 配下の全ページで同型の gap があったため、
 * page.tsx が domain query を直 import せず `@/admin/queries/*` 経由になっている
 * ことを回帰防止として固定する。
 */
describe("admin terms/event RBAC boundaries", () => {
  test("terms admin ページは domain query を直 import しない", () => {
    const pages = [
      ["terms", "page.tsx"],
      ["terms", "agreements", "page.tsx"],
      ["terms", "trash", "page.tsx"],
      ["terms", "[id]", "edit", "page.tsx"],
    ];

    for (const pagePath of pages) {
      const source = readAdminFile(...pagePath);
      expect(source).not.toMatch(
        /from "@\/shared\/domain\/terms\/admin-queries"/u,
      );
    }
  });

  test("events admin ページは domain query を直 import しない", () => {
    const pages = [
      ["events", "page.tsx"],
      ["events", "new", "page.tsx"],
      ["events", "[id]", "page.tsx"],
      ["events", "[id]", "edit", "page.tsx"],
      ["events", "[id]", "broadcast", "page.tsx"],
      ["events", "[id]", "check-in", "page.tsx"],
      ["events", "[id]", "waitlist", "page.tsx"],
    ];

    for (const pagePath of pages) {
      const source = readAdminFile(...pagePath);
      expect(source).not.toMatch(
        /from "@\/shared\/domain\/events\/(admin-queries|registration-queries|waitlist-queries)"/u,
      );
    }
  });

  test("_shared/queries/terms.ts は全 export を terms:read で gate する", () => {
    const source = readAdminFile("_shared", "queries", "terms.ts");
    const exportedFunctions = [
      ...source.matchAll(/^export async function (\w+)/gmu),
    ];

    expect(exportedFunctions.length).toBeGreaterThan(0);
    expect(
      (source.match(/requireAdminPermission\("terms", "read"\)/gu) ?? [])
        .length,
    ).toBe(exportedFunctions.length);
  });

  test("_shared/queries/event.ts は全 export を event:read で gate する", () => {
    const source = readAdminFile("_shared", "queries", "event.ts");
    const exportedFunctions = [
      ...source.matchAll(/^export async function (\w+)/gmu),
    ];

    expect(exportedFunctions.length).toBeGreaterThan(0);
    expect(
      (source.match(/requireAdminPermission\("event", "read"\)/gu) ?? [])
        .length,
    ).toBe(exportedFunctions.length);
  });
});
