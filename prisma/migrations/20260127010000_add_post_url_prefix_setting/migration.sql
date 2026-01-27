-- Add postUrlPrefixEnabled setting
-- true: URLs use /posts/ prefix (e.g., /posts/article-title)
-- false: URLs are at root level (e.g., /article-title)

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "postUrlPrefixEnabled" BOOLEAN NOT NULL DEFAULT true;
