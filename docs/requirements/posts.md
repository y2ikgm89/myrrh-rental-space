# ブログ機能要件定義

> **Note**: このドキュメントにはブログ機能の詳細な要件定義が記載されています。概要については [`README.md`](./README.md) を参照してください。

---

## 要件定義の目的

このドキュメントは、レンタルスペース管理システムにブログ機能を追加する際の詳細な要件定義を記載します。既存のお知らせ機能と明確に区別し、SEO対策とマーケティングを目的とした長期的なコンテンツ管理機能を提供します。

---

## お知らせ機能とブログ機能の使い分け

### お知らせ機能（既存）

- **用途**: 短期的な告知、重要な情報
- **対象コンテンツ**:
  - 営業時間変更
  - 臨時休業
  - イベント告知
  - システムメンテナンス通知
- **特徴**:
  - 時系列で表示
  - シンプルな構造（タイトル、本文、公開日時）
  - ページネーション対応
- **表示期間**: 短期間（1-3ヶ月程度）

### ブログ機能（新規追加）

- **用途**: 長期的なコンテンツ、SEO対策、マーケティング
- **対象コンテンツ**:
  - スペースの使い方ガイド
  - イベントレポート
  - お客様の声・インタビュー
  - スペース紹介記事
  - イベント企画の詳細
- **特徴**:
  - カテゴリ・タグによる分類
  - リッチなコンテンツ（画像、動画埋め込み）
  - SEO最適化（メタディスクリプション、OGP画像）
  - 関連記事表示
  - 閲覧数統計
- **表示期間**: 長期間（永続的に公開）

---

## 機能要件

### 公開ページ

#### 1. ブログ一覧ページ (`/posts`)

**基本要件**:

- ブログ記事一覧をカード形式で表示
- 1ページあたり12件表示（レスポンシブ対応）
- 公開済み記事のみ表示（`isPublished = true` かつ `publishedAt <= 現在日時`）
- 公開日時の降順でソート（最新順）

**表示項目**:

- サムネイル画像
- タイトル
- 概要（excerpt）
- カテゴリ名
- タグ（最大5個表示）
- 公開日時
- 著者名
- 閲覧数（オプション）

**フィルタ機能**:

- カテゴリフィルタ: サイドバーまたは上部にカテゴリ一覧を表示、クリックでフィルタ
- タグフィルタ: タグクラウド形式で表示、クリックでフィルタ
- 複数フィルタの組み合わせ対応
- URLクエリパラメータ管理: [`nuqs.md`](./nuqs.md)を参照

**検索機能**:

- タイトル、概要、本文から全文検索
- 検索結果のハイライト表示
- 検索結果件数の表示
- URLクエリパラメータ管理: [`nuqs.md`](./nuqs.md)を参照

**ページネーション**:

- ページ番号表示（最大10ページまで）
- 前へ/次へボタン
- 現在のページ番号をハイライト
- URLパラメータでページ状態を保持（`/posts?page=2&category=event`）
- URLクエリパラメータ管理: [`nuqs.md`](./nuqs.md)を参照

**サイドバー**:

- 人気記事（閲覧数順、最大5件）
- 最新記事（最大5件）
- カテゴリ一覧（記事数付き）
- タグクラウド（使用頻度順）

**レンダリング戦略**:

- ISR（`revalidate: 300`、5分ごとに再生成）
- 管理画面での更新時に`revalidatePath('/posts')`で即座に再生成

**レスポンシブデザイン**:

- デスクトップ: 3カラムグリッド
- タブレット: 2カラムグリッド
- モバイル: 1カラム

#### 2. ブログ詳細ページ (`/posts/[slug]`)

**基本要件**:

- スラッグベースのURL（例: `/posts/space-usage-guide-2024`）
- 公開済み記事のみ表示、非公開記事は404エラー
- 閲覧数の自動カウント（ページ表示時に+1）

**表示項目**:

- サムネイル画像（OGP画像があれば優先）
- タイトル
- 著者情報（名前、アバター画像）
- 公開日時
- 更新日時（公開日時と異なる場合のみ表示）
- カテゴリ名（リンク付き）
- タグ（リンク付き、最大10個）
- 本文（Tiptapで作成したリッチテキスト）
- 目次（TOC、長文記事用、見出しから自動生成）
- 関連記事（同じカテゴリ、最大3件）
- 前後の記事ナビゲーション
- シェアボタン（Twitter/X、Facebook、LINE）

**SEO最適化**:

