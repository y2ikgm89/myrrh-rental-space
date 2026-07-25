-- AdminNotification.resourceId: UUID 専用 → VARCHAR(36)
-- Event / EventRegistration は cuid のため、旧 UUID 列では deep link 不能だった。
-- 既存 UUID 値は text へキャストして保全する。
-- squawk-ignore changing-column-type
ALTER TABLE "admin_notification"
  ALTER COLUMN "resourceId" SET DATA TYPE VARCHAR(36)
  USING ("resourceId"::text);

-- CUSTOMER_FLAGGED を risk / duplicate に clean-break 分割（既存行を再ラベル）
UPDATE "admin_notification"
SET "type" = 'customer_duplicate_flagged'
WHERE "type" = 'customer_flagged'
  AND "title" LIKE '%重複%';

UPDATE "admin_notification"
SET "type" = 'customer_risk_flagged'
WHERE "type" = 'customer_flagged';
