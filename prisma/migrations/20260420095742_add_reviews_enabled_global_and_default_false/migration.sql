-- Multi-tenant feature gate for reviews (global + per-space)

-- Step 1: Add reviewsEnabledGlobal to Settings (default true = existing behavior preserved)
ALTER TABLE settings ADD COLUMN "reviewsEnabledGlobal" BOOLEAN NOT NULL DEFAULT true;

-- Step 2: Change Space.reviewsEnabled default from true to false (new spaces opt-in)
--         Existing row values are preserved (admin's per-space choices remain intact)
ALTER TABLE spaces ALTER COLUMN "reviewsEnabled" SET DEFAULT false;