- メタタイトル（`ogpTitle`があれば優先、なければ`title`）
- メタディスクリプション（`metaDescription`があれば優先、なければ`excerpt`）
- OGP画像（`ogpImageUrl`があれば優先、なければ`thumbnailUrl`）
- 構造化データ（JSON-LD、Articleスキーマ）
- カノニカルURL

**レンダリング戦略**:

- ISR（`revalidate: 300`、5分ごとに再生成）
- `generateStaticParams`で主要記事を事前生成
- 管理画面での更新時に`revalidatePath('/posts/[slug]')`で即座に再生成

**レスポンシブデザイン**:

- デスクトップ: 最大幅1200px、中央配置
- タブレット: 最大幅768px
- モバイル: 全幅、パディング調整

#### 3. カテゴリページ (`/posts/category/[slug]`)

**基本要件**:

- カテゴリスラッグベースのURL
- 該当カテゴリの記事一覧を表示
- カテゴリ説明を表示（あれば）
- ページネーション対応

**表示項目**:

- カテゴリ名
- カテゴリ説明
- 記事一覧（ブログ一覧ページと同じ形式）
- 記事数

**レンダリング戦略**:

- ISR（`revalidate: 300`）

#### 4. タグページ (`/posts/tag/[slug]`)

**基本要件**:

- タグスラッグベースのURL
- 該当タグの記事一覧を表示
- ページネーション対応

**表示項目**:

- タグ名
- 記事一覧（ブログ一覧ページと同じ形式）
- 記事数

**レンダリング戦略**:

- ISR（`revalidate: 300`）

---

### 管理画面

#### ブログ記事管理 (`/admin/posts`)

**一覧表示**:

- 記事一覧をテーブル形式で表示
- 表示項目: サムネイル、タイトル、カテゴリ、公開状態、公開日時、閲覧数、作成日時、更新日時
- 1ページあたり20件表示
- ページネーション

**フィルタ機能**:

- 公開状態（すべて、公開済み、下書き、非公開）
- カテゴリ
- 著者
- 公開日時範囲
- URLクエリパラメータ管理: [`nuqs.md`](./nuqs.md)を参照

**ソート機能**:

- 公開日時（昇順/降順）
- 作成日時（昇順/降順）
- 更新日時（昇順/降順）
- 閲覧数（昇順/降順）
- タイトル（昇順/降順）
- URLクエリパラメータ管理: [`nuqs.md`](./nuqs.md)を参照

**検索機能**:

- タイトル、概要、本文から全文検索
- リアルタイム検索（デバウンス処理）

**追加・編集フォーム**:

**基本情報セクション**:

- タイトル（必須、1-200文字、リアルタイムバリデーション）
- スラッグ（自動生成、手動編集可能、英数字・ハイフン・アンダースコアのみ、重複チェック）
- 概要（必須、1-500文字、メタディスクリプション用、文字数カウンター表示）

**コンテンツセクション**:

- 本文（必須、Tiptapリッチテキストエディタ）
  - 見出し（H1-H3）
  - 段落
  - リスト（順序付き、順序なし）
  - 引用
  - リンク
  - 画像埋め込み（Cloudflare R2 にアップロード）
  - 動画埋め込み（Cloudflare R2 にアップロード、オプション）
  - コードブロック
  - テーブル
  - 水平線
- サムネイル画像（必須、1枚、JPEG/PNG/WebP/AVIF、最大5MB、プレビュー表示）
- OGP画像（オプション、1枚、JPEG/PNG/WebP/AVIF、最大5MB、プレビュー表示）

**分類セクション**:

- カテゴリ（必須、1つ選択、ドロップダウン、新規作成リンク）
- タグ（オプション、複数選択、オートコンプリート、新規作成可能）

**SEO設定セクション**:

- メタディスクリプション（オプション、1-160文字、文字数カウンター、プレビュー表示）
- メタキーワード（オプション、カンマ区切り、最大10個）
- OGPタイトル（オプション、1-60文字、文字数カウンター）
- OGP説明（オプション、1-200文字、文字数カウンター）

**公開設定セクション**:

- 公開日時（必須、日時ピッカー、未来日時設定可能、スケジューリング機能）
- 公開フラグ（Boolean、トグルスイッチ）
- 下書きフラグ（Boolean、トグルスイッチ、デフォルト: true）
- 著者（自動設定、現在ログイン中の管理者、表示のみ）

**バリデーション**:

- クライアントサイド: Zodスキーマによるリアルタイムバリデーション
- サーバーサイド: Server Actionで再度バリデーション
- エラーメッセージ: フィールドごとに表示、日本語メッセージ

**プレビュー機能**:

- 公開ページと同じスタイルでプレビュー表示
- 新しいタブで開く
- 下書き状態でもプレビュー可能

