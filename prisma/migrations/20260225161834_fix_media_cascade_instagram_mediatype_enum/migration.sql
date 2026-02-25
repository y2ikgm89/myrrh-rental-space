-- CreateEnum: InstagramMediaType
CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');

-- AlterTable: instagram_posts.mediaType String → InstagramMediaType (CAST でデータ保持)
ALTER TABLE "instagram_posts"
  ALTER COLUMN "mediaType" TYPE "InstagramMediaType"
  USING "mediaType"::"InstagramMediaType";

-- AlterTable: media.uploadedBy DROP NOT NULL (nullable 化)
ALTER TABLE "media" ALTER COLUMN "uploadedBy" DROP NOT NULL;

-- AlterFK: media.uploader onDelete: Cascade → SetNull
ALTER TABLE "media" DROP CONSTRAINT "media_uploadedBy_fkey";
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedBy_fkey"
  FOREIGN KEY ("uploadedBy") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- PartialIndex: 未使用招待（usedAt IS NULL）のみ email unique を強制
CREATE UNIQUE INDEX "staff_invitations_email_pending_idx"
  ON "staff_invitations"("email")
  WHERE "usedAt" IS NULL;
