# 030: メディア管理機能

## 概要

メディア管理機能の実装。Supabase Storageを使用した画像・動画・ドキュメントの一元管理と、Lexicalエディターとの統合。

## 実装内容

### データモデル
- `Media` モデル: ファイルメタデータ（filename, url, size, dimensions等）
- `MediaType` enum: IMAGE, VIDEO, DOCUMENT, OTHER
- `MediaUsage` enum: BLOG, NEWS, PAGE, SPACE, SITE, GENERAL
- Userリレーション: uploadedBy（アップロード者追跡）

### Server Actions
- `getMediaList()`: フィルター・ページネーション付き一覧取得
- `getMediaById()`: 詳細取得
- `uploadMedia()`: ファイルアップロード + DB登録
- `updateMedia()`: メタデータ更新
- `deleteMedia()`: 論理削除 + Storage削除
- `bulkDeleteMedia()`: 一括削除

### 管理画面UI
- グリッド/リストビュー切り替え
- 種別・用途フィルター
- 検索機能
- アップロードダイアログ（ドラッグ&ドロップ対応）
- 詳細ダイアログ（メタデータ編集・削除）

### エディター連携
- `MediaLibraryPlugin`: エディター内からメディアライブラリを開いて画像を選択・挿入
- `useMediaLibrary` hook: ダイアログ状態管理
- ツールバーに「メディアライブラリ」ボタン追加

## 新規ファイル

### Prisma
- `prisma/migrations/20260115164751_add_media_model/` - マイグレーション

### バリデーション
- `src/lib/validations/media.ts` - Zodスキーマ、型定義、ヘルパー関数

### Server Actions
- `src/actions/admin/media.ts` - CRUD操作

### 管理画面
- `src/app/(admin)/admin/(dashboard)/media/page.tsx` - メディア一覧ページ
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaFilters.tsx` - フィルターUI
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaListWrapper.tsx` - リストラッパー
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx` - グリッド表示
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaTable.tsx` - テーブル表示
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaUploadDialog.tsx` - アップロードダイアログ
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx` - 詳細ダイアログ

### エディター
- `src/components/admin/editor/lexical/plugins/MediaLibraryPlugin.tsx` - メディアライブラリプラグイン

## 変更ファイル

- `prisma/schema.prisma` - Mediaモデル、enum追加
- `src/lib/supabase.ts` - MEDIAバケット追加
- `src/lib/permissions.ts` - media リソース権限追加
- `src/lib/utils.ts` - formatBytes, formatDate関数追加
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` - メディアリンク追加
- `src/components/admin/editor/lexical/plugins/index.ts` - MediaLibraryPlugin エクスポート
- `src/components/admin/editor/lexical/plugins/ToolbarPlugin.tsx` - メディアライブラリボタン追加
- `src/components/admin/editor/lexical/LexicalEditor.tsx` - MediaLibraryPlugin統合

## 権限設定

| ロール | create | read | update | delete | manage |
|--------|--------|------|--------|--------|--------|
| SUPER_ADMIN | ○ | ○ | ○ | ○ | ○ |
| ADMIN | ○ | ○ | ○ | ○ | ○ |
| EDITOR | ○ | ○ | ○ | - | - |
| VIEWER | - | ○ | - | - | - |

## セットアップ

### 1. Supabase Storage バケット作成

Supabaseダッシュボードで `media` バケットを作成:
1. Storage → Create a new bucket
2. Name: `media`
3. Public bucket: Yes（公開アクセス）

### 2. マイグレーション

```bash
bunx prisma migrate dev --name add_media_model
```

## 使用方法

### 管理画面
1. サイドバー「メディア」をクリック
2. 「アップロード」ボタンでファイルをアップロード
3. グリッド/リストビューで閲覧
4. 画像クリックで詳細・編集

### エディター
1. ツールバーの「+」→「メディアライブラリ」をクリック
2. ライブラリから画像を選択、または新規アップロード
3. 「挿入」で画像をエディターに挿入

## マイグレーション

あり（Mediaモデル追加）
