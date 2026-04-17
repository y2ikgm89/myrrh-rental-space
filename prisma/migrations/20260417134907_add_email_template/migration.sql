-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "emailFooterNote" TEXT,
ADD COLUMN     "emailSubjectPrefix" VARCHAR(32),
ADD COLUMN     "emailSupportContactText" TEXT;

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(256) NOT NULL,
    "greeting" VARCHAR(256) NOT NULL,
    "intro" TEXT NOT NULL,
    "outro" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_type_key" ON "email_templates"("type");

-- CreateIndex
CREATE INDEX "email_templates_type_idx" ON "email_templates"("type");
