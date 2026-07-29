-- Phase 7 follow-up: admin search / suppression lookup indexes (additive only).

CREATE INDEX "terms_agreements_guest_email_trgm_idx"
  ON "terms_agreements" USING GIN ("guestEmail" gin_trgm_ops);

CREATE INDEX "customers_suppressed_email_hash_idx"
  ON "customers" ("suppressedEmailHash")
  WHERE "suppressedEmailHash" IS NOT NULL;
