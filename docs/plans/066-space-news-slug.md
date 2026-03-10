# 066 - スペース・ニュースのスラッグ対応

## 概要

公開ページのURL構造をUUIDからスラッグに変更。

| リソース | 変更前                 | 変更後                   |
| -------- | ---------------------- | ------------------------ |
| スペース | `/spaces/b1409bb9-...` | `/spaces/meeting-room-a` |
| ニュース | `/news/301c2a49-...`   | `/news/new-space-open`   |

## 設計方針

- 既存のBlog/Pageのスラッグパターンを踏襲
- 後方互換性なし（旧URLリダイレクトなし）
- 管理画面はUUID維持（内部管理用）

## 実装内容

### 1. スキーマ・マイグレーション

- [x] Space, Newsモデルに `slug String @unique` 追加
- [x] マイグレーション実行

### 2. バリデーション

- [x] 既存パターン（`/^[a-z0-9-]+$/`）を使用
- [x] Space/News用バリデーションスキーマ更新

### 3. Server Actions

- [x] `getSpaceBySlug()` 追加
- [x] `getNewsBySlug()` 追加
- [x] create/update時にslug重複チェック追加

### 4. 公開ページルーティング

- [x] `[id]` → `[slug]` にディレクトリ名変更
- [x] page.tsx内のparams.id → params.slug
- [x] generateStaticParams()でslugを返す
- [x] キャッシュタグをslugベースに更新

### 5. リンク生成箇所

- [x] spaces/page.tsx（スペース一覧）
- [x] news/page.tsx（ニュース一覧）
- [x] SpaceListSection.tsx（ホームページセクション）
- [x] NewsSectionRenderer.tsx（ホームページセクション）
- [x] sitemap.ts（サイトマップ）

### 6. 管理画面

- [x] SpaceInlineEditor.tsx - スラッグ入力フィールド追加
- [x] NewsInlineEditor.tsx - スラッグ入力フィールド追加
- [x] プレビューリンクをslugベースに変更

### 7. Seed

- [x] 各スペースにslug追加
- [x] 各ニュースにslug追加

## 変更ファイル

```
prisma/schema.prisma
prisma/seed.ts
src/app/(public)/spaces/[slug]/page.tsx (renamed from [id])
src/app/(public)/news/[slug]/page.tsx (renamed from [id])
src/app/(public)/spaces/page.tsx
src/app/(public)/news/page.tsx
src/app/(public)/news/_components/NewsCard.tsx
src/app/(public)/news/_components/NewsList.tsx
src/app/(public)/_shared/components/sections/SpaceListSection.tsx
src/app/(public)/_shared/components/sections/NewsSectionRenderer.tsx
src/app/sitemap.ts
src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceInlineEditor.tsx
src/app/(admin)/admin/(dashboard)/news/_components/NewsInlineEditor.tsx
src/app/(admin)/admin/(dashboard)/spaces/[id]/page.tsx
```

## 検証結果

- [x] type-check: Pass
- [x] lint: Pass（警告のみ）
- [x] build: Pass
- [x] 動作確認: 公開ページ（/spaces/[slug]、/news/[slug]）正常動作
- [x] 動作確認: 管理画面スラッグ編集フィールド表示確認

## 追加変更（2026-01-23）

管理画面のスラッグ入力フィールドが不足していたため追加：

- `SpaceInlineEditor.tsx`: 基本情報カードにスラッグ入力フィールド追加
- `news-config.ts`: TitleSlugFieldsの`showSlug`を`true`に変更
