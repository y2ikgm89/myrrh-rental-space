-- ============================================================================
-- terms_scope_enum_overhaul
--
-- 旧 requiredAtReservation/Inquiry/Signup 3 boolean を TermsScope[] enum 配列に統合し、
-- TermsAgreement.context VARCHAR(64) を TermsScope enum 列に置換する破壊的改修。
-- 関連: PR #819 (refactor(terms)!: scope enum + consent gate + admin UX 全面刷新)
--
-- 前提: pre-release / アクティブユーザー無 / terms_agreements 行ゼロ
--   (.claude/rules/migrations.md L51 例外節 + memory project_cleanup-audit-2026-06-23)
--
-- 抑止コメントは per-statement で必要 (memory project_deep-audit-batch1-2026-06-25):
--   複数 DROP COLUMN を含む単一 ALTER TABLE は per-column 違反検出のため
--   ALTER TABLE 文を列ごとに分割する必要がある。
--   adding-required-field も pre-release で terms_agreements 行ゼロのため明示 ignore。
-- ============================================================================

-- CreateEnum
CREATE TYPE "TermsScope" AS ENUM ('LOGIN_SIGNUP', 'RESERVATION', 'INQUIRY', 'EVENT_REGISTRATION');

-- DropIndex (context VARCHAR の旧複合インデックス)
DROP INDEX "terms_agreements_context_agreedAt_idx";

-- AlterTable: terms_agreements
-- squawk-ignore ban-drop-column
ALTER TABLE "terms_agreements" DROP COLUMN "context";
-- squawk-ignore adding-required-field
ALTER TABLE "terms_agreements" ADD COLUMN "scope" "TermsScope" NOT NULL;

-- AlterTable: terms_documents — 3 boolean DROP + scopes[] / changelog ADD
-- squawk-ignore ban-drop-column
ALTER TABLE "terms_documents" DROP COLUMN "requiredAtInquiry";
-- squawk-ignore ban-drop-column
ALTER TABLE "terms_documents" DROP COLUMN "requiredAtReservation";
-- squawk-ignore ban-drop-column
ALTER TABLE "terms_documents" DROP COLUMN "requiredAtSignup";
ALTER TABLE "terms_documents" ADD COLUMN "changelog" TEXT;
ALTER TABLE "terms_documents" ADD COLUMN "scopes" "TermsScope"[];

-- CreateIndex (scope enum の新複合インデックス)
CREATE INDEX "terms_agreements_scope_agreedAt_idx" ON "terms_agreements"("scope", "agreedAt");
