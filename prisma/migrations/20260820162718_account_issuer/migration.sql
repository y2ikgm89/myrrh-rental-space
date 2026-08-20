-- Better Auth 1.7 は Account を (issuer, account_id) で識別する。
-- 既存行は同一トランザクション内で backfill してから NOT NULL にする。
-- credential / google / line の issuer は better-auth@1.7.1 の accountIssuer。
-- SET NOT NULL は計画ダウンタイム対象。旧 revision は issuer を書かない。
-- squawk-ignore-file adding-not-nullable-field
-- リハーサル: bun scripts/migration-preconditions.ts
BEGIN;

ALTER TABLE "accounts" ADD COLUMN "issuer" VARCHAR(255);

UPDATE "accounts"
SET
  "issuer" = 'local:credential',
  "account_id" = "user_id"
WHERE "provider_id" = 'credential';

UPDATE "accounts"
SET "issuer" = 'https://accounts.google.com'
WHERE "provider_id" = 'google';

UPDATE "accounts"
SET "issuer" = 'https://access.line.me'
WHERE "provider_id" = 'line';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "accounts" WHERE "issuer" IS NULL) THEN
    RAISE EXCEPTION 'accounts.issuer backfill incomplete: unknown provider_id present';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "accounts"
    GROUP BY "issuer", "account_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'accounts identity collision on (issuer, account_id)';
  END IF;
END $$;

ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;

CREATE UNIQUE INDEX "accounts_issuer_account_id_key" ON "accounts"("issuer", "account_id");

COMMIT;
