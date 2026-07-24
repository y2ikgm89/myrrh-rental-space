-- Phase 3: split organization, commerce, notification, and reservation settings out of settings singleton.
-- Spec: docs/superpowers/specs/2026-07-24-settings-schema-split-design.md
--
-- Breaking: DROP COLUMN on settings. Triggers planned-downtime deploy mode.

-- CreateTable
CREATE TABLE "settings_organizations" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessName" TEXT,
    "businessNameKana" TEXT,
    "representativeName" TEXT,
    "establishedDate" TIMESTAMP(3),
    "registrationNumber" TEXT,
    "invoiceNumber" TEXT,
    "businessDescription" TEXT,
    "phoneNumber" TEXT,
    "faxNumber" TEXT,
    "email" TEXT,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "streetAddress" TEXT,
    "buildingName" TEXT,
    "businessHours" JSONB,
    "regularHolidays" JSONB,
    "holidayNotice" TEXT,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "replyToEmail" TEXT,

    CONSTRAINT "settings_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_commerces" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "durationDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
    "durationDiscountRules" JSONB NOT NULL DEFAULT '[]',
    "discountCombinationMode" "DiscountCombinationMode" NOT NULL DEFAULT 'best',
    "showOriginalPrice" BOOLEAN NOT NULL DEFAULT true,
    "taxStandardRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "taxReducedRate" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "taxDisplayModePublic" "TaxDisplayMode" NOT NULL DEFAULT 'tax_included',
    "refundPolicy" JSONB,

    CONSTRAINT "settings_commerces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_notifications" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notifyNewReservation" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationChange" BOOLEAN NOT NULL DEFAULT true,
    "notifyReservationCancel" BOOLEAN NOT NULL DEFAULT true,
    "notifyNewInquiry" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventRegistration" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventWaitlistRegistration" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventCancellation" BOOLEAN NOT NULL DEFAULT true,
    "notifyEventReminder" BOOLEAN NOT NULL DEFAULT false,
    "notificationStaffIds" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    "notificationEmailAddresses" TEXT[] NOT NULL DEFAULT ARRAY[]::text[],

    CONSTRAINT "settings_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_reservations" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "defaultTimeSlot" INTEGER NOT NULL DEFAULT 60,
    "minReservationDuration" INTEGER NOT NULL DEFAULT 60,
    "maxReservationDuration" INTEGER NOT NULL DEFAULT 480,
    "sendReservationConfirmationEmail" BOOLEAN NOT NULL DEFAULT true,
    "maxRecurrenceInstances" INTEGER NOT NULL DEFAULT 26,
    "customerCanCancelSeriesInFull" BOOLEAN NOT NULL DEFAULT false,
    "cancellationDeadlineHours" INTEGER NOT NULL DEFAULT 24,
    "modificationDeadlineHours" INTEGER NOT NULL DEFAULT 24,

    CONSTRAINT "settings_reservations_pkey" PRIMARY KEY ("id")
);

