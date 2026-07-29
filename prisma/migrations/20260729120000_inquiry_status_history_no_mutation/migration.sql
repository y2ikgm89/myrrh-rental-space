-- Enforce append-only semantics for inquiry_status_history at the database layer.
--
-- InquiryStatusHistory is an audit trail for inquiry status transitions. Any
-- update or delete corrupts the evidence chain. The application layer already
-- treats the table as append-only, but until this migration the guarantee was
-- carried only by schema comments and convention.
--
-- Bypass GUC `myrrh.inquiry_status_history_mutation_bypass`:
-- - `'seed'`: test/seed cleanup (same pattern as terms_agreements / refunds)
-- - `'purge'`: data-retention cron hard-deletes inquiries; CASCADE would delete
--   status history rows — purge path sets this GUC before deleteMany.

CREATE OR REPLACE FUNCTION public.prevent_inquiry_status_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('myrrh.inquiry_status_history_mutation_bypass', true) IN ('seed', 'purge') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'inquiry_status_history is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS inquiry_status_history_no_update ON "inquiry_status_history";
DROP TRIGGER IF EXISTS inquiry_status_history_no_delete ON "inquiry_status_history";

CREATE TRIGGER inquiry_status_history_no_update
BEFORE UPDATE ON "inquiry_status_history"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inquiry_status_history_mutation();

CREATE TRIGGER inquiry_status_history_no_delete
BEFORE DELETE ON "inquiry_status_history"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inquiry_status_history_mutation();
