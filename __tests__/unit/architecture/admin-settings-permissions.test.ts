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

function expectNoSettingsUpdate(source: string): void {
  expect(source).not.toMatch(/resource:\s*"settings",\s*action:\s*"update"/su);
  expect(source).not.toContain('checkPermission("settings", "update"');
}

describe("admin settings permission boundaries", () => {
  test("高リスク設定ページは settings:manage を要求する", () => {
    const manageOnlyPages = [
      ["settings", "features", "page.tsx"],
      ["settings", "billing", "page.tsx"],
      ["settings", "integrations", "page.tsx"],
      ["settings", "system", "page.tsx"],
    ];

    for (const pagePath of manageOnlyPages) {
      const source = readAdminFile(...pagePath);
      expect(source).toContain('requireAdminPermission("settings", "manage")');
    }
  });

  test("設定トップは高リスクカテゴリと連携ヘルスチェックを settings:manage に限定する", () => {
    const source = readAdminFile("settings", "page.tsx");

    expect(source).toContain(
      'const currentUser = await requireAdminPermission("settings", "read");',
    );
    expect(
      source.match(
        /requiredPermission:\s*\{\s*resource:\s*"settings",\s*action:\s*"manage"\s*\}/gu,
      ),
    ).toHaveLength(4);
    expect(source).toContain("const canManageSettings = hasPermission(");
    expect(source).toContain("{canManageSettings ? (");
    expect(source).toContain("<IntegrationHealthAlert />");
  });

  test("高リスク設定 Server Action は settings:update に戻さない", () => {
    const manageOnlyActionFiles = [
      ["_shared", "actions", "api-keys", "index.ts"],
      ["_shared", "actions", "instagram.ts"],
      ["_shared", "actions", "settings", "discount.ts"],
      ["_shared", "actions", "settings", "google-business-profile.ts"],
      ["_shared", "actions", "settings", "google-calendar.ts"],
      ["_shared", "actions", "settings", "stripe.ts"],
      ["_shared", "actions", "settings", "tax.ts"],
    ];

    for (const actionPath of manageOnlyActionFiles) {
      const source = readAdminFile(...actionPath);
      expect(source).toContain('action: "manage"');
      expectNoSettingsUpdate(source);
    }

    const gbpCallback = readFileSync(
      join(
        ROOT,
        "src",
        "app",
        "api",
        "google-business-profile",
        "oauth",
        "callback",
        "route.ts",
      ),
      "utf8",
    );
    expect(gbpCallback).toContain('checkPermission("settings", "manage"');
    expectNoSettingsUpdate(gbpCallback);
  });
});
