-- CreateTable: terms_documents (Terms 一新)
CREATE TABLE "terms_documents" (
  "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
  "type"                  VARCHAR(64)  NOT NULL,
  "slug"                  VARCHAR(50)  NOT NULL,
  "title"                 VARCHAR(100) NOT NULL,
  "contentJson"           JSONB        NOT NULL,
  "contentHtml"           TEXT         NOT NULL,
  "isPublished"           BOOLEAN      NOT NULL DEFAULT false,
  "publishedAt"           TIMESTAMP(3),
  "requiredAtReservation" BOOLEAN      NOT NULL DEFAULT false,
  "requiredAtInquiry"     BOOLEAN      NOT NULL DEFAULT false,
  "showInFooter"          BOOLEAN      NOT NULL DEFAULT true,
  "footerOrder"           INTEGER      NOT NULL DEFAULT 0,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  "deletedAt"             TIMESTAMP(3),

  CONSTRAINT "terms_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terms_documents_slug_key" ON "terms_documents"("slug");
CREATE INDEX "terms_documents_type_idx" ON "terms_documents"("type");
CREATE INDEX "terms_documents_deletedAt_isPublished_idx" ON "terms_documents"("deletedAt", "isPublished");
CREATE INDEX "terms_documents_showInFooter_isPublished_footerOrder_idx" ON "terms_documents"("showInFooter", "isPublished", "footerOrder");

-- CreateTable: terms_agreements
CREATE TABLE "terms_agreements" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "termsId"         UUID         NOT NULL,
  "customerId"      UUID,
  "guestEmail"      VARCHAR(255),
  "contentSnapshot" TEXT         NOT NULL,
  "contentHash"     VARCHAR(64)  NOT NULL,
  "agreedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "context"         VARCHAR(64)  NOT NULL,
  "resourceId"      UUID,
  "ipAddress"       VARCHAR(45),
  "userAgent"       TEXT,

  CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terms_agreements_termsId_idx" ON "terms_agreements"("termsId");
CREATE INDEX "terms_agreements_customerId_idx" ON "terms_agreements"("customerId");
CREATE INDEX "terms_agreements_resourceId_idx" ON "terms_agreements"("resourceId");
CREATE INDEX "terms_agreements_agreedAt_idx" ON "terms_agreements"("agreedAt");
CREATE INDEX "terms_agreements_context_agreedAt_idx" ON "terms_agreements"("context", "agreedAt");

ALTER TABLE "terms_agreements"
  ADD CONSTRAINT "terms_agreements_termsId_fkey"
  FOREIGN KEY ("termsId") REFERENCES "terms_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "terms_agreements"
  ADD CONSTRAINT "terms_agreements_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
