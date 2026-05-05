-- 新フィールド追加（住所構造化 + 連絡可否フラグ）
ALTER TABLE "customers" ADD COLUMN "postalCode" VARCHAR(8);
ALTER TABLE "customers" ADD COLUMN "prefecture" VARCHAR(10);
ALTER TABLE "customers" ADD COLUMN "city" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN "streetAddress" VARCHAR(200);
ALTER TABLE "customers" ADD COLUMN "building" VARCHAR(200);
ALTER TABLE "customers" ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "phoneContactOptIn" BOOLEAN NOT NULL DEFAULT true;

-- 既存の単一行 address を streetAddress に退避（データ保全）
UPDATE "customers" SET "streetAddress" = "address" WHERE "address" IS NOT NULL;

-- 旧 address カラム削除（破壊的）
ALTER TABLE "customers" DROP COLUMN "address";
