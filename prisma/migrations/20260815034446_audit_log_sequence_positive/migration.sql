BEGIN;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_sequence_positive_check" CHECK (("sequence" > 0));

COMMIT;
