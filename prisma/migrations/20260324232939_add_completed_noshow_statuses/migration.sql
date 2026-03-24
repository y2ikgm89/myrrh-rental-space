-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReservationStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "ReservationStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "account" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "announcement_bars" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "block_templates" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "coupons" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "editor_comment_threads" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "editor_comments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "faq_categories" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "faq_items" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ical_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inquiries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "instagram_posts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "login_attempts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "login_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "media" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "navigation_items" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "news" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "news_versions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "page_contents" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pages" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "post_categories" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "post_comments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "post_tags" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "post_versions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "reservations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sections" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "session" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_links" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "space_categories" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "spaces" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "staff_invitations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "terms" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "terms_agreements" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "terms_versions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "verification" ALTER COLUMN "id" DROP DEFAULT;