-- Copy existing singleton row
INSERT INTO "settings_organizations" (
    "id",
    "createdAt",
    "updatedAt",
    "businessName",
    "businessNameKana",
    "representativeName",
    "establishedDate",
    "registrationNumber",
    "invoiceNumber",
    "businessDescription",
    "phoneNumber",
    "faxNumber",
    "email",
    "postalCode",
    "prefecture",
    "city",
    "streetAddress",
    "buildingName",
    "businessHours",
    "regularHolidays",
    "holidayNotice",
    "senderEmail",
    "senderName",
    "replyToEmail"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."businessName",
    s."businessNameKana",
    s."representativeName",
    s."establishedDate",
    s."registrationNumber",
    s."invoiceNumber",
    s."businessDescription",
    s."phoneNumber",
    s."faxNumber",
    s."email",
    s."postalCode",
    s."prefecture",
    s."city",
    s."streetAddress",
    s."buildingName",
    s."businessHours",
    s."regularHolidays",
    s."holidayNotice",
    s."senderEmail",
    s."senderName",
    s."replyToEmail"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_commerces" (
    "id",
    "createdAt",
    "updatedAt",
    "durationDiscountEnabled",
    "durationDiscountRules",
    "discountCombinationMode",
    "showOriginalPrice",
    "taxStandardRate",
    "taxReducedRate",
    "taxDisplayModePublic",
    "refundPolicy"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."durationDiscountEnabled",
    s."durationDiscountRules",
    s."discountCombinationMode",
    s."showOriginalPrice",
    s."taxStandardRate",
    s."taxReducedRate",
    s."taxDisplayModePublic",
    s."refundPolicy"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_notifications" (
    "id",
    "createdAt",
    "updatedAt",
    "notifyNewReservation",
    "notifyReservationChange",
    "notifyReservationCancel",
    "notifyNewInquiry",
    "notifyEventRegistration",
    "notifyEventWaitlistRegistration",
    "notifyEventCancellation",
    "notifyEventReminder",
    "notificationStaffIds",
    "notificationEmailAddresses"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."notifyNewReservation",
    s."notifyReservationChange",
    s."notifyReservationCancel",
    s."notifyNewInquiry",
    s."notifyEventRegistration",
    s."notifyEventWaitlistRegistration",
    s."notifyEventCancellation",
    s."notifyEventReminder",
    s."notificationStaffIds",
    s."notificationEmailAddresses"
FROM "settings" s
WHERE s."id" = 'singleton';

INSERT INTO "settings_reservations" (
    "id",
    "createdAt",
    "updatedAt",
    "defaultTimeSlot",
    "minReservationDuration",
    "maxReservationDuration",
    "sendReservationConfirmationEmail",
    "maxRecurrenceInstances",
    "customerCanCancelSeriesInFull",
    "cancellationDeadlineHours",
    "modificationDeadlineHours"
)
SELECT
    'singleton',
    s."createdAt",
    s."updatedAt",
    s."defaultTimeSlot",
    s."minReservationDuration",
    s."maxReservationDuration",
    s."sendReservationConfirmationEmail",
    s."maxRecurrenceInstances",
    s."customerCanCancelSeriesInFull",
    s."cancellationDeadlineHours",
    s."modificationDeadlineHours"
FROM "settings" s
WHERE s."id" = 'singleton';

-- Default singleton rows when settings row is absent (empty DB / partial seed)
INSERT INTO "settings_organizations" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_organizations" WHERE "id" = 'singleton'
);

INSERT INTO "settings_commerces" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_commerces" WHERE "id" = 'singleton'
);

INSERT INTO "settings_notifications" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_notifications" WHERE "id" = 'singleton'
);

INSERT INTO "settings_reservations" ("id", "createdAt", "updatedAt")
SELECT 'singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "settings_reservations" WHERE "id" = 'singleton'
);

ALTER TABLE "settings_commerces"
    ADD CONSTRAINT "SettingsCommerce_durationDiscountRules_array_check"
        CHECK (jsonb_typeof("durationDiscountRules") = 'array');

ALTER TABLE "settings_notifications"
    ADD CONSTRAINT "SettingsNotification_notificationStaffIds_text_array_check"
        CHECK (
            array_position("notificationStaffIds", NULL) IS NULL
            AND array_position("notificationStaffIds", '') IS NULL
        );

ALTER TABLE "settings_notifications"
    ADD CONSTRAINT "SettingsNotification_notificationEmailAddresses_text_array_check"
        CHECK (
            array_position("notificationEmailAddresses", NULL) IS NULL
            AND array_position("notificationEmailAddresses", '') IS NULL
        );

-- AlterTable (breaking clean-break)
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "businessName";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "businessNameKana";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "representativeName";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "establishedDate";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "registrationNumber";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "invoiceNumber";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "businessDescription";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "phoneNumber";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "faxNumber";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "email";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "postalCode";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "prefecture";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "city";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "streetAddress";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "buildingName";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "businessHours";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "regularHolidays";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "holidayNotice";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "senderEmail";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "senderName";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "replyToEmail";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "defaultTimeSlot";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "minReservationDuration";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "maxReservationDuration";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "sendReservationConfirmationEmail";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "maxRecurrenceInstances";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "customerCanCancelSeriesInFull";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "durationDiscountEnabled";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "durationDiscountRules";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "discountCombinationMode";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "showOriginalPrice";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "taxStandardRate";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "taxReducedRate";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "taxDisplayModePublic";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyNewReservation";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyReservationChange";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyReservationCancel";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyNewInquiry";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyEventRegistration";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyEventWaitlistRegistration";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyEventCancellation";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notifyEventReminder";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notificationStaffIds";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "notificationEmailAddresses";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "refundPolicy";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "cancellationDeadlineHours";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "modificationDeadlineHours";
