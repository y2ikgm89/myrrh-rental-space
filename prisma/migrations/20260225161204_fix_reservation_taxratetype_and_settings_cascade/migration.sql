-- AlterTable: taxRateType String? → TaxRateType? (CAST でデータ保持)
ALTER TABLE "reservations"
  ALTER COLUMN "taxRateType" TYPE "TaxRateType"
  USING "taxRateType"::"TaxRateType";

-- AlterTable: Settings.cancellationTerms onDelete: SetNull を明示
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_cancellationTermsId_fkey";
ALTER TABLE "settings" ADD CONSTRAINT "settings_cancellationTermsId_fkey"
  FOREIGN KEY ("cancellationTermsId") REFERENCES "terms"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
