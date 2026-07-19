-- Tier 1 → Tier 2 migration for RESEND_WEBHOOK_SECRET.
--
-- 従来 svix 署名検証秘密は Cloud Run env (`RESEND_WEBHOOK_SECRET`, Secret Manager)
-- のみで管理していたが、[[project_integration-secrets-two-tier-split-2026-07-06]]
-- で確定した「operator が admin UI から rotate/test する秘密は DB 暗号化保存 +
-- admin UI 管理」パターン (stripeWebhookSecret と同型) に統一する。
--
-- 破壊的変更: なし (nullable ADD 単体)。既存行は NULL のまま影響なし。
-- 送信経路: `getResendWebhookSecret()` が DB 優先 → env fallback で解決する。

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "resendWebhookSecret" TEXT;
