-- Drop retired freeform page builder storage.
-- Content-managed pages now use Page + Section only.
DROP TABLE IF EXISTS "page_freeform_revisions";
DROP TABLE IF EXISTS "page_freeform_states";
