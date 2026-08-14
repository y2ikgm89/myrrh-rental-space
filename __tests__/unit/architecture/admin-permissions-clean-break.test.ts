import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");
const TEST_ROOT = join(ROOT, "__tests__");
const ADMIN_PERMISSIONS_FILE = join(
  SRC_ROOT,
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
  "_shared",
  "lib",
  "permissions.ts",
);

const PURE_RBAC_EXPORTS = [
  "ROLE_PERMISSIONS",
  "hasPermission",
  "PermissionKey",
  "RolePermissions",
  "Resource",
  "Action",
  "RESOURCE_LABELS",
  "ROLE_LABELS",
  // role type guards: src/shared/lib/admin-role-guards.ts が SSoT
  // (public/preview ルートからも参照するため shared に置く)
  "isEditorRole",
  "isAdminRole",
  "isSuperAdminRole",
] as const;

function collectSourceFiles(root: string): string[] {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  return [...glob.scanSync({ cwd: root })].map((file) => join(root, file));
}

function readSource(file: string): string {
  return readFileSync(file, "utf8");
}

describe("admin permissions clean break", () => {
  test("server-only admin permissions module does not re-export client-safe RBAC symbols", () => {
    const source = readSource(ADMIN_PERMISSIONS_FILE);

    expect(source).not.toContain("Re-exports");
    expect(source).not.toContain("既存 import path 維持");
    for (const symbol of PURE_RBAC_EXPORTS) {
      expect(source).not.toMatch(
        new RegExp(`export\\s+(?:type\\s+)?\\{[^}]*\\b${symbol}\\b`, "u"),
      );
    }
  });

  test("pure RBAC symbols are imported from shared SSoT modules, not the admin server-only module", () => {
    const importPattern =
      /import\s+(?:type\s+)?\{(?<members>[^}]+)\}\s+from\s+["']@\/admin\/lib\/permissions["']/gu;
    const forbidden = new Set<string>(PURE_RBAC_EXPORTS);
    const offenders: string[] = [];

    const scanned = [
      ...collectSourceFiles(SRC_ROOT),
      ...collectSourceFiles(TEST_ROOT),
    ];
    // 走査規模の下限（監査 F-13）。glob が 0 件を返しても `toEqual([])` は緑になる。
    // `src/` + `__tests__/` は 4 桁ファイルあるので 300 は十分に緩い。
    // しきい値は**数値リテラルで書く** — local/gate-scan-must-not-be-silently-empty は
    // 識別子を追わないので、定数に切り出すと下限が無いものとして扱われる。
    expect(scanned.length).toBeGreaterThan(300);

    for (const file of scanned) {
      const source = readSource(file);
      for (const match of source.matchAll(importPattern)) {
        const members = match.groups?.["members"] ?? "";
        const imported = members
          .split(",")
          .map((member) => member.trim().replace(/^type\s+/u, ""))
          .map((member) => member.split(/\s+as\s+/u)[0]?.trim() ?? "")
          .filter(Boolean);
        const forbiddenMembers = imported.filter((member) =>
          forbidden.has(member),
        );
        if (forbiddenMembers.length > 0) {
          offenders.push(
            `${relative(ROOT, file)}: ${forbiddenMembers.join(", ")}`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
