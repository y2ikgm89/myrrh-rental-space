-- Clean-break audit log integrity.
--
-- Existing audit_logs rows cannot be safely backfilled into an HMAC chain
-- inside a Prisma migration because the HMAC key must live outside the
-- database. Reset the table so every row after this migration participates in
-- the same mandatory append-only hash chain.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPORT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INTEGRITY_CHECK';

DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";
DROP TRIGGER IF EXISTS audit_logs_no_delete ON "audit_logs";

TRUNCATE TABLE "audit_logs";

-- Clean-break: audit_logs was truncated above, so these required columns do
-- not backfill existing rows and cannot break old audit rows during rollout.
-- squawk-ignore adding-not-nullable-field
-- squawk-ignore adding-required-field
ALTER TABLE "audit_logs"
  ADD COLUMN "sequence" BIGINT NOT NULL,
  ADD COLUMN "previousHash" CHAR(64) NOT NULL,
  ADD COLUMN "entryHash" CHAR(64) NOT NULL,
  ADD COLUMN "hashAlgorithm" VARCHAR(32) NOT NULL DEFAULT 'HMAC-SHA256',
  ADD COLUMN "hashKeyId" VARCHAR(32) NOT NULL DEFAULT 'v1',
  ADD COLUMN "chainVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_sequence_key" UNIQUE ("sequence"),
  ADD CONSTRAINT "audit_logs_previous_hash_hex_check"
    CHECK ("previousHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "audit_logs_entry_hash_hex_check"
    CHECK ("entryHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "audit_logs_hash_algorithm_check"
    CHECK ("hashAlgorithm" = 'HMAC-SHA256'),
  ADD CONSTRAINT "audit_logs_hash_key_id_check"
    CHECK ("hashKeyId" ~ '^[A-Za-z0-9_-]{1,32}$'),
  ADD CONSTRAINT "audit_logs_chain_version_check"
    CHECK ("chainVersion" = 1);

CREATE INDEX "audit_logs_hashKeyId_sequence_idx"
  ON "audit_logs"("hashKeyId", "sequence");

CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('myrrh.audit_log_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_logs_mutation();

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_logs_mutation();
