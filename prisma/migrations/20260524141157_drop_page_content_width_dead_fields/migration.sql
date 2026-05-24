-- Drop Page.contentWidth / Page.contentWidthCustom dead fields
--
-- These columns were declared in schema but never read by any public render path
-- (see audit in PR before this migration). admin UI also had no edit affordance
-- after the removal of the legacy updatePage Server Action (PR #225).
--
-- showSidebar is kept because getPageShowSidebar(slug) is still used by the
-- post-list archive section variant.

ALTER TABLE "pages" DROP COLUMN "contentWidth";
ALTER TABLE "pages" DROP COLUMN "contentWidthCustom";
