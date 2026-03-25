
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOMER';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "cancellationDeadlineHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "modificationDeadlineHours" INTEGER NOT NULL DEFAULT 24;

-- CreateIndex
CREATE UNIQUE INDEX "customers_userId_key" ON "customers"("userId");

-- CreateIndex
CREATE INDEX "customers_userId_idx" ON "customers"("userId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

