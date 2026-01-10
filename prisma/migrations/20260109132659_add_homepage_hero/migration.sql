-- CreateTable
CREATE TABLE "homepage_hero" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "title" TEXT NOT NULL DEFAULT '理想のスペースを、あなたに。',
    "subtitle" TEXT,
    "ctaPrimaryText" TEXT NOT NULL DEFAULT 'スペースを探す',
    "ctaPrimaryUrl" TEXT NOT NULL DEFAULT '/spaces',
    "ctaSecondaryText" TEXT DEFAULT 'お問い合わせ',
    "ctaSecondaryUrl" TEXT DEFAULT '/contact',
    "backgroundImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_hero_pkey" PRIMARY KEY ("id")
);
