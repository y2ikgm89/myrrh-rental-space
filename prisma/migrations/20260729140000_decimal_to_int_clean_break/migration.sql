-- Decimal → Int clean-break (whole-% for tax rates, area stored as ㎡×100).
ALTER TABLE "settings_commerces"
  ALTER COLUMN "taxStandardRate" TYPE INT USING ROUND("taxStandardRate")::int,
  ALTER COLUMN "taxReducedRate" TYPE INT USING ROUND("taxReducedRate")::int;

ALTER TABLE "reservations" ALTER COLUMN "taxRate" TYPE INT USING ROUND("taxRate")::int;

ALTER TABLE "receipts" ALTER COLUMN "taxRate" TYPE INT USING ROUND("taxRate")::int;

ALTER TABLE "spaces" ALTER COLUMN "area" TYPE INT USING ROUND("area" * 100)::int;
