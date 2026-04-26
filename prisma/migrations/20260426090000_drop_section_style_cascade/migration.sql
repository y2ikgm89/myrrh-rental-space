-- Clean break: remove admin-editable SectionStyle cascade.
-- Public section design is now code-owned via fixed section templates.

ALTER TABLE "sections" DROP CONSTRAINT IF EXISTS "sections_styleId_fkey";
ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_pageStyleId_fkey";
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_globalSectionStyleId_fkey";

DROP INDEX IF EXISTS "sections_styleId_idx";
DROP INDEX IF EXISTS "pages_pageStyleId_idx";
DROP INDEX IF EXISTS "settings_globalSectionStyleId_idx";

ALTER TABLE "sections" DROP COLUMN IF EXISTS "styleId";
ALTER TABLE "sections" DROP COLUMN IF EXISTS "styleOverride";
ALTER TABLE "pages" DROP COLUMN IF EXISTS "pageStyleId";
ALTER TABLE "settings" DROP COLUMN IF EXISTS "globalSectionStyleId";

DROP TABLE IF EXISTS "section_styles";
