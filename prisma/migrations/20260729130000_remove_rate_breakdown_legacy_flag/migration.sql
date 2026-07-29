-- Remove obsolete `legacy` key from rateBreakdownJson snapshots.
-- Rate-plan backfill rows keep empty segments; receipt amounts use totalPriceWithTax.
UPDATE "reservations"
SET "rateBreakdownJson" = "rateBreakdownJson" - 'legacy'
WHERE "rateBreakdownJson" ? 'legacy';
