-- AlterTable
ALTER TABLE "faq_items" ADD COLUMN     "answerJson" JSONB;

-- AlterTable
ALTER TABLE "news" ADD COLUMN     "contentJson" JSONB;

-- AlterTable
ALTER TABLE "news_versions" ADD COLUMN     "contentJson" JSONB;

-- AlterTable
ALTER TABLE "post_versions" ADD COLUMN     "contentJson" JSONB;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "contentJson" JSONB;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "contentJson" JSONB;

-- AlterTable
ALTER TABLE "terms_versions" ADD COLUMN     "contentJson" JSONB;
