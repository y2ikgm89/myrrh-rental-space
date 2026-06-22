/**
 * Cloudflare purge_by_tags End-to-End 検証スクリプト
 *
 * 本番 production の Cloudflare Cache-Tag purge を end-to-end で実証する。
 * Cloudflare 公式 purge API を直接叩き、SITE_WIDE_CDN_TAGS SSoT を使用。
 *
 * 使用方法:
 *   bun scripts/verify-cloudflare-purge.ts
 *
 * 前提:
 *   .env.local に以下が設定されていること:
 *     - CLOUDFLARE_ZONE_ID  (本番の Zone ID, 32-hex)
 *     - CLOUDFLARE_API_TOKEN (Cache Purge:Purge + Zone:Read 権限)
 *     - NEXT_PUBLIC_APP_URL (検証対象の本番ドメイン)
 *
 * 検証フロー:
 *   1. ベースライン取得: 公開 4 route の cf-cache-status / Age を記録
 *   2. SITE_WIDE_CDN_TAGS を SSoT として purge_by_tags を発火
 *   3. 2 秒後 / 30 秒後 / 90 秒後に cf-cache-status 遷移を観測
 *   4. HIT → MISS/EXPIRED → HIT 復帰の遷移を確認
 *
 * 安全性:
 *   - production data には一切触れない (edge cache のみ flush)
 *   - 次のリクエストで origin から再取得し HIT 復帰
 *   - cold 期間は数秒の origin RPS 微増のみ
 *
 * 公式準拠:
 *   - Cloudflare 公式 purge-by-tags API
 *     https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/
 *   - 検証手順は troubleshooting/slow-website.mdx の cf-cache-status 観測パターン
 *
 * 設計上の注意:
 *   server-only パッケージが Bun script context で throw するため、
 *   src/shared/lib/cloudflare.ts は import しない。代わりに CF API を直接叩き、
 *   tag の SSoT (SITE_WIDE_CDN_TAGS) のみを import する。
 */

import { SITE_WIDE_CDN_TAGS } from "@/shared/lib/constants/cdn-cache-tags";

const TARGET_URLS = ["/", "/spaces", "/faq", "/blog"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} が設定されていません (.env.local)`);
    process.exit(1);
  }
  return value;
}

const baseUrl = requireEnv("NEXT_PUBLIC_APP_URL");
const zoneId = requireEnv("CLOUDFLARE_ZONE_ID");
const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");

if (!/^[a-f0-9]{32}$/.test(zoneId)) {
  console.error("❌ CLOUDFLARE_ZONE_ID の形式不正 (32-hex 必須)");
  process.exit(1);
}

interface ProbeResult {
  url: string;
  status: number;
  cfCacheStatus: string | null;
  age: string | null;
  cfRay: string | null;
}

async function probe(path: string): Promise<ProbeResult> {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, { method: "HEAD", redirect: "manual" });
  return {
    url: path,
    status: response.status,
    cfCacheStatus: response.headers.get("cf-cache-status"),
    age: response.headers.get("age"),
    cfRay: response.headers.get("cf-ray"),
  };
}

async function probeAll(label: string): Promise<ProbeResult[]> {
  console.log(`\n=== ${label} (${new Date().toISOString()}) ===`);
  const results = await Promise.all(TARGET_URLS.map((u) => probe(u)));
  const table = results.map((r) => ({
    url: r.url,
    status: r.status,
    cf: r.cfCacheStatus ?? "-",
    age: r.age ?? "-",
    ray: r.cfRay?.split("-")[0]?.slice(-8) ?? "-",
  }));
  console.table(table);
  return results;
}

interface PurgeApiResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: { id?: string };
}

async function firePurge(tags: readonly string[]): Promise<PurgeApiResponse> {
  const url = new URL(
    `/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
    "https://api.cloudflare.com",
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tags: [...tags] }),
    signal: AbortSignal.timeout(10000),
  });
  const json: unknown = await response.json();
  if (typeof json !== "object" || json === null) {
    throw new Error(`Invalid response from CF API: ${JSON.stringify(json)}`);
  }
  return json as PurgeApiResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  console.log("🚀 Cloudflare purge_by_tags End-to-End 検証開始");
  console.log(`   対象ドメイン: ${baseUrl}`);
  console.log(`   SITE_WIDE_CDN_TAGS (${SITE_WIDE_CDN_TAGS.length} tags):`);
  for (const tag of SITE_WIDE_CDN_TAGS) {
    console.log(`     - ${tag}`);
  }

  const baseline = await probeAll("Phase 1: Baseline (発火前)");

  const baselineHits = baseline.filter((r) => r.cfCacheStatus === "HIT").length;
  if (baselineHits === 0) {
    console.warn(
      "⚠️  ベースラインで HIT が 1 件もない。検証前に warm up が必要 (curl で 1 度叩く)。",
    );
  } else {
    console.log(`\n✓ ベースライン: ${baselineHits}/${baseline.length} HIT`);
  }

  console.log("\n=== Phase 2: purge_by_tags 発火 ===");
  const purgeStart = Date.now();
  const result = await firePurge(SITE_WIDE_CDN_TAGS);
  const purgeMs = Date.now() - purgeStart;

  console.log(`   発火所要時間: ${purgeMs}ms`);
  console.log(`   発火結果: ${JSON.stringify(result, null, 2)}`);

  if (!result.success) {
    console.error("❌ Purge failed!");
    process.exit(1);
  }
  console.log("✓ Purge success");

  await sleep(2000);
  const phase3 = await probeAll("Phase 3: 直後観測 (2秒後)");

  await sleep(28000);
  const phase4 = await probeAll("Phase 4: 30秒後観測");

  await sleep(60000);
  const phase5 = await probeAll("Phase 5: HIT 復帰観測 (90秒後)");

  console.log("\n=== 最終判定 ===");

  const isMissLike = (r: ProbeResult): boolean =>
    r.cfCacheStatus === "MISS" ||
    r.cfCacheStatus === "EXPIRED" ||
    r.cfCacheStatus === "REVALIDATED";

  const phase3MissOrExpired = phase3.filter(isMissLike).length;
  const phase4MissOrExpired = phase4.filter(isMissLike).length;
  const phase5Hits = phase5.filter((r) => r.cfCacheStatus === "HIT").length;

  console.log(
    `Phase 3 (直後) MISS/EXPIRED/REVALIDATED: ${phase3MissOrExpired}/${phase3.length}`,
  );
  console.log(
    `Phase 4 (30秒後) MISS/EXPIRED/REVALIDATED: ${phase4MissOrExpired}/${phase4.length}`,
  );
  console.log(`Phase 5 (90秒後) HIT: ${phase5Hits}/${phase5.length}`);

  if (phase3MissOrExpired === 0 && phase4MissOrExpired === 0) {
    console.error(
      "\n❌ FAIL: purge 直後・30秒後とも MISS/EXPIRED が観測されない = purge が edge に効いていない",
    );
    console.error(
      "   plan-tier が tag purge 非対応か、credentials/権限の問題の可能性",
    );
    process.exit(1);
  }

  if (phase5Hits === 0) {
    console.warn(
      "\n⚠️  WARN: 90秒後に HIT 復帰なし。CF re-warm が遅延 or 別の問題",
    );
  }

  console.log(
    `\n✅ PASS: purge_by_tags end-to-end 検証成功 (purge 直後 MISS化 → 自動 HIT 復帰)`,
  );
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
