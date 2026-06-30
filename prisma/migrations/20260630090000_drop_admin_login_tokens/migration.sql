-- Contract phase: Cloud Run IAP now owns the admin entry boundary, and the
-- application no longer reads or writes admin login tokens.
-- squawk-ignore ban-drop-table
DROP TABLE IF EXISTS "login_tokens";
