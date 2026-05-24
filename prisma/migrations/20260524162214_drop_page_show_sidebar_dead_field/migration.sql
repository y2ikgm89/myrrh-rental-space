-- Drop Page.showSidebar dead column
--
-- Pre-check: SELECT COUNT(*) FROM pages WHERE "showSidebar" IS NOT NULL → 0 / 50 (100% NULL).
-- Admin UI edit path was removed in PR #225 (updatePage Server Action deletion).
-- getPageShowSidebar(slug) always returned null, BlogLayout fallback chain always
-- resolved to settings.enabled (global sidebar settings).
--
-- All sidebar rendering is now driven by Settings.sidebarWidgets / sidebarEnabled
-- (global). ArticleLayout component-level showSidebar={false} prop (terms pages)
-- is independent of this column and is preserved.

ALTER TABLE "pages" DROP COLUMN "showSidebar";