**削除機能**:

- 確認ダイアログ表示
- 論理削除（将来的に物理削除に変更可能）

**一括操作**:

- 複数選択（チェックボックス）
- 一括公開/非公開
- 一括削除（確認ダイアログ）

#### カテゴリ管理 (`/admin/posts/categories`)

**一覧表示**:

- カテゴリ一覧をテーブル形式で表示
- 表示項目: 名前、スラッグ、説明、順序、記事数、作成日時、更新日時
- ドラッグ&ドロップで順序変更可能

**追加・編集フォーム**:

- カテゴリ名（必須、1-50文字、重複チェック）
- スラッグ（自動生成、手動編集可能、英数字・ハイフン・アンダースコアのみ、重複チェック）
- 説明（オプション、1-500文字）
- 順序（Int、自動設定、手動変更可能）

**削除機能**:

- 記事が紐づいている場合は削除不可（エラーメッセージ表示）
- 記事が紐づいていない場合のみ削除可能

#### タグ管理 (`/admin/posts/tags`)

**一覧表示**:

- タグ一覧をテーブル形式で表示
- 表示項目: 名前、スラッグ、使用数、作成日時、更新日時
- 使用数でソート可能

**追加・編集フォーム**:

- タグ名（必須、1-30文字、重複チェック）
- スラッグ（自動生成、手動編集可能、英数字・ハイフン・アンダースコアのみ、重複チェック）

**削除機能**:

- 記事が紐づいている場合は削除不可（エラーメッセージ表示）
- 記事が紐づいていない場合のみ削除可能

---

## Tiptap要件定義

### Tiptapの選択理由

**採用技術**: Tiptap（React版）

**選択理由**:

1. **Headless設計**: 見た目を完全に制御可能で、既存デザインシステムと統合しやすい
2. **React統合**: Next.js 16 App Routerと完全に統合可能
3. **拡張性**: 豊富な拡張機能とカスタム拡張の作成が可能
4. **UIコンポーネント**: 包括的なUIコンポーネントライブラリ（Components、Primitives、Node Components、Utils Components）
5. **アクセシビリティ**: WCAG 2.1 AA準拠のアクセシビリティ対応
6. **パフォーマンス**: 軽量で高速なエディタ
7. **コミュニティ**: 活発なコミュニティと豊富なドキュメント

### 必要な機能要件

**必須機能**:

- 見出し（H1, H2, H3）
- 段落
- リスト（順序付き、順序なし）
- 引用（Blockquote）
- リンク（内部リンク、外部リンク）
- 画像埋め込み（Cloudflare R2 にアップロード）
- 動画埋め込み（Cloudflare R2 にアップロード、オプション）
- コードブロック（シンタックスハイライト）
- テーブル（行・列の追加・削除、セル結合）
- 水平線
- テキストフォーマット（太字、斜体、下線、取り消し線）
- テキストカラー
- テキストハイライト
- テキスト配置（左、中央、右、両端揃え）

**推奨機能**:

- スラッシュコマンド（`/`でコマンドメニュー表示）
- 絵文字挿入
- アンカーリンク（見出しへのアンカーリンク）
- コピー&ペースト（リッチテキスト対応）
- アンドゥ・リドゥ

**オプション機能（将来追加可能）**:

- AI機能（Tiptap Pro版）
- コラボレーション編集（Tiptap Pro版）
- メンション機能

### 使用するTiptap拡張機能

**コア拡張**:

- `@tiptap/react`: React統合
- `@tiptap/starter-kit`: 基本機能セット
  - Document
  - Paragraph
  - Heading
  - Blockquote
  - HorizontalRule
  - HardBreak
  - Bold
  - Italic
  - Strike
  - Code
  - ListItem
  - BulletList
  - OrderedList

**追加拡張**:

- `@tiptap/extension-link`: リンク機能
- `@tiptap/extension-image`: 画像埋め込み
- `@tiptap/extension-video`: 動画埋め込み（カスタム拡張、Cloudflare R2対応）
- `@tiptap/extension-code-block`: コードブロック（シンタックスハイライト）
- `@tiptap/extension-table`: テーブル機能
  - `@tiptap/extension-table-row`: テーブル行
  - `@tiptap/extension-table-cell`: テーブルセル
  - `@tiptap/extension-table-header`: テーブルヘッダー
- `@tiptap/extension-text-align`: テキスト配置
- `@tiptap/extension-color`: テキストカラー
- `@tiptap/extension-text-style`: テキストスタイル
- `@tiptap/extension-highlight`: テキストハイライト
- `@tiptap/extension-underline`: 下線
- `@tiptap/extension-placeholder`: プレースホルダー

