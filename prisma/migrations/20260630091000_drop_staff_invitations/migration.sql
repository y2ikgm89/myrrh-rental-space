-- Remove obsolete app-managed staff credentials before dropping invitation tokens.
DELETE FROM "account"
WHERE "providerId" = 'credential'
  AND "userId" IN (
    SELECT "id"
    FROM "user"
    WHERE "role" IN ('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER')
  );

-- squawk-ignore ban-drop-table
DROP TABLE IF EXISTS "staff_invitations";
