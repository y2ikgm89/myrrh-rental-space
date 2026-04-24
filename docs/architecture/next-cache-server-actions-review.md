# Next.js 16 キャッシュ・Server Actions レビュー観点

公式: [Caching](https://nextjs.org/docs/app/building-your-application/caching) / [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

## コードベースでの担保

- **キャッシュタグ直書き禁止**: [`__tests__/unit/architecture-boundaries.test.ts`](../../__tests__/unit/architecture-boundaries.test.ts) が `CACHE_TAGS` / `getCacheTag` 経由を検証。
- **レガシー成功ラッパー禁止**: 同テストスイートが管理 mutation / route の payload 形を検証。
- **コメント例の修正**: `revalidateTag('literal')` のような誤解を招く記述は、定数参照の説明に置き換える（例: [`getAnalyticsConfig` のコメント](../../src/shared/lib/analytics/config.ts)）。

## 変更時

- `updateTag` / `revalidateTag` / `'use cache'` を触ったら Codex では `admin-clean-break` または変更対象 skill を入口にし、必要なら `docs_researcher` custom agent で Next.js 公式 docs を確認する。
