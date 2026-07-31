import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";

/**
 * コードが要求する PermissionKey が `ROLE_PERMISSIONS` に実在することの gate。
 *
 * ## なぜ
 *
 * `PermissionKey` は `${Resource}:${Action}` のテンプレート型なので、
 * **どのロールにも付与されていないキーでも型検査を通る**。結果、
 * `checkPermission(resource, action)` / `hasPermission(role, resource, action)` が
 * 恒久的に false を返し、機能が全ロールで無言に死ぬ。
 *
 * 実例: PR #1444 が `/api/admin/export/event-registrations` の要求を
 * `event:read` → `event:manage` に引き上げたが `ROLE_PERMISSIONS` へ追加しなかった。
 * イベント参加者の CSV / Excel エクスポートが **UI（リンク非表示）と API（403）の
 * 両方で全ロール使用不能**になり、E2E が「download イベントが来ない」という
 * 無関係な症状で 30 秒 timeout していた（CI run 30621350538）。
 *
 * unit テストは `checkPermission` を mock していたため検出できなかった
 * （渡した引数は検証していたが、そのキーが実在するかは見ていなかった）。
 */

const root = process.cwd();

const PERMISSIONS_FILE = "src/shared/lib/admin-permissions.ts";

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

/** `ROLE_PERMISSIONS` に登場する `"resource:action"` を全て集める */
function grantedPermissionKeys(): Set<string> {
  const source = read(PERMISSIONS_FILE);
  return new Set(
    [...source.matchAll(/"([a-zA-Z]+:[a-zA-Z]+)"/gu)].map((m) => String(m[1])),
  );
}

/**
 * `checkPermission("resource", "action")` / `hasPermission(x, "resource", "action")`
 * の形で要求されているキーを集める。
 */
function requestedPermissionKeys(): Map<string, string[]> {
  const requested = new Map<string, string[]>();
  const glob = new Glob("src/**/*.{ts,tsx}");

  for (const file of glob.scanSync(root)) {
    const rel = file.split(sep).join("/");
    if (rel === PERMISSIONS_FILE) continue;

    const source = readFileSync(join(root, ...rel.split("/")), "utf8");
    for (const match of source.matchAll(
      /(?:checkPermission|hasPermission)\s*\(\s*(?:[^,()]+,\s*)?"([a-zA-Z]+)"\s*,\s*"([a-zA-Z]+)"/gu,
    )) {
      const key = `${String(match[1])}:${String(match[2])}`;
      requested.set(key, [...(requested.get(key) ?? []), rel]);
    }
  }

  return requested;
}

describe("要求される PermissionKey は ROLE_PERMISSIONS に実在する", () => {
  test("どのロールにも付与されていないキーを要求していない", () => {
    const granted = grantedPermissionKeys();
    const requested = requestedPermissionKeys();

    // gate 自体が空振りしていないことの sanity check
    expect(requested.size).toBeGreaterThan(0);
    expect(granted.size).toBeGreaterThan(0);

    const orphaned = [...requested.entries()]
      .filter(([key]) => !granted.has(key))
      .map(([key, files]) => `${key} を要求: ${files.join(", ")}`)
      .sort((a, b) => a.localeCompare(b));

    expect(orphaned).toEqual([]);
  });

  test("エクスポート系が要求するキーが揃っている（回帰防止）", () => {
    const granted = grantedPermissionKeys();

    // PII の一括出力。いずれも #1444 の監査対応で read より上に引き上げられた。
    expect(granted).toContain("event:manage");
    expect(granted).toContain("customer:manage");
    expect(granted).toContain("auditLog:manage");
  });
});
