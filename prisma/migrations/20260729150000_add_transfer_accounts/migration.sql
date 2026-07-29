-- CreateTable
CREATE TABLE "transfer_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(50) NOT NULL,
    "bankName" VARCHAR(50) NOT NULL,
    "branchName" VARCHAR(50) NOT NULL,
    "accountType" VARCHAR(20) NOT NULL,
    "accountNumber" VARCHAR(20) NOT NULL,
    "accountHolderName" VARCHAR(100) NOT NULL,
    "note" VARCHAR(200),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfer_accounts_isActive_sortOrder_idx" ON "transfer_accounts"("isActive", "sortOrder");

-- AlterTable
ALTER TABLE "settings_organizations" ADD COLUMN "transferGuidance" TEXT;
