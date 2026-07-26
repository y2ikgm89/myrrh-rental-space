-- Soft-deleted Space rows must not permanently reserve slug values.
-- Mirror Location.slug / SpaceCategory.name: unique only among isActive = true.

-- DropIndex
DROP INDEX "spaces_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_active_key" ON "spaces"("slug") WHERE ("isActive" = true);