**オプション拡張（将来追加可能）**:

- `@tiptap-pro/extension-ai`: AI機能（Pro版）
- `@tiptap/extension-mention`: メンション機能
- `@tiptap/extension-emoji`: 絵文字機能

### 使用するTiptap UIコンポーネント

**Components（機能コンポーネント）**:

- `HeadingButton`: 見出しボタン
- `TextButton`: テキストフォーマットボタン（太字、斜体、下線など）
- `ListButton`: リストボタン
- `LinkPopover`: リンク設定ポップオーバー
- `ColorTextButton`: テキストカラーボタン
- `ColorHighlightButton`: ハイライトカラーボタン
- `ImageUploadButton`: 画像アップロードボタン
- `VideoUploadButton`: 動画アップロードボタン（カスタム実装）
- `BlockquoteButton`: 引用ボタン
- `CodeBlockButton`: コードブロックボタン
- `TextAlignButton`: テキスト配置ボタン
- `UndoRedoButton`: アンドゥ・リドゥボタン

**Primitives（基本UIコンポーネント）**:

- `Button`: ボタンコンポーネント
- `Toolbar`: ツールバーコンポーネント
- `Separator`: 区切り線
- `Spacer`: スペーサー
- `Popover`: ポップオーバー
- `DropdownMenu`: ドロップダウンメニュー

**Node Components（エディタ内ノードコンポーネント）**:

- `ParagraphNode`: 段落ノード
- `HeadingNode`: 見出しノード
- `BlockquoteNode`: 引用ノード
- `CodeBlockNode`: コードブロックノード
- `ListNode`: リストノード
- `ImageNodePro`: 画像ノード（高度版、フローティングツールバー付き）
- `VideoNode`: 動画ノード（カスタム実装、HTML5 videoタグ）
- `TableNode`: テーブルノード

**Utils Components（ユーティリティコンポーネント）**:

- `FloatingElement`: フローティングツールバー（テキスト選択時に表示）

### インストール要件

**パッケージインストール**:

```bash
# コアパッケージ
bun add @tiptap/react @tiptap/starter-kit

# 拡張機能
bun add @tiptap/extension-link @tiptap/extension-image @tiptap/extension-code-block
bun add @tiptap/extension-table @tiptap/extension-text-align
bun add @tiptap/extension-color @tiptap/extension-text-style @tiptap/extension-highlight
bun add @tiptap/extension-underline @tiptap/extension-placeholder
# 注意: 動画拡張はカスタム実装が必要（@tiptap/extension-videoは存在しないため）

# コードブロックのシンタックスハイライト（オプション）
bun add highlight.js
```

**UIコンポーネントのインストール**:

```bash
# Tiptap CLIを使用してコンポーネントをインストール
npx @tiptap/cli@latest add heading-button
npx @tiptap/cli@latest add text-button
npx @tiptap/cli@latest add list-button
npx @tiptap/cli@latest add link-popover
npx @tiptap/cli@latest add color-text-button
npx @tiptap/cli@latest add image-upload-button
# 注意: 動画アップロードボタンはカスタム実装が必要
npx @tiptap/cli@latest add blockquote-button
npx @tiptap/cli@latest add code-block-button
npx @tiptap/cli@latest add text-align-button
npx @tiptap/cli@latest add undo-redo-button

# Primitives
npx @tiptap/cli@latest add button
npx @tiptap/cli@latest add toolbar
npx @tiptap/cli@latest add separator
npx @tiptap/cli@latest add spacer
npx @tiptap/cli@latest add popover
npx @tiptap/cli@latest add dropdown-menu

# Node Components
npx @tiptap/cli@latest add paragraph-node
npx @tiptap/cli@latest add heading-node
npx @tiptap/cli@latest add blockquote-node
npx @tiptap/cli@latest add code-block-node
npx @tiptap/cli@latest add list-node
npx @tiptap/cli@latest add image-node-pro
# 注意: 動画ノードはカスタム実装が必要
npx @tiptap/cli@latest add table-node

# Utils Components
npx @tiptap/cli@latest add floating-element
```

### バージョン要件

**推奨バージョン**:

- `@tiptap/react`: 最新安定版（2.x系）
- `@tiptap/starter-kit`: 最新安定版（2.x系）
- その他の拡張機能: 最新安定版（2.x系）

**互換性**:

- React 19.2.3と完全に互換
- Next.js 16.1.1と完全に互換
- TypeScript 5.9.3と完全に互換

### セキュリティ要件

**XSS対策**:

