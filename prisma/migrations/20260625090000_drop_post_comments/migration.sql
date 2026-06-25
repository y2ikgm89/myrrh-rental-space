-- PostComment feature drop (writer 0 / public form not implemented / pre-release big-bang)
-- Removes the post_comments table along with all 8 dead indexes and FK constraints.
-- squawk-ignore ban-drop-table
DROP TABLE IF EXISTS "post_comments" CASCADE;
