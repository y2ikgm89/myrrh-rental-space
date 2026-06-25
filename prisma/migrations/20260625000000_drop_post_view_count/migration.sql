-- Drop Post.viewCount: dead column (writer 0件・sidebar popular widget は publishedAt desc に変更)
-- Big-bang contract (本番未稼働・リリース前のため expand/contract 分割不要)
-- squawk-ignore ban-drop-column
ALTER TABLE "posts" DROP COLUMN "viewCount";

DROP INDEX IF EXISTS "posts_viewCount_idx";
