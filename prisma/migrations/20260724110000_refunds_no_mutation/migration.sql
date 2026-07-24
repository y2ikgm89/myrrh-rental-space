-- Enforce append-only semantics for refunds at the database layer.
--
-- Refund is a payment-evidence child record: each row captures one Stripe refund
-- event tied to a reservation or event registration. Any update or delete corrupts
-- the cumulative refund audit trail. The application layer already treats the
-- table as append-only, but until this migration the guarantee was carried only
-- by convention — a mistake in test cleanup, a rogue admin migration, or a
-- gate-bypassing PR could silently mutate financial records.
--
-- Mirror the terms_agreements trigger from 20260711140000_terms_agreements_no_mutation:
-- BEFORE UPDATE / BEFORE DELETE trigger raises `integrity_constraint_violation`
-- unless the session sets the `myrrh.refund_mutation_bypass` GUC to the literal
-- `'seed'`. That GUC is set only via `set_config(..., true)` inside an explicit
-- transaction, so it never persists across connections.

CREATE OR REPLACE FUNCTION public.prevent_refunds_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('myrrh.refund_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'refunds is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS refunds_no_update ON "refunds";
DROP TRIGGER IF EXISTS refunds_no_delete ON "refunds";

CREATE TRIGGER refunds_no_update
BEFORE UPDATE ON "refunds"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_refunds_mutation();

CREATE TRIGGER refunds_no_delete
BEFORE DELETE ON "refunds"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_refunds_mutation();