- Tiptapは自動的にHTMLサニタイゼーションを実行
- 危険なHTMLタグや属性を自動的に除去
- 画像URLの検証（Cloudflare R2 URLのみ許可）
- 動画URLの検証（Cloudflare R2 URLのみ許可）

**入力検証**:

- サーバーサイドでHTMLコンテンツを再検証
- 許可されたHTMLタグのみ保存
- 画像URLの検証（Cloudflare R2 URLのみ許可）
- 動画URLの検証（Cloudflare R2 URLのみ許可）

### パフォーマンス要件

**エディタパフォーマンス**:

- 初期読み込み時間: 1秒以内
- エディタ操作の応答性: 60fps維持
- 大きなドキュメント（10,000文字以上）でもスムーズに動作

**最適化**:

- 動的インポートによるコード分割
- 画像の遅延読み込み
- 不要な拡張機能の除外

### デザイン統一要件

**管理画面エディタ**:

- 既存の管理画面デザインと統一
- シンプルで機能的なスタイル
- 編集しやすいUI

**公開ページ表示**:

- トップページ、予約ページと同じデザインシステムを使用
- Tailwind CSS Proseプラグインでリッチテキストを美しく表示
- レスポンシブデザイン対応

**実装方法**:

- Tailwind CSSによるスタイリング
- グローバルスタイル（`globals.css`）での定義
- ラッパーコンポーネントによる既存デザインシステムとの統合
- カスタムクラスの追加

### アクセシビリティ要件

- WCAG 2.1 AA準拠
- キーボードナビゲーション対応
- スクリーンリーダー対応
- 適切なARIAラベル
- コントラスト比の確保（4.5:1以上）

### データ形式

**保存形式**:

- HTML形式（Tiptapのデフォルト）
- データベースの`content`フィールドにHTML文字列として保存

**将来の拡張性**:

- JSON形式への移行も可能（TiptapのJSON形式サポート）
- バージョン管理や差分表示などの高度な機能に対応可能

---

## 画像・動画アップロード要件

### 画像アップロード

**対応フォーマット**:

- **JPEG** (`image/jpeg`): 広くサポート、写真に適している
- **PNG** (`image/png`): 透明度対応、ロゴ・アイコンに適している
- **WebP** (`image/webp`): 高圧縮率、モダンブラウザでサポート
- **AVIF** (`image/avif`): 次世代画像フォーマット、WebPよりも高圧縮率（約50%削減）、2020年以降の主要ブラウザでサポート

**AVIFの採用理由**:

- **高圧縮率**: WebPよりも約50%高い圧縮率で、ファイルサイズを大幅に削減
- **画質**: 同じファイルサイズでWebPよりも高画質
- **ブラウザサポート**: Chrome 85+、Firefox 93+、Safari 16+、Edge 85+で対応済み
- **Next.js Image Component**: AVIFを自動的にサポート、フォールバック機能あり
- **注意**: 古いブラウザではJPEG/PNG/WebPに自動フォールバック（Next.js Image Componentが自動処理）

**サイズ制限（用途別）**:

- **スペース管理** (`/admin/spaces`): 最大 **10MB**（メイン画像1枚、サブ画像複数枚）
- **ブログ管理** (`/admin/posts`): 最大 **5MB**（サムネイル画像、OGP画像、本文埋め込み画像）

**保存先**: Cloudflare R2

**最適化**:

- Next.js Image Componentを使用して自動最適化
- WebP/AVIF形式への自動変換（ブラウザサポートに応じて）
- レスポンシブ画像の提供（`srcset`対応）
- 遅延読み込み（Lazy Loading）

### 動画アップロード

**対応フォーマット**:

- **MP4** (`video/mp4`): H.264コーデック推奨、広くサポート
- **WebM** (`video/webm`): オープン形式、モダンブラウザでサポート

**推奨コーデック**:

- **MP4**: H.264（AVC）コーデック推奨（互換性が高い、すべての主要ブラウザでサポート）
- **WebM**: VP8またはVP9コーデック推奨（オープン形式、モダンブラウザでサポート）

**H.265（HEVC）コーデックについて**:

- **現時点では対応しない**（推奨しない）
- **理由**:
  1. **ブラウザサポートの制限**: Firefoxが特許ライセンス問題でサポートしていない（2026年1月時点）
  2. **ハードウェア依存**: 一部のPC（Dell、HPなど）でハードウェアデコーダーが無効化されている場合がある
  3. **互換性**: H.264と比較して、すべてのユーザー環境で確実に再生できるとは限らない
  4. **特許ライセンス**: 複雑なライセンス問題が存在
