-- Remove postUrlPrefix column from settings table
-- This column was used for URL prefix customization but is no longer needed
-- All post URLs are now generated at the root level without prefix

ALTER TABLE "settings" DROP COLUMN IF EXISTS "postUrlPrefix";
