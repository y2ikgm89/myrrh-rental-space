-- Space Rate Plan: 曜日別 / 時間帯別 / 特定期間 / 祝日料金プラン。
-- 既存 Reservation の価格・税カラムを NOT NULL 化するため、SET NOT NULL の前に
-- 既存行への backfill を実行する（breaking migration、CI が DROP COLUMN を検知して
-- 計画ダウンタイム付きデプロイに自動切替する。.github/workflows/deploy-production.yml 参照）。
-- 詳細設計: docs/superpowers/specs/2026-07-14-space-rate-plan-design.md

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "HolidayMode" AS ENUM ('any', 'only', 'exclude');

-- AlterTable
-- 新規カラムはまず nullable で追加し、backfill 後に NOT NULL 化する。
ALTER TABLE "reservations" ADD COLUMN "priceOverriddenBy" TEXT,
ADD COLUMN "rateBreakdownJson" JSONB;

-- Backfill: 既存 Reservation 行の必須化予定カラムを埋める。
-- rate plan 導入前の予約には taxRateType/taxRate/taxAmount/totalPriceWithTax/
-- rateBreakdownJson が存在しないため、Settings.taxStandardRate（無ければ 10%）で
-- 税額を再計算し、rateBreakdownJson には legacy フラグ付きの空 breakdown を書き込む。
-- legacy フラグは isLegacyRateBreakdown() が true 判定する形（{ legacy: true, segments: [],
-- totalHours: 0, totalBasePrice: 0, holidayFlags: {} }、src/shared/lib/pricing/rate-breakdown.ts）。
-- 読み出し側（receipts/issue.ts 等）は legacy 検知時に totalPrice フォールバックを維持する。
-- basePrice/totalPrice は本 migration 作成時点で NULL 0 件だが、再実行安全性のため
-- 同じ COALESCE パターンで統一する。
DO $$
DECLARE
  standard_rate DECIMAL(5,2);
BEGIN
  SELECT "taxStandardRate" INTO standard_rate FROM "settings" LIMIT 1;
  standard_rate := COALESCE(standard_rate, 10);

  UPDATE "reservations"
  SET
    "taxRateType" = COALESCE("taxRateType", 'standard'::"TaxRateType"),
    "taxRate" = COALESCE("taxRate", standard_rate),
    "basePrice" = COALESCE("basePrice", COALESCE("totalPrice", 0)),
    "totalPrice" = COALESCE("totalPrice", 0),
    "taxAmount" = COALESCE("taxAmount", ROUND(COALESCE("totalPrice", 0) * COALESCE("taxRate", standard_rate) / 100)::int),
    "totalPriceWithTax" = COALESCE("totalPriceWithTax", COALESCE("totalPrice", 0) + COALESCE("taxAmount", ROUND(COALESCE("totalPrice", 0) * COALESCE("taxRate", standard_rate) / 100)::int)),
    "rateBreakdownJson" = COALESCE(
      "rateBreakdownJson",
      jsonb_build_object(
        'schemaVersion', 1,
        'segments', '[]'::jsonb,
        'totalHours', 0,
        'totalBasePrice', 0,
        'holidayFlags', '{}'::jsonb,
        'legacy', true
      )
    );
END $$;

-- AlterTable
-- 直前の backfill で全行埋まっているため NOT NULL 化する。squawk は複合 ALTER TABLE 内の
-- ALTER COLUMN 句をそれぞれ個別に検出するため、列ごとに文を分割し ignore コメントを付す。
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "reservations" ALTER COLUMN "totalPrice" SET NOT NULL;
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "reservations" ALTER COLUMN "basePrice" SET NOT NULL;
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "reservations" ALTER COLUMN "taxRateType" SET NOT NULL;
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "reservations" ALTER COLUMN "taxRate" SET NOT NULL;
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "reservations" ALTER COLUMN "taxAmount" SET NOT NULL;
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "reservations" ALTER COLUMN "totalPriceWithTax" SET NOT NULL;
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "reservations" ALTER COLUMN "rateBreakdownJson" SET NOT NULL;

-- AlterTable
-- 意図的な破壊的変更: SpaceRatePlan 導入に伴い未使用カラムを削除する
-- （旧参照は SpaceEditForm.tsx / spaceFormSchema から同一 PR 内で除去済み — Task 12 参照）。
-- squawk-ignore ban-drop-column
ALTER TABLE "spaces" DROP COLUMN "dailyPrice";

-- CreateTable
CREATE TABLE "space_rate_plans" (
    "id" VARCHAR(30) NOT NULL,
    "spaceId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "hourlyPrice" DECIMAL(10,2) NOT NULL,
    "daysOfWeek" "DayOfWeek"[],
    "holidayMode" "HolidayMode" NOT NULL DEFAULT 'any',
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "space_rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "space_rate_plans_spaceId_updatedAt_idx" ON "space_rate_plans"("spaceId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
-- Prisma 7 は `@@check` 属性を持たない（GitHub prisma/prisma#3388 未実装、2026-07-14 時点で
-- context7 / 公式ドキュメント確認済み）ため、schema.prisma の SpaceRatePlan model doc comment
-- に記載の 4 制約を手書きする。`prisma db pull` は CHECK 制約を取り込まないため、
-- introspection で再生成する場合は本ブロックを手で復元すること（BlockedDate と同じ注意点）。
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_hourlyPrice_non_negative_check" CHECK ("hourlyPrice" >= 0);
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_startTime_format_check" CHECK ("startTime" IS NULL OR "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_endTime_format_check" CHECK ("endTime" IS NULL OR "endTime" ~ '^([01][0-9]|2[0-3]|24):[0-5][0-9]$');
ALTER TABLE "space_rate_plans" ADD CONSTRAINT "space_rate_plans_effective_range_check" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");
