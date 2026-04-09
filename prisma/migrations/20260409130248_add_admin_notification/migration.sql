-- CreateTable
CREATE TABLE "admin_notification" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "resourceType" VARCHAR(50),
    "resourceId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_notification_isRead_createdAt_idx" ON "admin_notification"("isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "admin_notification_type_idx" ON "admin_notification"("type");

-- CreateIndex
CREATE INDEX "admin_notification_createdAt_idx" ON "admin_notification"("createdAt" DESC);
