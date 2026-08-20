BEGIN;

-- CreateIndex
CREATE INDEX "events_calendar_sync_error_idx" ON "events"("calendar_sync_error") WHERE ("calendar_sync_error" IS NOT NULL AND "deleted_at" IS NULL);

-- CreateIndex
CREATE INDEX "reservations_calendar_sync_error_idx" ON "reservations"("calendar_sync_error") WHERE ("calendar_sync_error" IS NOT NULL AND "deleted_at" IS NULL);

COMMIT;
