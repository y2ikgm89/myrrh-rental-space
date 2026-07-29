-- CreateTable
CREATE TABLE "pending_customer_merges" (
    "id" UUID NOT NULL,
    "targetCustomerId" UUID NOT NULL,
    "sourceCustomerId" UUID NOT NULL,
    "guestEmail" VARCHAR(320) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_customer_merges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_customer_merges_tokenHash_key" ON "pending_customer_merges"("tokenHash");

-- CreateIndex
CREATE INDEX "pending_customer_merges_targetCustomerId_idx" ON "pending_customer_merges"("targetCustomerId");

-- CreateIndex
CREATE INDEX "pending_customer_merges_expiresAt_idx" ON "pending_customer_merges"("expiresAt");

-- AddForeignKey
ALTER TABLE "pending_customer_merges" ADD CONSTRAINT "pending_customer_merges_targetCustomerId_fkey" FOREIGN KEY ("targetCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_customer_merges" ADD CONSTRAINT "pending_customer_merges_sourceCustomerId_fkey" FOREIGN KEY ("sourceCustomerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
