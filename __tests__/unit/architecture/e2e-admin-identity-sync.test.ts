import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E2E 専用 admin identity の drift gate。
 *
 * ラベル → email の SSoT は `src/shared/domain/admin-auth/e2e-identity.ts` だが、
 * 同ファイルは `import "server-only"` を持つため plain Bun script である
 * `scripts/e2e/ensure-admin-user.ts` からは import できず、email を再掲している。
 * 両者がずれると「ヘッダーは通るが該当ユーザーが DB に無い」= 全 spec が
 * access-denied に落ちる、という分かりにくい失敗になるので機械固定する。
 *
 * playwright の project 側ヘッダー値も同時に検証し、3 点セットで同期させる。
 */

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}

/** `e2e-identity.ts` の E2E_ADMIN_IDENTITIES から label → email を取り出す */
function parseIdentitySsot(): Map<string, string> {
  const source = read("src/shared/domain/admin-auth/e2e-identity.ts");
  const block = /E2E_ADMIN_IDENTITIES = \{([\s\S]*?)\} as const/u.exec(source);
  if (!block?.[1]) throw new Error("E2E_ADMIN_IDENTITIES block not found");

  return new Map(
    [...block[1].matchAll(/(\w+):\s*"([^"]+)"/gu)].map((m) => [
      String(m[1]),
      String(m[2]),
    ]),
  );
}

describe("E2E admin identity sync", () => {
  test("SSoT が空でなく、viewer ラベルを持つ", () => {
    const identities = parseIdentitySsot();

    expect(identities.size).toBeGreaterThan(0);
    expect(identities.get("viewer")).toBe("e2e-viewer@example.com");
  });

  test("ensure-admin-user.ts が全 identity の email を upsert する", () => {
    const script = read("scripts/e2e/ensure-admin-user.ts");

    const missing = [...parseIdentitySsot().values()].filter(
      (email) => !script.includes(`"${email}"`),
    );

    expect(missing).toEqual([]);
  });

  test("playwright project のヘッダー値が SSoT のラベルと一致する", () => {
    const config = read("playwright.config.ts");
    const labels = [...parseIdentitySsot().keys()];

    const headerValues = [
      ...config.matchAll(/"x-e2e-admin-identity":\s*"([^"]+)"/gu),
    ].map((m) => String(m[1]));

    // gate 自体が空振りしていないことの sanity check
    expect(headerValues.length).toBeGreaterThan(0);

    const unknown = headerValues.filter((value) => !labels.includes(value));
    expect(unknown).toEqual([]);
  });

  test("role を実行時に書き換える旧ヘルパーを再導入しない", () => {
    // 共有 User 行の mutation は fullyParallel 下で他 spec に漏れる。
    // clean-break 済みなので復活させない（CI run 30577092619 の再発防止）。
    // 散文での言及は許すため、ファイルの実在と import 文だけを見る。
    const deletedHelpers = [
      "e2e/helpers/set-admin-role.ts",
      "scripts/e2e/set-admin-role.ts",
    ].filter((rel) => existsSync(join(root, ...rel.split("/"))));

    expect(deletedHelpers).toEqual([]);

    const spec = read(
      "e2e/authenticated/admin-viewer/rbac-viewer-write-blocked.spec.ts",
    );
    expect(spec).not.toMatch(/^import[\s\S]*?set-admin-role/mu);
  });
});
