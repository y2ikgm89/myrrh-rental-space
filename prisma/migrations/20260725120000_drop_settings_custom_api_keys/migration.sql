-- Clean-break: remove unused Custom API Keys settings singleton.
-- Encrypted customApiKeys JSON is intentionally discarded (no runtime consumers).
-- Breaking: DROP TABLE settings_custom_api_keys. Triggers planned-downtime deploy mode.
-- squawk-ignore ban-drop-table
DROP TABLE "settings_custom_api_keys";
