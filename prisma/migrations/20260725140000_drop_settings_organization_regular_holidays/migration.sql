-- Clean-break: drop redundant regularHolidays from settings_organizations.
-- Public site and admin UI derive closed weekdays from businessHours.isOpen only.
-- Breaking: DROP COLUMN regularHolidays. Triggers planned-downtime deploy mode.
-- squawk-ignore ban-drop-column
ALTER TABLE "settings_organizations" DROP COLUMN "regularHolidays";
