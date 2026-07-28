-- Inquiry reply / attachment: require positive author FK (not just cross-side NULL guard).
-- Align FK onDelete with InternalNote: Restrict (SetNull would immediately violate the CHECK).
-- Expand path: scrub orphan rows left by prior SetNull deletes, then tighten FKs + CHECK.

-- Orphans from ON DELETE SET NULL cannot satisfy the positive-author CHECK.
DELETE FROM "inquiry_attachments"
WHERE "uploadedById" IS NULL
  AND "uploadedByCustomerId" IS NULL;

DELETE FROM "inquiry_replies"
WHERE (
  "authorType" = 'STAFF'
  AND "authorId" IS NULL
)
OR (
  "authorType" = 'CUSTOMER'
  AND "authorCustomerId" IS NULL
);

-- Switch author FKs SetNull → Restrict before CHECK (delete of User/Customer must not null authors).
ALTER TABLE "inquiry_replies" DROP CONSTRAINT "inquiry_replies_authorId_fkey";
ALTER TABLE "inquiry_replies" DROP CONSTRAINT "inquiry_replies_authorCustomerId_fkey";
ALTER TABLE "inquiry_attachments" DROP CONSTRAINT "inquiry_attachments_uploadedById_fkey";
ALTER TABLE "inquiry_attachments" DROP CONSTRAINT "inquiry_attachments_uploadedByCustomerId_fkey";

ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_authorCustomerId_fkey"
  FOREIGN KEY ("authorCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploadedByCustomerId_fkey"
  FOREIGN KEY ("uploadedByCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inquiry_replies" DROP CONSTRAINT "inquiry_replies_author_side_check";

ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_side_check" CHECK (
  (
    "authorType" = 'STAFF'
    AND "authorId" IS NOT NULL
    AND "authorCustomerId" IS NULL
  )
  OR
  (
    "authorType" = 'CUSTOMER'
    AND "authorCustomerId" IS NOT NULL
    AND "authorId" IS NULL
  )
);

ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploader_side_check" CHECK (
  (
    "uploadedById" IS NOT NULL
    AND "uploadedByCustomerId" IS NULL
  )
  OR
  (
    "uploadedByCustomerId" IS NOT NULL
    AND "uploadedById" IS NULL
  )
);
