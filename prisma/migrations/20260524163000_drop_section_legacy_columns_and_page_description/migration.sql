-- Drop Section.title / content / contentJson + Page.description dead columns
--
-- Pre-check (verified before migration):
--   * Page.description non-NULL: 10 / 50 (seed-only SystemPageDefinition values,
--     no admin UI edit path, no public render usage)
--   * Section.title non-NULL: 6 / 26 (legacy, only CUSTOM type uses for render)
--   * Section.content (mapped from contentHtml) non-NULL: 1 / 26 (CUSTOM only)
--   * Section.contentJson non-NULL: 0 / 26 (completely dead, write path existed
--     but never used)
--
-- Design changes (companion code changes in same PR):
--   * customConfigSchema gains title + body fields (admin UI now edits via
--     AutoSectionForm config inputs instead of section.title / contentHtml columns)
--   * Section.title / content / contentJson columns dropped
--   * Page.description column dropped (was only set by seed, never edited or rendered)
--
-- Data migration: preserve existing CUSTOM section content by merging
-- title + content into config JSON before dropping columns.

UPDATE "sections"
SET "config" = jsonb_set(
  jsonb_set(
    COALESCE("config", '{}'::jsonb),
    '{title}',
    to_jsonb(COALESCE("title", ''))
  ),
  '{body}',
  to_jsonb(COALESCE("content", ''))
)
WHERE type = 'custom'
  AND ("title" IS NOT NULL OR "content" IS NOT NULL);

ALTER TABLE "sections" DROP COLUMN "title";
ALTER TABLE "sections" DROP COLUMN "content";
ALTER TABLE "sections" DROP COLUMN "contentJson";

ALTER TABLE "pages" DROP COLUMN "description";
