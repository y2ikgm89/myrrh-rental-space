-- Round-Access audit Finding: slug/name が無条件 @unique だと、論理削除
-- (isActive: false) 済みの Location の値が永久に予約されたままになり、
-- 同じ slug/name での再作成が常に DUPLICATE になっていた。isActive: true
-- な行の間でのみ一意性を強制する partial unique index に置き換える
-- (SpaceCategory.name / FaqCategory.slug と同型の fix)。

-- DropIndex
DROP INDEX "locations_name_key";

-- DropIndex
DROP INDEX "locations_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "locations_slug_active_key" ON "locations"("slug") WHERE ("isActive" = true);

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_active_key" ON "locations"("name") WHERE ("isActive" = true);
