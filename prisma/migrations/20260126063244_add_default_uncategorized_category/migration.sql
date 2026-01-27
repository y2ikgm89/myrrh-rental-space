-- Add default "未分類" (Uncategorized) category
-- This category is required as the default for posts without a specific category

INSERT INTO "post_categories" ("id", "name", "slug", "description", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  '未分類',
  'uncategorized',
  'カテゴリ未設定の投稿',
  NOW(),
  NOW()
)
ON CONFLICT ("slug") DO NOTHING;
