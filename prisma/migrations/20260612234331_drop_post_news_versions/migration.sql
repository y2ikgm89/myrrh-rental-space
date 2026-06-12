/*
  Warnings:

  - You are about to drop the `news_versions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `post_versions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "news_versions" DROP CONSTRAINT "news_versions_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "news_versions" DROP CONSTRAINT "news_versions_newsId_fkey";

-- DropForeignKey
ALTER TABLE "post_versions" DROP CONSTRAINT "post_versions_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "post_versions" DROP CONSTRAINT "post_versions_postId_fkey";

-- AlterTable
ALTER TABLE "terms_agreements" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "terms_documents" ALTER COLUMN "id" DROP DEFAULT;

-- DropTable
DROP TABLE "news_versions";

-- DropTable
DROP TABLE "post_versions";
