/*
  Warnings:

  - You are about to drop the column `isDraft` on the `blog_posts` table. All the data in the column will be lost.
  - You are about to drop the column `isPublished` on the `blog_posts` table. All the data in the column will be lost.
  - You are about to drop the column `isPublished` on the `news` table. All the data in the column will be lost.
  - You are about to drop the column `projectData` on the `pages` table. All the data in the column will be lost.
  - You are about to drop the column `templateId` on the `pages` table. All the data in the column will be lost.
  - You are about to drop the `grapes_page_versions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `grapes_pages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `homepage_hero` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "HomepageSectionType" AS ENUM ('HERO', 'SPACE_LIST', 'NEWS', 'BLOG', 'FAQ', 'CTA', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'UNPUBLISH', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'PERMISSION_DENIED', 'PASSWORD_CHANGE', 'ROLE_CHANGE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "Role" ADD VALUE 'EDITOR';
ALTER TYPE "Role" ADD VALUE 'VIEWER';

-- DropForeignKey
ALTER TABLE "grapes_page_versions" DROP CONSTRAINT "grapes_page_versions_pageId_fkey";

-- DropIndex
DROP INDEX "blog_posts_categoryId_isPublished_publishedAt_idx";

-- DropIndex
DROP INDEX "blog_posts_isPublished_publishedAt_idx";

-- DropIndex
DROP INDEX "news_isPublished_publishedAt_idx";

-- DropIndex
DROP INDEX "pages_templateId_idx";

-- AlterTable
ALTER TABLE "blog_posts" DROP COLUMN "isDraft",
DROP COLUMN "isPublished",
ADD COLUMN     "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "news" DROP COLUMN "isPublished",
ADD COLUMN     "status" "NewsStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "pages" DROP COLUMN "projectData",
DROP COLUMN "templateId";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "assignedPages" JSONB NOT NULL DEFAULT '[]';

-- DropTable
DROP TABLE "grapes_page_versions";

-- DropTable
DROP TABLE "grapes_pages";

-- DropTable
DROP TABLE "homepage_hero";

-- DropEnum
DROP TYPE "GrapesPageStatus";

-- CreateTable
CREATE TABLE "news_versions" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "news_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_post_versions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "blog_post_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" TEXT NOT NULL,
    "type" "HomepageSectionType" NOT NULL,
    "title" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_versions_newsId_createdAt_idx" ON "news_versions"("newsId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "news_versions_newsId_version_key" ON "news_versions"("newsId", "version");

-- CreateIndex
CREATE INDEX "blog_post_versions_postId_createdAt_idx" ON "blog_post_versions"("postId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blog_post_versions_postId_version_key" ON "blog_post_versions"("postId", "version");

-- CreateIndex
CREATE INDEX "homepage_sections_order_isActive_idx" ON "homepage_sections"("order", "isActive");

-- CreateIndex
CREATE INDEX "homepage_sections_type_idx" ON "homepage_sections"("type");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionId_key" ON "role_permissions"("role", "permissionId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_identifier_createdAt_idx" ON "login_attempts"("identifier", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "blog_posts_status_publishedAt_idx" ON "blog_posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "blog_posts_categoryId_status_publishedAt_idx" ON "blog_posts"("categoryId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "news_status_publishedAt_idx" ON "news"("status", "publishedAt");

-- AddForeignKey
ALTER TABLE "news_versions" ADD CONSTRAINT "news_versions_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_post_versions" ADD CONSTRAINT "blog_post_versions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
