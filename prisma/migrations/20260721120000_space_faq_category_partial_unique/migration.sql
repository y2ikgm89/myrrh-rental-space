-- Round-5 audit Finding #18: name/slug が無条件 @unique だと、無効化/ソフト
-- デリート済みの行が残る限り同じ名前・スラッグでの再作成が永久に CONFLICT に
-- なっていた。isActive: true (SpaceCategory) / deletedAt IS NULL (FaqCategory)
-- な行の間でのみ一意性を強制する partial unique index に置き換える。

-- DropIndex
DROP INDEX "faq_categories_slug_key";

-- DropIndex
DROP INDEX "space_categories_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "faq_categories_slug_active_key" ON "faq_categories"("slug") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "space_categories_name_active_key" ON "space_categories"("name") WHERE ("isActive" = true);
