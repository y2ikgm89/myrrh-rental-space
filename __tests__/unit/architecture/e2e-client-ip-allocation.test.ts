import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { Glob } from "bun";

/**
 * E2E の client IP（`x-forwarded-for`）割当が衝突しないことの gate。
 *
 * ## なぜ
 *
 * proxy の `apiRateLimiter` は 100 req/分/IP で `/api/*` に効き、E2E 免除は無い
 * （規約上 `CI=true` をバイパス条件にしないため、意図的に無い）。`fullyParallel`
 * かつ 2 worker で走る E2E は既定だと**全 spec が同一 IP**を共有するので、
 * `/api` を直接叩く spec は飽和した窓で 429 を食う。
 *
 * 実測: CI run 30593381788 で `guest-receipt-single-use`、
 * run 30607885778 で `calendar-download` の 2 件が 429 で落ちた。
 *
 * 対処は spec ごとに専用 IP を割り当てること（`test.use` の `extraHTTPHeaders`
 * は page と `request` の両方に効く）。ただし**同じ IP を 2 spec が使うと
 * バケットを共有してしまい、無言でこのバグが再発する**。それを防ぐ。
 *
 * ## 割当規約
 *
 * - 静的割当（spec 単位）: `203.0.113.1`〜`.9`
 * - 動的割当（browser context 単位）: `203.0.113.10`〜`.250`
 *   （`e2e/helpers/admin-auth.ts` の `getContextClientIp`）
 *
 * いずれも RFC 5737 の TEST-NET-3（ドキュメント用に予約された範囲）。
 */

const root = process.cwd();

const DYNAMIC_RANGE_START = 10;

function listE2EFiles(): string[] {
  const glob = new Glob("e2e/**/*.ts");
  return [...glob.scanSync(root)].map((p) => p.split(sep).join("/")).sort();
}

/** spec が `test.use` で静的に固定した IP を集める（helper の動的割当は除く） */
function collectStaticIpAssignments(): Map<string, string[]> {
  const byIp = new Map<string, string[]>();

  for (const rel of listE2EFiles()) {
    const source = readFileSync(join(root, ...rel.split("/")), "utf8");
    for (const match of source.matchAll(
      /"x-forwarded-for":\s*"(\d+\.\d+\.\d+\.\d+)"/gu,
    )) {
      const ip = match[1];
      if (ip === undefined) continue;
      byIp.set(ip, [...(byIp.get(ip) ?? []), rel]);
    }
  }

  return byIp;
}

/**
 * proxy が `apiRateLimiter`（100/分/IP）を適用する `/api` パスかどうか。
 *
 * `/api/live` は完全除外、`/api/webhooks` と `/api/cron` は別枠の
 * `infraEndpointRateLimiter`（300/分）なので、専用 IP を必須にしない
 * （`src/proxy.ts` の `isLiveProbeEndpoint` / infra 判定）。
 */
function usesSharedApiLimiter(source: string): boolean {
  const callsApiViaRequest =
    /request\.(get|post|put|delete|fetch)\s*\(/u.test(source) &&
    source.includes("/api/");
  if (!callsApiViaRequest) return false;

  const apiPaths = [
    ...source.matchAll(/["`'](\/api\/[a-z0-9\-/[\]$.{}]*)/giu),
  ].map((m) => String(m[1]));
  return apiPaths.some(
    (p) =>
      !p.startsWith("/api/live") &&
      !p.startsWith("/api/webhooks") &&
      !p.startsWith("/api/cron"),
  );
}

describe("E2E client IP allocation", () => {
  test("共有 limiter 対象の /api を叩く spec は専用 IP を持つ", () => {
    // 衝突チェックだけでは「割当が無い spec」が不可視になる（Codex P2 指摘）。
    // 実測: `calendar-api.spec.ts` は `/api/calendar/*` を request で直接叩くのに
    // 割当が無く、飽和時に 401 の代わりに 429 を受けうる状態だった。
    const missing = listE2EFiles()
      .filter((rel) => rel.endsWith(".spec.ts"))
      .filter((rel) => {
        const source = readFileSync(join(root, ...rel.split("/")), "utf8");
        return (
          usesSharedApiLimiter(source) && !source.includes("x-forwarded-for")
        );
      });

    expect(missing).toEqual([]);
  });

  test("同じ静的 IP を 2 つ以上の spec が使っていない", () => {
    const collisions = [...collectStaticIpAssignments().entries()]
      .filter(([, files]) => files.length > 1)
      .map(([ip, files]) => `${ip} が重複: ${files.join(", ")}`);

    expect(collisions).toEqual([]);
  });

  test("静的 IP が動的割当レンジ（.10〜.250）と衝突しない", () => {
    const overlaps = [...collectStaticIpAssignments().keys()]
      .filter((ip) => {
        const lastOctet = Number(ip.split(".").at(-1));
        return lastOctet >= DYNAMIC_RANGE_START;
      })
      .map((ip) => `${ip} は動的割当レンジと衝突する`);

    expect(overlaps).toEqual([]);
  });

  test("動的割当の開始オクテットが規約どおり", () => {
    // 静的側の上限（.9）と動的側の下限が食い違うと無言で衝突する。
    const helper = readFileSync(
      join(root, "e2e", "helpers", "admin-auth.ts"),
      "utf8",
    );

    expect(helper).toMatch(/nextContextIpOctet\s*=\s*10/u);
  });
});
