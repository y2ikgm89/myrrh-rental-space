# 037: ブログサイドバー機能

## 概要

ブログページにサイドバーを追加し、検索・新着記事・人気記事・カテゴリー・タグのウィジェットを表示する。
サイト設定でグローバル制御、ページ単位で個別制御が可能。

## 要件

### グローバル設定（サイト設定 > レイアウトタブ）

- サイドバー全体のオン/オフ
- 各ウィジェットの個別オン/オフ（検索、新着、人気、カテゴリー、タグ）
- 表示件数の設定（新着: 5件、人気: 5件）

### ページ種別デフォルト

- ブログ一覧・詳細ページ: デフォルトON
- カスタムページ（Page）: デフォルトOFF（ページごとに設定可能）
- その他ページ（ニュース、スペース等）: サイドバーなし

### ウィジェット

| ウィジェット | 機能                                 |
| ------------ | ------------------------------------ |
| 検索バー     | ブログ内検索（既存の検索機能を活用） |
| 新着記事     | 公開日降順で最新N件表示              |
| 人気記事     | viewCount降順で上位N件表示           |
| カテゴリー   | 全カテゴリー一覧（記事数表示）       |
| タグ         | 全タグ一覧（タグクラウド形式）       |

---

## フェーズ構成

## ✅ フェーズ1: DBスキーマ拡張 `cc:DONE`

### タスク

- [x] Settings モデルにサイドバー設定フィールド追加
  - `sidebarEnabled: Boolean @default(true)`
  - `sidebarWidgets: Json @default("{}")` // { search: true, recent: true, popular: true, categories: true, tags: true }
  - `sidebarRecentCount: Int @default(5)`
  - `sidebarPopularCount: Int @default(5)`
- [x] Page モデルにサイドバー設定フィールド追加
  - `showSidebar: Boolean?` // null=デフォルト使用、true/false=明示的指定
- [x] マイグレーション実行: `20260117000900_add_sidebar_settings`

### 変更ファイル

- `prisma/schema.prisma`

---

## ✅ フェーズ2: Server Actions `cc:DONE`

### タスク

- [x] サイドバー設定の取得・更新 Server Actions 追加
  - `getSidebarSettings()` - グローバル設定取得
  - `updateSidebarSettings()` - グローバル設定更新
- [x] Zodバリデーションスキーマ追加
- [x] サイドバーデータ取得 Server Actions 追加
  - `getSidebarData()` - 新着・人気・カテゴリー・タグを一括取得

### 新規ファイル

- `src/lib/validations/sidebar.ts` - Zodスキーマ
- `src/actions/public/sidebar.ts` - 公開用 Server Actions

### 変更ファイル

- `src/actions/admin/settings.ts` - 管理用 Server Actions 追加

---

## ✅ フェーズ3: サイドバーコンポーネント `cc:DONE`

### タスク

- [x] サイドバーコンテナコンポーネント作成
- [x] 検索ウィジェット作成（既存BlogFiltersの検索部分を再利用）
- [x] 新着記事ウィジェット作成
- [x] 人気記事ウィジェット作成
- [x] カテゴリーウィジェット作成（記事数表示）
- [x] タグウィジェット作成（タグクラウド形式）

### 新規ファイル

- `src/components/site/sidebar/BlogSidebar.tsx` - メインコンテナ
- `src/components/site/sidebar/SearchWidget.tsx` - 検索ウィジェット
- `src/components/site/sidebar/RecentPostsWidget.tsx` - 新着記事
- `src/components/site/sidebar/PopularPostsWidget.tsx` - 人気記事
- `src/components/site/sidebar/CategoriesWidget.tsx` - カテゴリー
- `src/components/site/sidebar/TagsWidget.tsx` - タグ
- `src/components/site/sidebar/index.ts` - エクスポート

---

## ✅ フェーズ4: ブログページ統合 `cc:DONE`

### タスク

- [x] ブログ一覧ページにサイドバー統合
  - 2カラムレイアウト（メイン + サイドバー）
  - レスポンシブ対応（モバイルはサイドバー下部表示）
- [x] ブログ詳細ページにサイドバー統合
- [x] サイドバー表示判定ロジック実装

### 変更ファイル

- `src/app/(public)/blog/page.tsx` - 一覧ページ
- `src/app/(public)/blog/[slug]/page.tsx` - 詳細ページ

---

## ✅ フェーズ5: 管理画面UI `cc:DONE`

### タスク

- [x] 設定画面「レイアウト」タブにサイドバー設定セクション追加
  - サイドバー全体のオン/オフ
  - 各ウィジェットのオン/オフトグル
  - 表示件数の設定
- [ ] プレビュー機能（オプション）

### 新規ファイル

- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection.tsx`

### 変更ファイル

- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/LayoutTab.tsx`

---

## ✅ フェーズ6: ページ単位設定 `cc:DONE`

### タスク

- [x] ページ編集画面にサイドバー設定追加
  - 「デフォルト（非表示）」「表示」「非表示」の3択
- [x] カスタムページでのサイドバー表示対応

### 変更ファイル

- `src/lib/validations/page.ts` - PageData型・updatePageSchemaにshowSidebar追加
- `src/actions/admin/page.ts` - updatePageにshowSidebar保存処理追加
- `src/components/admin/editor/inline/types.ts` - PageEditorFormDataにshowSidebar追加
- `src/components/admin/editor/inline/side-panel/LayoutFields.tsx` - サイドバー表示設定UI追加
- `src/app/(admin)/admin/(dashboard)/pages/_components/PageInlineEditor.tsx` - showSidebar対応

### 新規ファイル

- `src/app/(public)/p/[slug]/page.tsx` - カスタムページ公開表示（サイドバー対応）

---

## ✅ フェーズ7: 検証・レビュー `cc:DONE`

### タスク

- [x] type-check / lint / build 通過確認
- [ ] 動作確認
  - ブログ一覧でサイドバー表示
  - ブログ詳細でサイドバー表示
  - 管理画面からの設定変更反映
  - レスポンシブ動作
- [ ] code-reviewer によるレビュー

---

## 技術スタック

- **既存活用**: BlogPost.viewCount、BlogCategory、BlogTag
- **レイアウト**: Tailwind CSS Grid/Flexbox（2カラム）
- **レスポンシブ**: lg以上で2カラム、md以下で1カラム（サイドバー下部）
- **データ取得**: Server Componentsでの直接取得（キャッシュ活用）

## マイグレーション

`bunx prisma migrate dev --name add_sidebar_settings`

---

## 完了条件

- [x] ブログページにサイドバーが表示される
- [x] 管理画面からサイドバー設定を変更できる
- [x] 各ウィジェットが正しく動作する
- [x] レスポンシブ対応が完了している
- [x] ビルドが通る
