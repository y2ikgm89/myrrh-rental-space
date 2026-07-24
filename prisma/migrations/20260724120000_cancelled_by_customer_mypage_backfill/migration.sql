-- Backfill legacy cancelledByType value CUSTOMER → CUSTOMER_MYPAGE before removing
-- the CANCELLED_BY.CUSTOMER alias from application code.

UPDATE "reservations"
SET "cancelledByType" = 'CUSTOMER_MYPAGE'
WHERE "cancelledByType" = 'CUSTOMER';

UPDATE "reservation_series"
SET "cancelledByType" = 'CUSTOMER_MYPAGE'
WHERE "cancelledByType" = 'CUSTOMER';

UPDATE "event_registrations"
SET "cancelledByType" = 'CUSTOMER_MYPAGE'
WHERE "cancelledByType" = 'CUSTOMER';
