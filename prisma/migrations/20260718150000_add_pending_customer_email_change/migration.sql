-- CreateTable
CREATE TABLE "pending_customer_email_changes" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "newEmail" VARCHAR(320) NOT NULL,
    "newEmailCanonical" VARCHAR(320) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_customer_email_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_customer_email_changes_tokenHash_key" ON "pending_customer_email_changes"("tokenHash");

-- CreateIndex
CREATE INDEX "pending_customer_email_changes_customerId_idx" ON "pending_customer_email_changes"("customerId");

-- CreateIndex
CREATE INDEX "pending_customer_email_changes_expiresAt_idx" ON "pending_customer_email_changes"("expiresAt");

-- AddForeignKey
ALTER TABLE "pending_customer_email_changes" ADD CONSTRAINT "pending_customer_email_changes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
