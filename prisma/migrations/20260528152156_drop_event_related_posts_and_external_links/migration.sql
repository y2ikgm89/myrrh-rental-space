-- DropForeignKey
ALTER TABLE "event_related_posts" DROP CONSTRAINT "event_related_posts_eventId_fkey";

-- DropForeignKey
ALTER TABLE "event_related_posts" DROP CONSTRAINT "event_related_posts_postId_fkey";

-- DropForeignKey
ALTER TABLE "event_related_external_links" DROP CONSTRAINT "event_related_external_links_eventId_fkey";

-- DropTable
DROP TABLE "event_related_posts";

-- DropTable
DROP TABLE "event_related_external_links";
