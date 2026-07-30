-- NOTE: Prisma's auto-generated diff for this migration also proposed
--   DROP INDEX "reservation_series_space_dtstart_active_unique";
-- This is a known, unrelated false-positive: ReservationSeries.deletedAt-scoped
-- partial UNIQUE index is hand-written raw SQL in 20260717010625_add_reservation_series
-- (see schema.prisma's ReservationSeries model comment), which Prisma's schema
-- diffing does not recognize as matching its own non-unique @@index declaration.
-- Intentionally dropped from this migration; unrelated to the Refund.status change below.

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'succeeded';

-- Value-domain guard, mirroring the existing refunds_refundedByType_check pattern
-- (20260715130050_refactor_refund_to_child_table). Stripe's Node SDK types
-- Refund.status as `string | null` (not a literal union), so the app layer gets
-- no compile-time narrowing here; enforce the known Stripe refund lifecycle
-- values at the DB layer as defense-in-depth.
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_check" CHECK (
  "status" IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')
);

-- Relax the append-only trigger (20260724110000_refunds_no_mutation) to allow
-- status-only transitions. Stripe resolves konbini/customer_balance refunds
-- asynchronously (up to 45 days); the refund.updated webhook must be able to
-- move status from its initial "pending" to "succeeded"/"failed" once Stripe
-- confirms the outcome. Every other column remains immutable: this trigger
-- explicitly re-checks that OLD and NEW agree on every column except status
-- before allowing the UPDATE through, and DELETE is still unconditionally
-- rejected for all rows.
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

  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW."reservationId" IS NOT DISTINCT FROM OLD."reservationId"
     AND NEW."eventRegistrationId" IS NOT DISTINCT FROM OLD."eventRegistrationId"
     AND NEW.amount = OLD.amount
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW."stripeRefundId" = OLD."stripeRefundId"
     AND NEW."refundedByType" = OLD."refundedByType"
     AND NEW."createdAt" = OLD."createdAt"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'refunds is append-only (status is the only mutable column); % is not allowed', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