- **将来の検討**: ブラウザサポートがより広がり、互換性が向上した場合は再検討可能
- **代替案**: ファイルサイズを削減したい場合は、H.264で適切なビットレート設定やWebM（VP9）の使用を推奨

**サイズ制限（用途別）**:

- **スペース管理** (`/admin/spaces`): 最大 **100MB**（スペース紹介動画、1本のみ）
- **ブログ管理** (`/admin/posts`): 最大 **50MB**（本文埋め込み動画、複数本可能）

**保存先**: Cloudflare R2

**表示方法**:

- HTML5 `<video>`タグを使用
- コントロール（再生・一時停止・音量・フルスクリーン）を提供
- レスポンシブ対応（`width="100%"`、`height="auto"`）
- サムネイル画像の設定（オプション、動画の最初のフレームまたは手動設定）

**パフォーマンス最適化**:

- 遅延読み込み（Lazy Loading、`loading="lazy"`属性）
- プリロード設定（`preload="metadata"`推奨、全体を読み込まずにメタデータのみ）
- 動画の圧縮（アップロード前に推奨、ファイルサイズ削減）

**アクセシビリティ**:

- 字幕ファイル（WebVTT形式）の対応（将来的に実装可能）
- 動画の説明文（alt属性相当）の設定

**注意事項**:

- 動画ファイルは画像よりもファイルサイズが大きいため、アップロード時間が長くなる可能性がある
- 進捗表示（プログレスバー）の実装を推奨
- アップロード中のキャンセル機能を推奨
- 動画の再生には適切な帯域幅が必要（モバイル環境を考慮）

---

## データベース設計

詳細は [`DATABASE_DESIGN.md`](../architecture/DATABASE_DESIGN.md) を参照してください。

### Posts（ブログ記事）

**基本フィールド**:

- `id`: String (UUID), @id, @default(uuid())
- `title`: String, 必須, 1-200文字
- `slug`: String, 必須, ユニーク, @unique
- `excerpt`: String, 必須, 1-500文字
- `content`: String, 必須, リッチテキスト（HTML形式）
- `thumbnailUrl`: String, 必須, Cloudflare R2 URL
- `ogpImageUrl`: String?, オプション, Cloudflare R2 URL

**分類**:

- `categoryId`: String, 必須, FK → PostCategories.id
- `tags`: Json, タグID配列（String[]）, デフォルト: []

**SEO設定**:

- `metaDescription`: String?, オプション, 1-160文字
- `metaKeywords`: String?, オプション, カンマ区切り
- `ogpTitle`: String?, オプション, 1-60文字
- `ogpDescription`: String?, オプション, 1-200文字

**公開設定**:

- `publishedAt`: DateTime?, オプション, 公開日時
- `isPublished`: Boolean, デフォルト: false
- `isDraft`: Boolean, デフォルト: true
- `authorId`: String, 必須, FK → Users.id

**統計情報**:

- `viewCount`: Int, デフォルト: 0

**タイムスタンプ**:

- `createdAt`: DateTime, @default(now())
- `updatedAt`: DateTime, @updatedAt

**インデックス**:

- `@@index([slug])`（ユニーク）
- `@@index([isPublished, publishedAt])`
- `@@index([categoryId, isPublished, publishedAt])`
- `@@index([viewCount])`

**リレーション**:

- `category`: PostCategory, @relation(fields: [categoryId], references: [id], onDelete: Restrict)
- `author`: User, @relation(fields: [authorId], references: [id], onDelete: Restrict)

### PostCategories（ブログカテゴリ）

**基本フィールド**:

- `id`: String (UUID), @id, @default(uuid())
- `name`: String, 必須, 1-50文字, @unique
- `slug`: String, 必須, ユニーク, @unique
- `description`: String?, オプション, 1-500文字
- `order`: Int, 必須, デフォルト: 0

**タイムスタンプ**:

- `createdAt`: DateTime, @default(now())
- `updatedAt`: DateTime, @updatedAt

**インデックス**:

- `@@index([slug])`（ユニーク）
- `@@index([order])`

**リレーション**:

- `posts`: Post[]

### PostTags（ブログタグ）

**基本フィールド**:

- `id`: String (UUID), @id, @default(uuid())
- `name`: String, 必須, 1-30文字, @unique
- `slug`: String, 必須, ユニーク, @unique

**タイムスタンプ**:

- `createdAt`: DateTime, @default(now())
- `updatedAt`: DateTime, @updatedAt

**インデックス**:

- `@@index([slug])`（ユニーク）

---

## UI/UX要件

### デザイン統一性

