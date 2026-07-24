-- FaqCategory.slug / Location.slug と同型: slug が無条件 @unique だと、ソフト
-- デリート済みイベントが残る限り同じ slug での再作成が永久に CONFLICT になる。
-- deletedAt IS NULL な行の間でのみ一意性を強制する partial unique index に置き換える。

-- DropIndex
DROP INDEX "events_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_active_key" ON "events"("slug") WHERE ("deletedAt" IS NULL);
