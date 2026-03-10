# 023-grapesjs-removal-homepage-settings.md

## 概要

GrapesJSビジュアルエディターの完全廃止 + ホームページセクション設定機能の実装

## 実装内容

### A. GrapesJS完全廃止

**パッケージ削除**:

- `grapesjs`, `@grapesjs/react` をpackage.jsonから削除
- GrapesJS関連の型定義を削除

**Prismaスキーマ変更**:

- `GrapesPage`, `GrapesPageVersion` モデル削除
- `GrapesPageStatus` enum削除
- Blog/NewsからprojectDataフィールド削除
- PageからprojectData, templateIdフィールド削除
- 権限リソースからgrapesPage削除

**ファイル削除**:

- `src/components/admin/editor/grapesjs/` - GrapesJSエディターコンポーネント
- `src/lib/validations/grapes-page.ts` - GrapesページZodスキーマ
- `src/lib/grapesjs-renderer.ts` - GrapesJSレンダラー
- `src/actions/admin/grapes-page.ts` - GrapesページServer Actions
- `src/app/(admin)/admin/(dashboard)/grapes-pages/` - 管理画面
- `src/app/(public)/g/` - 公開ページルート
- `public/admin/grapesjs-canvas.css` - キャンバススタイル
- GrapesJS関連docs（016, 017, 018, 020）

**エディター移行**:

- Blog/News/PageインラインエディターをLexicalに統一
- GrapesJSEditorWrapperの参照をLexicalEditorに変更

### B. ホームページセクション設定

**Prismaスキーマ追加**:

```prisma
model HomepageFaq {
  id       String @id @default(cuid())
  isActive Boolean @default(true)
  items    HomepageFaqItem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model HomepageFaqItem {
  id       String @id @default(cuid())
  faqId    String
  question String
  answer   String @db.Text
  order    Int @default(0)
  isActive Boolean @default(true)
  faq      HomepageFaq @relation(...)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// Settingsモデルに追加:
homepageCtaIsActive      Boolean @default(true)
homepageCtaTitle         String @default("ご予約・お問い合わせ")
homepageCtaDescription   String? @db.Text
homepageCtaPrimaryText   String @default("予約する")
homepageCtaPrimaryUrl    String @default("/reservation")
homepageCtaSecondaryText String?
homepageCtaSecondaryUrl  String?
homepageBlogIsActive     Boolean @default(true)
homepageBlogTitle        String @default("ブログ")
homepageBlogCount        Int @default(3)
homepageNewsIsActive     Boolean @default(true)
homepageNewsTitle        String @default("お知らせ")
homepageNewsCount        Int @default(5)
```

**Server Actions** (`src/actions/admin/homepage-settings.ts`):

- `getHomepageSectionsSettings()` - 管理画面用設定取得
- `getPublicHomepageSections()` - 公開ページ用設定取得（認証不要）
- `updateCtaSection()` - CTAセクション更新
- `updateBlogSection()` - ブログセクション更新
- `updateNewsSection()` - お知らせセクション更新
- `updateFaqSection()` - FAQセクション有効/無効切替
- `createFaqItem()` - FAQ項目作成
- `updateFaqItem()` - FAQ項目更新
- `deleteFaqItem()` - FAQ項目削除
- `updateFaqItemOrder()` - FAQ項目順序変更（ドラッグ＆ドロップ）

**管理画面UI** (`src/app/(admin)/admin/(dashboard)/settings/_components/tabs/HomepageTab.tsx`):

- 「ホームページ」タブを設定画面に追加
- CTAセクション: isActive, title, description, primaryText/Url, secondaryText/Url
- ブログセクション: isActive, title, count(1-10)
- お知らせセクション: isActive, title, count(1-10)
- FAQセクション: isActive + ドラッグ＆ドロップ並び替え、CRUD
- CollapsibleSectionコンポーネントで折りたたみ対応
- AlertDialogで削除確認

**公開ページコンポーネント**:

- `src/components/site/sections/CTA.tsx` - 設定ベースのCTAセクション
- `src/components/site/sections/BlogSection.tsx` - 最新ブログ記事セクション（NEW）
- `src/components/site/sections/NewsSection.tsx` - お知らせセクション（NEW）
- `src/components/site/sections/FAQSection.tsx` - FAQアコーディオンセクション（NEW）

**公開用データ取得関数**:

- `getPublishedBlogPosts()` - 公開済みブログ記事（認証不要）
- `getPublishedNewsList()` - 公開済みお知らせ（認証不要）

## 新規ファイル

- `src/actions/admin/homepage-settings.ts` - ホームページ設定Server Actions
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/HomepageTab.tsx` - 管理画面タブ
- `src/components/site/sections/BlogSection.tsx` - ブログセクション
- `src/components/site/sections/NewsSection.tsx` - お知らせセクション
- `src/components/site/sections/FAQSection.tsx` - FAQセクション

## 変更ファイル

- `package.json` - GrapesJS依存削除
- `prisma/schema.prisma` - GrapesJS関連削除 + ホームページ設定追加
- `src/lib/permissions.ts` - grapesPageリソース削除
- `src/actions/admin/blog.ts` - projectData削除、getPublishedBlogPosts追加
- `src/actions/admin/news.ts` - projectData削除、getPublishedNewsList追加
- `src/actions/admin/page.ts` - projectData削除
- `src/lib/validations/page.ts` - projectData削除、PageData型からtemplateId削除
- `src/components/admin/editor/inline/types.ts` - ProjectData型削除
- `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx` - HomepageTab追加
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/index.ts` - HomepageTab export
- `src/app/(admin)/admin/(dashboard)/settings/permissions/page.tsx` - grapesPage削除
- `src/app/(admin)/admin/(dashboard)/news/_components/NewsInlineEditor.tsx` - Lexical化
- `src/app/(admin)/admin/(dashboard)/blog/_components/BlogInlineEditor.tsx` - Lexical化
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx` - PageInlineEditor使用
- `src/components/site/sections/CTA.tsx` - 設定ベース化
- `src/components/site/sections/index.ts` - 新セクション追加
- `src/app/(public)/page.tsx` - 新セクション表示
- `src/components/admin/ui/index.ts` - AlertDialog export追加

## 削除ファイル

- `src/components/admin/editor/grapesjs/` - ディレクトリ全体
- `src/lib/validations/grapes-page.ts`
- `src/lib/grapesjs-renderer.ts`
- `src/actions/admin/grapes-page.ts`
- `src/app/(admin)/admin/(dashboard)/grapes-pages/` - ディレクトリ全体
- `src/app/(admin)/admin/(dashboard)/pages/_components/PageGrapesJSEditor.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/_components/CreatePageDialog.tsx` (再作成)
- `src/app/(public)/g/` - ディレクトリ全体
- `public/admin/grapesjs-canvas.css`
- `docs/plans/016-grapesjs-visual-editor.md`
- `docs/plans/017-grapesjs-custom-blocks.md`
- `docs/plans/018-grapesjs-database-integration.md`
- `docs/plans/020-blog-news-grapesjs-migration.md`

## マイグレーション

以下のコマンドでDBスキーマを更新:

```bash
bunx prisma db push
# または
bunx prisma migrate dev --name remove_grapesjs_add_homepage_settings
```

注意: GrapesPage関連データは削除されます。

## 技術的考慮事項

### Next.js 16対応

- `connection()` を使用してdynamic renderingを明示（new Date()問題回避）
- Server Componentsで設定取得、セクションコンポーネントに分離

### セキュリティ

- URL検証: 内部パス(`/`)またはhttp/httpsのみ許可
- withPermission HOFで権限チェック
- AlertDialogで削除確認（confirm()置換）

### 型安全性

- Zod schemaによるバリデーション
- PublicBlogPost/PublicNews型でpublishedAtをnon-null保証

## 検証結果

- type-check: OK
- lint: OK
- build: DBマイグレーション後にOK