**既存ページとの統一**:

- カラーパレット: トップページ、予約ページと同じカラーを使用
- タイポグラフィ: フォントファミリー、サイズ、行間を統一
- スペーシング: マージン、パディングを統一
- コンポーネント: 既存のUIコンポーネント（ボタン、カードなど）を再利用
- レスポンシブ: ブレークポイントを統一

**Tiptapエディタのスタイリング**:

- 管理画面エディタ: 編集しやすいシンプルなスタイル
- 公開ページ表示: デザイン性の高いスタイル（既存ページと統一）
- Tailwind CSS Proseプラグインを使用してリッチテキストを美しく表示

### Tiptap UIコンポーネントの包括的な利用

Tiptapは以下の4つのカテゴリのコンポーネントを提供しており、すべてデザインを統一できます：

1. **Components（機能コンポーネント）**: エディタの機能ボタン
2. **Primitives（基本UIコンポーネント）**: 基本的なUI要素（Button、Input、Cardなど）
3. **Node Components（エディタ内ノードコンポーネント）**: エディタ内のコンテンツノードの表示スタイル
4. **Utils Components（ユーティリティコンポーネント）**: エディタの補助機能（FloatingElement、SuggestionMenuなど）

すべてのコンポーネントは、Tailwind CSS、グローバルスタイル、ラッパーコンポーネント、カスタムクラスによって既存のデザインシステムと統一できます。

### アクセシビリティ

- WCAG 2.1 AA準拠
- キーボードナビゲーション対応
- スクリーンリーダー対応
- 適切なARIAラベル
- コントラスト比の確保

### パフォーマンス

- ISRによるキャッシュ戦略（5分間隔）
- 画像最適化（Next.js Image Component）
- ページネーションによるデータ分割
- 遅延読み込み（Lazy Loading）

---

## セキュリティ要件

### 認証・認可

- 管理画面は認証必須（Better Auth）
- 管理者ロールのみアクセス可能
- 著者情報は自動設定（現在ログイン中のユーザー）

### 入力検証

- クライアントサイド: Zodスキーマによるバリデーション
- サーバーサイド: Server Actionで再度バリデーション
- XSS対策: HTMLサニタイゼーション（Tiptapが自動処理）
- 画像アップロード: ファイル形式・サイズチェック

### データ保護

- スラッグの重複チェック
- SQLインジェクション対策（Prisma ORM使用）
- CSRF対策（Next.js Server Actionsが自動処理）

---

## エラーハンドリング

### クライアントサイド

- バリデーションエラー: フィールドごとに表示
- ネットワークエラー: エラーメッセージ表示、リトライ機能
- 404エラー: カスタム404ページ

### サーバーサイド

- データベースエラー: ログ記録、ユーザーに分かりやすいエラーメッセージ
- ファイルアップロードエラー: エラーメッセージ表示
- 権限エラー: 403エラーページ

---

## API要件

詳細は [`API.md`](../guides/coding-standards.md) を参照してください。

### Server Actions

- `createPost`: ブログ記事作成
- `updatePost`: ブログ記事更新
- `deletePost`: ブログ記事削除
- `getPost`: ブログ記事取得
- `getPosts`: ブログ記事一覧取得
- `createPostCategory`: カテゴリ作成
- `updatePostCategory`: カテゴリ更新
- `deletePostCategory`: カテゴリ削除
- `createPostTag`: タグ作成
- `updatePostTag`: タグ更新
- `deletePostTag`: タグ削除
- `incrementViewCount`: 閲覧数カウント

### Route Handlers

- `GET /api/posts/posts`: ブログ記事一覧取得（公開API）
- `GET /api/posts/posts/[slug]`: ブログ記事詳細取得（公開API）
- `GET /api/posts/categories`: カテゴリ一覧取得（公開API）
- `GET /api/posts/tags`: タグ一覧取得（公開API）

---

## テスト要件

> **Note**: 包括的なテスト要件定義については、[`testing.md`](./testing.md)を参照してください。このセクションでは、ブログ機能に特化したテスト要件を記載します。

### 単体テスト

- バリデーションスキーマ（Zod）
- Server Actions（`createPost`, `updatePost`, `deletePost`等）
- ユーティリティ関数

**テストフレームワーク**: Bun test（`bun:test`）を使用。詳細は[`testing.md`](./testing.md)を参照。

### 統合テスト

- フォーム送信フロー（Tiptapエディタ統合）
- データベース操作（Prisma経由、トランザクションを使用したテスト分離）
- 画像アップロード（Cloudflare R2）

**テスト環境**: テスト用データベースを使用。詳細は[`testing.md`](./testing.md)を参照。

