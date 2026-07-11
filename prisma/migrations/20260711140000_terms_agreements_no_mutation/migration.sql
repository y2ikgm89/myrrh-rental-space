-- Enforce append-only semantics for terms_agreements at the database layer.
--
-- TermsAgreement is a legal-consent evidence record: the row captures a
-- customer's agreement to a specific terms snapshot at a specific time. Any
-- update or delete corrupts the evidence chain. The application layer already
-- treats the table as append-only, but until this migration the guarantee was
-- carried only by ESLint and architecture-boundary grep gates — a mistake in
-- `$executeRaw`, a rogue admin migration, or a gate-bypassing PR could silently
-- mutate legal records without leaving a paper trail.
--
-- Mirror the audit_logs trigger from 20260703000000_audit_log_hash_chain:
-- BEFORE UPDATE / BEFORE DELETE trigger raises `integrity_constraint_violation`
-- unless the session sets the `myrrh.terms_agreement_mutation_bypass` GUC to
-- the literal `'seed'`. That GUC is set only via `set_config(..., true)` inside
-- an explicit transaction, so it never persists across connections.

CREATE OR REPLACE FUNCTION public.prevent_terms_agreements_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('myrrh.terms_agreement_mutation_bypass', true) = 'seed' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'terms_agreements is append-only; % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS terms_agreements_no_update ON "terms_agreements";
DROP TRIGGER IF EXISTS terms_agreements_no_delete ON "terms_agreements";

CREATE TRIGGER terms_agreements_no_update
BEFORE UPDATE ON "terms_agreements"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_terms_agreements_mutation();

CREATE TRIGGER terms_agreements_no_delete
BEFORE DELETE ON "terms_agreements"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_terms_agreements_mutation();
