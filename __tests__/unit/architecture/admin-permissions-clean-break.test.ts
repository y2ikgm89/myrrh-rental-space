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

    for (const file of [
      ...collectSourceFiles(SRC_ROOT),
      ...collectSourceFiles(TEST_ROOT),
    ]) {
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
