-- Cloudflare CDN credentials (Zone ID / API Token / last-tested / status) を
-- env-only に移行 (CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN)。
-- 理由: admin UI 経由の bootstrap silent no-op を構造的に解消 (purge_by_tags が
-- credentials 未設定で no-op して Cloudflare エッジが長時間 stale を配信していた)
-- ＋ 12-factor / Secret Manager パターンへの整合 (他 infra secret と統一)。
-- pre-release / single-instance 構成 (Cloud Run min0/max1) で big-bang DROP を許容。
-- 設計 SSoT: memory project_cloudflare-credentials-env-only-2026-06-22。
--
-- squawk-ignore は per-statement で付与する必要があるため (rule: .claude/rules/migrations.md)、
-- Prisma 既定の単一 ALTER TABLE multi-DROP は分割している。

-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cloudflareApiToken";

-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cloudflareConnectionStatus";

-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cloudflareLastTestedAt";

-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cloudflareZoneId";