### E2Eテスト

- ブログ記事作成フロー（管理画面）
- ブログ記事表示フロー（公開ページ、Server Components）
- カテゴリ・タグ管理フロー

**テストフレームワーク**: Playwrightを使用。詳細は[`testing.md`](./testing.md)を参照。

**注意**: Next.js 16のServer Components（ブログ記事表示ページ等）は、E2Eテストでテストすることを公式推奨。詳細は[`testing.md`](./testing.md)の「Next.js 16 App Router特有のテスト要件」セクションを参照。

---

## 実装優先順位

### フェーズ1: 基盤構築（1週間）

1. データベース設計・実装
   - Prismaスキーマ追加
   - マイグレーション実行
   - シードデータ投入

2. 基本Server Actions実装
   - CRUD操作
   - バリデーション

### フェーズ2: 管理画面実装（1-2週間）

1. カテゴリ管理
2. タグ管理
3. ブログ記事管理（基本機能）
4. Tiptapエディタ統合
5. 画像アップロード機能

### フェーズ3: 公開ページ実装（1週間）

1. ブログ一覧ページ
2. ブログ詳細ページ
3. カテゴリページ
4. タグページ
5. SEO最適化

### フェーズ4: 機能強化（1週間）

1. 関連記事表示
2. 人気記事表示
3. 検索機能
4. シェアボタン
5. 目次（TOC）機能

---

## 実装可能性評価

| 機能               | 技術的難易度 | 実装可能性 | 備考                             |
| ------------------ | ------------ | ---------- | -------------------------------- |
| ブログ記事管理     | 中           | ✅ 可能    | リッチテキストエディタ統合が必要 |
| カテゴリ・タグ管理 | 低           | ✅ 可能    | 標準的なCRUD操作                 |
| ブログ一覧・詳細   | 低〜中       | ✅ 可能    | ISRによるキャッシュ戦略          |
| SEO最適化          | 中           | ✅ 可能    | メタタグ、OGP設定                |
| 検索機能           | 中           | ✅ 可能    | サーバーサイド検索実装           |
| Tiptap統合         | 中           | ✅ 可能    | デザイン統一が重要               |
| 画像アップロード   | 低           | ✅ 可能    | Cloudflare R2使用                |

---

## 結論

ブログ機能を追加することで、以下のメリットが得られます：

1. **SEO対策**: 定期的なコンテンツ更新による検索エンジン最適化
2. **マーケティング**: スペースの魅力を伝える長期的なコンテンツ
3. **ユーザーエンゲージメント**: 関連記事、カテゴリ、タグによるサイト内回遊性向上
4. **コンテンツ管理**: カテゴリ・タグによる体系的なコンテンツ管理
5. **デザイン統一**: Tiptapと既存デザインシステムの完全な統合

お知らせ機能とブログ機能を分離することで、それぞれの用途に最適化された機能を提供できます。

---

## 参考資料

### プロジェクトドキュメント

- [`README.md`](./README.md) - 機能要件（概要）
- [`DATABASE_DESIGN.md`](../architecture/DATABASE_DESIGN.md) - データベース設計
- [`API.md`](../guides/coding-standards.md) - API仕様
- [`PROJECT_STRUCTURE.md`](../architecture/PROJECT_STRUCTURE.md) - プロジェクト構造
- [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) - システムアーキテクチャ
- [`testing.md`](./testing.md) - テスト要件定義（包括的なテスト要件、Bun test、Playwright、Prisma 7のベストプラクティス）

### 外部リソース

- [Tiptap Documentation](https://tiptap.dev/docs)
- [Tiptap UI Components](https://tiptap.dev/docs/ui-components/components/)
- [Tiptap Primitives](https://tiptap.dev/docs/ui-components/primitives/)
- [Tiptap Node Components](https://tiptap.dev/docs/ui-components/node-components/)
- [Tiptap Utils Components](https://tiptap.dev/docs/ui-components/utils-components/)

---

## 更新履歴

- **2026-01-08**: ドキュメント相互参照パスを修正（DATABASE_DESIGN.md、API.md、PROJECT_STRUCTURE.md、ARCHITECTURE.mdへのパスを正しいディレクトリに変更）
- **2026-01-07**: 画像・動画アップロード要件を追加:
  - 画像フォーマットにAVIFを追加（次世代画像フォーマット、高圧縮率）
  - 動画アップロード機能の要件定義を追加（MP4/WebM、サイズ制限、表示方法）
  - Tiptap拡張機能に動画埋め込み機能を追加
  - セキュリティ要件に動画URL検証を追加
