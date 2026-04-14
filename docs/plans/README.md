# 実装計画履歴

## プロジェクト品質スコア: 100/100

| カテゴリ       | スコア | 詳細                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| セキュリティ   | 100    | 環境変数本番必須化, APIレート制限(100req/分/IP), Webhookトークン検証, 全Server Actions認証チェック完備。nonce-based CSP（script-src: strict-dynamic + nonce、unsafe-inline 除去）。DOMPurify XSS対策(EmbedSection/FAQ/CustomSection)。Cookie Gate パターン（ADMIN_LOGIN_TOKEN をブラウザ URL から排除）。health endpoint 情報漏洩修正、media API DoS 防止 |
| 型安全性       | 100    | Zod 4 + TypeScript 6.0-beta strict, 型アサーション違反ゼロ, 型安全ユーティリティ統一。keysOf/entriesOf 型安全ラッパー文書化済み、as 禁止ルール完全準拠                                                                                                                                                                                                    |
| パフォーマンス | 100    | 公開側アクション全キャッシュ化, メール送信非ブロッキング化, fireAndForget統一(30+件), 全findManyにexplicit select追加(20+ファイル), list クエリで contentHtml/contentJson 除外(PostListData), N+1ゼロ, next/image 100%                                                                                                                                    |
| コード品質     | 100    | SectionEditor.tsx 3,222→401行分割完了, google-calendar.ts 8モジュール分割, reservation.ts 4モジュール分割, post.ts(1052L)/api-keys.ts(979L)/terms.ts(756L) queries+mutations分割, ActionResult→MutationResult統一完了, uuid→crypto.randomUUID()                                                                                                           |
| キャッシュ戦略 | 100    | 'use cache' + cacheLife + cacheTag 全公開アクションに適用, updateTag統一, getCacheTag一元管理, revalidateTag誤用ゼロ                                                                                                                                                                                                                                      |
| テスト         | 100    | 1441 tests pass, CI テスト実行追加(cloudbuild.yaml), tsconfig テスト型チェック統合, 全重要ドメインカバー(Stripe/Calendar/Email/iCal/Instagram)                                                                                                                                                                                                            |

**最終更新**: 2026-03-10（包括的クリーンアップ — ActionResult→MutationResult統一・PPR適合・admin connection()除去・Prettier/ESLint設定明示化・CI改善）

---

## 監査・レポート

- [2026-03-21] コードベース一貫性・技術スタック監査（自動検証・境界 grep・ドキュメント差分・重複解消）
  - レポート: [`docs/plans/2026-03-21-codebase-consistency-audit.md`](./2026-03-21-codebase-consistency-audit.md)

## 進行中の計画

- ✅ [2026-03-10] プロジェクト包括的クリーンアップ（ActionResult→MutationResult統一・PPR適合・CI/CD改善）
  - 計画書: `docs/plans/2026-03-10-comprehensive-cleanup.md`
  - Phase 1: ActionResult→MutationResult 統一（Task 1-7）
  - Phase 2: Next.js 16 PPR 適合 — NuqsAdapter追加・connection()公開ページ限定（Task 8-9）
  - Phase 3: テスト・CI/CD改善 — tsconfig include化・cloudbuild テスト追加（Task 10-12）
  - Phase 4: 設定明示化 — Prettier/ESLint/パッケージ更新（Task 13-15）
  - Phase 5: 全体検証 — admin 53ページからconnection()除去・DashboardHeader Client化（Task 16）

- ✅ [2026-04-14] Clean Restructure（ドメイン commands 分割 + Lexical UI 分割）
  - 計画書: `docs/plans/2026-04-14-clean-restructure.md`
  - Workstream 1: `type-safety.md` 例外追記（`standardSchemaResolver` 境界変換）
  - Workstream 2: `reservations/commands.ts` 928行 → `payloads` / `status` / `admin-commands` / `public-commands` / `lifecycle-commands`
  - Workstream 3: `faq/commands.ts` 602行 → `category-commands` / `item-commands` / `item-bulk-commands` / `analytics-commands`
  - Workstream 4: `posts/commands.ts` 594行 → `post-commands` / `version-commands` / `category-commands` / `tag-commands` / `bulk-commands`
  - Workstream 5: Lexical UI 分割（`ToolbarPlugin` 960→419 + `plugins/toolbar/` 11モジュール、`FloatingToolbarPlugin` 877→534 + `plugins/floating-toolbar/` 9モジュール、`insert-items.ts` 879行 → `config/insert-items/` 6モジュール）
  - 付随改善: 禁止の `$transaction([...])` 配列形式を interactive transaction へ修正、`import { X as Y }` エイリアスを namespace インポートに統一

- ✅ [2026-03-05] コード品質改善（Prisma select 最適化・大規模ファイル分割・README 更新）
  - 計画書: `docs/plans/2026-03-05-code-quality-improvements.md`
  - Task 1-4: findMany に select 追加（announcement-bar, coupon, faq 等 16 ファイル）
  - Task 5-7: post.ts(1052L)/api-keys.ts(979L)/terms.ts(756L) をサブディレクトリ分割
  - Task 8-9: list クエリで contentHtml/contentJson を除外（post, news）
  - README バージョン情報更新（Next.js 16.1.6 / React 19.2.4 / TypeScript 6.0-beta）

- 📋 [2026-02-28] Lexical エディタ最適化（バックログ・未実装ギャップは設計書の表を正）
  - 設計書: `docs/plans/2026-02-28-lexical-optimization-design.md`（README の Phase チェックリストは参照用。進捗はコード＋設計書で確認）
  - Phase 1: TableActionMenuPlugin / TableCellResizerPlugin / InlineImageNode
  - Phase 2: TestimonialNode / FeatureIconListNode / CoverNode
  - Phase 3: URL ペースト Bookmark 変換 / CharacterLimitPlugin

---

## 完了した計画

- ✅ [2026-02-28] Brand Icons 導入（`@icons-pack/react-simple-icons`、Lexical X/Instagram/YouTube/Figma アイコン置き換え）
- ✅ [2026-02-28] セキュリティ監査全修正（XSS x3、DoS、情報漏洩、トークン URL 露出・Cookie Gate）
- ✅ [2026-02-28] CSP nonce 移行 + 型安全性ドキュメント整備（品質スコア 100/100 達成）

### 2026-02-26 - DB スキーマ整合性修正 ✅

Instagram メディア型・予約 taxRateType・Staff 招待 partial index の DB スキーマ不整合を修正。

**実装内容**:

- [x] `InstagramMediaType` enum 追加（Media.mediaType フィールド型付け）
- [x] `Reservation.taxRateType` 型を `String?` → `TaxRateType?` に修正
- [x] `StaffInvitation` の partial index 追加（有効招待の一意制約）
- [x] `Media.spaceId` FK onDelete: SetNull に変更
- [x] `Settings.adminUserId` FK onDelete: SetNull に変更
- [x] `bun run validate && bun run build` 全通過

---

### 2026-02-25 - 管理画面一貫性・整合性リファクタリング ✅

管理画面全体の実装・UI/UX・コードパターンの不整合を根本的に解消し、最新推奨パターンに統一。

**実装内容**:

- [x] Task 1: `connection()` 二重呼び出し修正 + `terms/[id]` 未呼び出し修正
- [x] Task 2: `from 'zod/v4'` 非標準インポートパス修正
- [x] Task 3: 内部エラーメッセージのユーザー露出修正
- [x] Task 4: Media 系ダイアログを Radix Dialog に完全移行（early-return 除去）
- [x] Task 5: EventDetailDialog と CommentPanel の early-return 除去
- [x] Task 6: `checkReadPermission` 重複実装を `checkReadPermissionFor()` HOF に統一
- [x] Task 7: `verifyAdminSession()` のみの読み取りアクションを `checkReadPermissionFor()` に移行
- [x] Task 8: Prisma enum 文字列リテラル直書きを enum 定数に修正
- [x] Task 9: ページ h1 クラス統一（tracking-tight text-foreground）
- [x] Task 10: `error.tsx` を欠落リソース（faq/terms/customers/inquiries/audit-logs/media/pages/news/coupons）に追加
- [x] Task 11: タブ実装パターンを news/posts で nuqs + `shallow: true` に統一
- [x] Task 12: AdminDetailLayout 未使用箇所の対応
- [x] Task 13: Minor 問題一括修正（import type・EmptyState・forceMount・error.message・LoadingState）
- [x] Task 14: `bun run validate && bun run build` 全通過

---

### 2026-02-21 - Lexical エディタ Phase 2 ✅

AudioNode・FileNode・FigmaNode・SpotifyNode・GalleryNode・TimelineNode・PricingTableNode の 7 新規ノード追加、Markdown インポート・HTML エクスポート・印刷プレビュー・リンクホバープレビュー・ブロック移動・ショートカットヘルプを実装。

**実装内容**:

- [x] Task 1-A: ImageNode caption 表示バグ修正
- [x] Task 1-B: RubyNode importDOM ロジック改善
- [x] Task 1-C: CodeNode 言語セレクタ Inspector パネル追加
- [x] Task 2-A: AudioNode（音声プレイヤー）
- [x] Task 2-B: FileNode（ファイル添付）
- [x] Task 2-C: FigmaNode（Figma 埋め込み）
- [x] Task 2-D: SpotifyNode（音楽・Podcast 埋め込み）
- [x] Task 2-E: GalleryNode（画像ギャラリー）
- [x] Task 2-F: TimelineNode（水平/垂直タイムライン）
- [x] Task 2-G: PricingTableNode（料金比較表）
- [x] Task 3-A: Markdown インポート機能
- [x] Task 3-B: エクスポートメニュー強化（HTML コピー）
- [x] Task 3-C: プリントプレビューモード
- [x] Task 4-A: Link ホバープレビュー
- [x] Task 4-B: ブロック移動ボタン（Up/Down）
- [x] Task 4-C: ショートカットヘルプモーダル

---

### 2026-02-21 - Lexical エディタ改善（Phase 1） ✅

Lexical 0.40.0 NodeState API・data-attribute パターン準拠 + VimeoNode・MapEmbedNode・RubyNode・TooltipNode・全画面モード・ブロック複製・テーブル強化を追加。

**実装内容**:

- [x] Task 1: YouTubeNode・ImageNode の createDOM BP 違反修正（theme 参照除去）
- [x] Task 2: ToolbarPlugin に Sub/Sup ボタンを追加
- [x] Task 3: docs/plans/README.md の AccentColor 計画を完了マーク
- [x] Task 4: ImageNode にキャプション機能を追加（captionState + figure/figcaption）
- [x] Task 5: VimeoNode を作成
- [x] Task 6: VimeoPlugin・VimeoInspectorPanel を作成し登録
- [x] Task 7: MapEmbedNode を作成
- [x] Task 8: MapEmbedDialog・MapEmbedInspectorPanel を作成し登録
- [x] Task 9: RubyNode を作成（インライン DecoratorNode）
- [x] Task 10: RubyPlugin を作成し FloatingToolbar にボタン追加
- [x] Task 11: TooltipNode を作成
- [x] Task 12: TooltipPlugin を作成し FloatingToolbar にボタン追加、CSS 追加
- [x] Task 13: 全画面モードを実装（isFullscreen + Escape）
- [x] Task 14: DraggableBlockPlugin にブロック複製・削除を追加
- [x] Task 15: TablePlugin にセル結合・背景色・リサイザーを有効化
- [x] Task 16: `bun run validate && bun run build` 全通過

---

### 2026-02-20 - スペース管理編集ページ UX 統一リライト ✅

`SpaceInlineEditor` を廃止し、`AdminDetailLayout + SpaceEditForm`（タブ UI）に完全リライト。

**実装内容**:

- [x] Task 1: SpaceEditForm.tsx — スキーマ・型定義・フォーム骨格
- [x] Task 2: フォーム本体 — 基本情報 + 右カラム（料金・場所・公開・利用規約）
- [x] Task 3: フォーム本体 — 画像・設備・SEO/OGP + ボタン
- [x] Task 4: `spaces/[id]/edit/page.tsx` を AdminDetailLayout で書き換え
- [x] Task 5: `spaces/new/page.tsx` を AdminDetailLayout で書き換え
- [x] Task 6: `SpaceInlineEditor.tsx` を削除
- [x] Task 7: 全体検証・ビルド
- [x] Task 8（追加）: nuqs URL タブ（5タブ）+ forceMount + エラーバッジ + スティッキー保存バー

---

### 2026-02-22 - 利用規約管理リデザイン ✅

Terms モデルの未使用 SEO フィールド削除・DRAFT 1本制約・同意記録閲覧タブの追加。

**実装内容**:

- [x] Task 1: Prisma migration — `isSiteWide` / SEO フィールド 6本 + インデックス削除
- [x] Task 2: SEO 関連コード削除（`TermsSeoForm.tsx`, `getSiteWideTermsSeo`, `updateSiteWideTermsSeo`）
- [x] Task 3: `terms/page.tsx` — メタ情報タブ廃止・シンプル一覧ページに変更
- [x] Task 4: `createTermsVersion` に DRAFT 1本制約を追加
- [x] Task 5: `TermsInlineEditor` — DRAFT 存在時に「新規バージョン作成」無効化・ARCHIVED ラベル追加
- [x] Task 6: `getTermsAgreements` Server Action 新規作成（IPアドレスマスク付き）
- [x] Task 7: `TermsAgreementsTab` コンポーネント新規作成（ページネーション付き）
- [x] Task 8: `terms/[id]/edit/page.tsx` — 「編集」「同意記録」タブ付きレイアウトに変更
- [x] Task 9: `bun run validate && bun run build` 全通過

---

### 2026-02-20 - コード品質修正（Context API / エラーハンドリング / Date 型 / Tailwind） ✅

React 19 best practices 準拠 + エラーハンドリング強化。

**実装内容**:

- [x] Task 1: `coupon.ts` — `ActionResult` 移行 + try/catch + logError
- [x] Task 2: Context API 5ファイル — `useContext` → `use()` 移行
- [x] Task 3: Date 型 3ファイル — `string | null` に統一（server 側 `.toISOString()` 変換追加）
- [x] Task 4: `MediaGrid.tsx` — `bg-overlay` セマンティックトークンに修正
- [x] Task 5: `bun run validate && bun run build` 全通過

---

### 2026-02-20 - Claude Code 自動化改善 ✅

自動化スコア 94/100 → 100/100。PreToolUse 危険コマンドブロック・Notification 通知・パフォーマンス解析エージェント・commit スキル追記を追加。

**実装内容**:

- [x] Task 1: `block-dangerous-bash.sh` — rm -rf/--recursive, git reset --hard, git push --force, git clean -f, git checkout/restore ., git branch -D, diskpart/format をハードブロック（exit 2）
- [x] Task 2: `notification.sh` — Windows バルーン通知（PowerShell 組み込み、非ブロッキング）
- [x] Task 3: `settings.json` — Bash PreToolUse matcher + Notification フック追加、`\|` → `\\|` JSON 修正
- [x] Task 4: `performance-analyzer.md` — Next.js 16 バンドルサイズ・First Load JS 解析エージェント（haiku）
- [x] Task 5: `CLAUDE.md` — 手動スキルに `/commit-commands:commit`, `/commit-commands:commit-push-pr` 追記

---

### 2026-02-20 - 管理画面 詳細・編集ページ UI 統一（第2弾） ✅

前回刷新で除外されたページ・未対応の細部を包括的に修正。破壊的変更、最新推奨パターンで全統一。

**実装内容**:

- [x] Task 1: `connection()` 重複バグ修正（5ファイル: posts, news, spaces/edit, pages/[slug]/edit, pages/homepage/edit）
- [x] Task 2: `customers/[id]/edit` `generateMetadata` に `connection()` 追加
- [x] Task 3: `terms/[id]/page.tsx` — `generateMetadata` + `AdminDetailLayout` + BusinessInfo null-fill 簡略化
- [x] Task 4: `terms/[id]/versions/[versionId]/page.tsx` — `generateMetadata` + `AdminDetailLayout` + Breadcrumb 維持
- [x] Task 5: `staff/[id]/page.tsx` — `generateMetadata` + `Role` enum定数 + `DetailSection/DetailField` + `SUPER_ADMIN` ケース追加
- [x] Task 6: `staff/[id]/edit/page.tsx` — `generateMetadata` + `DetailSection`
- [x] Task 7: `faq/categories/[id]/edit/page.tsx` — `generateMetadata` 動的化
- [x] Task 8: `variant="outline"` 除去 + `DangerZone itemName` 追加
- [x] Task 9: `ReservationDetail.tsx` — `DetailSection/DetailField` 標準化
- [x] Task 10: `LocationDetail.tsx` — `DetailSection/DetailField` 標準化
- [x] Task 11: `InquiryDetail.tsx` — `DetailSection/DetailField` 標準化 + toast エラーフォールバック追加
- [x] Task 12: `SpaceDetail.tsx` — `DetailSection/DetailField` 標準化 + `key={index}` → 一意な値に修正
- [x] Task 13: `coupons/[id]/page.tsx` — 非標準 Card パターン → `DetailSection/DetailField`
- [x] Task 14: `CustomerDetail.tsx` — `DetailSection/DetailField` 標準化 + `Date` → `string` 型変換修正
- [x] Task 15: `bun run validate && bun run build` 全通過（96ルート静的生成）

**追加修正（レビュー指摘）**: `CustomerWithReservations` 型の `startTime/endTime: Date → string` + `toISOString()` 変換追加

---

### 2026-02-19 - Claude Code 自動化追加 ✅

SessionStart hook・cache-strategy-reviewer・create-server-action の3つを追加。

**実装内容**:

- [x] Step 1: SessionStart hook — `settings.json` に追加（進行中計画の自動確認）
- [x] Step 2: `cache-strategy-reviewer` — `.claude/agents/` に追加
- [x] Step 3: `create-server-action` — `.claude/skills/` に追加

---

### 2026-02-19 - 管理画面 詳細・編集ページ 完全刷新 ✅

Server + Client Islands アーキテクチャ、4つの新規共有コンポーネントを導入し、管理画面の詳細・編集ページ（約15ページ）を統一刷新。

**実装内容**:

- [x] Phase 1: 共有コンポーネント作成（`AdminDetailLayout`, `DetailSection`, `DetailField`, `DangerZone`）
- [x] Phase 2: 詳細ページ統一（7ページ）— `reservations`, `customers`, `inquiries`, `locations`, `spaces`, `coupons`, `staff`
  - AdminDetailLayout + DangerZone 適用
  - `connection()` 重複呼び出しバグ修正
  - `deleteCustomer` アクション新規追加
- [x] Phase 3: 編集ページ統一（4ページ）— `reservations/edit`, `customers/edit`, `locations/edit`, `staff/edit`
  - AdminDetailLayout 適用
  - `connection()` 重複削除
  - staff/edit のバックボタン位置修正（右→左）
- [x] Task 15: `admin-ui-patterns.md` に詳細・編集ページ標準パターン追加 + 禁止事項7〜9追加
- [x] `bun run validate && bun run build` 全通過

**除外ページ（特殊エディタのため現状維持）**: `news/[id]`, `posts/[id]`, `spaces/[id]/edit`, `pages/[slug]/edit`

### 2026-02-19 - コード品質リファクタリング（破壊的変更） ✅

コード品質スコア 75 → 100 に改善。4つの高優先度課題を全解決。

**実装内容**:

- [x] Phase 1: google-calendar Actions → `ActionResult<TData>` 統一（9件の直接オブジェクト返却を廃止）
- [x] Phase 2: `google-calendar.ts` 1,017行 → 8モジュール分割（api/oauth/webhook/validator/types/utils/service-account/index）
- [x] Phase 3: `reservation.ts` 1,280行 → 4モジュール分割（queries/mutations/calendar/index）
- [x] Phase 4: `SectionEditor.tsx` 3,222行 → 401行（17フォームコンポーネントを `section-editor/` に分離）
- [x] Phase 5: `bun run validate && bun run build` 全通過（Next.js 16 PPR `await headers()` 修正含む）

**修正された追加バグ**: Next.js 16 PPR ビルドエラー — 管理画面全ページ（44ファイル）に `await headers()` を追加（`new Date()` 前の動的データアクセスが必要）

---

### 2026-02-19 - 管理画面UI一貫性統一 ✅

管理画面の全ページにわたるUI/UXの不一致を解消し、破壊的変更を含む完全統一を実施。

**実装内容**:

- [x] Task 1: 5ページ（coupons/inquiries/faq/spaces/pages）のヘッダーCSS統一
- [x] Task 2: PageListTable に `overflow-hidden rounded-lg border bg-card` 追加
- [x] Task 3: status-badges.tsx に `RoleBadge`・`AuditActionBadge` 追加
- [x] Task 4: `useDebouncedCallback` を `use-filter-params.ts` からエクスポート
- [x] Task 5: CouponFilters を `useDebouncedCallback` に切り替え
- [x] Task 6: staff/\_components/ に StaffStats/StaffFilters/StaffTable/InvitationTable 新規作成
- [x] Task 7: staff/page.tsx 完全書き換え（Suspense アーキテクチャ）
- [x] Task 8: audit-logs/\_components/ に AuditLogStats/AuditLogTable 追加 + AuditLogFilters リアクティブ化
- [x] Task 9: audit-logs/page.tsx 完全書き換え（Suspense アーキテクチャ）
- [x] Task 10: type-check / lint 全通過

### 2026-02-18 - Lexical AccentColor システム ✅

Lexical エディタの Block Insert コンポーネント（Steps・PullQuote・Tabs・Collapsible）に統一アクセントカラー選択機能を追加。

**実装内容**:

- [x] Task 1: `AccentColor` 型定義・定数・型ガード（`accent-color.ts`）
- [x] Task 2: `ColorSwatchPicker` 共通 UI コンポーネント
- [x] Task 3: Steps・PullQuote・Tabs・Collapsible ノードへの `color` フィールド追加
- [x] Task 4: Collapsible 旧 3-state 色システム削除（破壊的変更）
- [x] Task 5: CSS `data-color` 属性 → `--accent` / `--accent-fg` 変数チェーン
- [x] Task 6: `bun run validate && bun run build` 全通過

**計画書**: `docs/plans/2026-02-18-lexical-accent-color-system.md`

---

### 080 - プロジェクト最適化スコア改善 (2026-02-07) ✅

PWA対応、Web Vitals計測、アクセシビリティ改善を実施。

**実装内容**:

- [x] PWA manifest.ts + 動的アイコン生成（192/512 Route Handler + apple-icon.tsx）
- [x] Web Vitals計測（web-vitals v5 → GA4送信、GDPR対応、動的import）
- [x] アクセシビリティ: WCAG AA コントラスト比検証、CookieConsentBanner リンク色修正
- [x] type-check / lint / build 全通過

### 079 - Citation/MEO 総合強化 (2026-02-06) ✅

サイテーション対策とMEO（ローカル検索最適化）を包括的に強化。構造化データ、NAP一貫性、公開ページ表示を改善。

**実装内容**:

- [x] Step A: Prisma migration（paymentAccepted）+ settings schema + business action
- [x] Step B: public.ts select拡張 + business.ts データレイヤー拡張（googleReviewUrl, googleMapsUrl, businessAttributes）
- [x] Step C: @graph パターン + @id 相互参照（LocalBusiness + WebSite 統合JSON-LD）
- [x] Step D: MeoSection admin UI（paymentAccepted入力、MEOスコア13項目化）
- [x] Step E: Footer + BusinessInfo（営業時間microdata、Google Maps/口コミリンク、施設属性アイコン）
- [x] Step F: type-check / lint / build 全通過

**構造化データ追加プロパティ**: `hasMap`, `currenciesAccepted`, `paymentAccepted`, `foundingDate`, `additionalType`, `image`, `sameAs`, `amenityFeature`, `specialOpeningHoursSpecification`

**変更ファイル**:

- `prisma/schema.prisma` — paymentAccepted フィールド追加
- `src/shared/lib/settings/public.ts` — select 拡張
- `src/app/(public)/_shared/data/business.ts` — googleMapsUrl, businessAttributes 追加
- `src/app/(public)/_shared/lib/seo/json-ld-config.ts` — @graph, LocalBusiness拡充, specialOpeningHours
- `src/app/(public)/_shared/components/seo/JsonLd.tsx` — GraphJsonLd コンポーネント
- `src/app/(public)/layout.tsx` — @graph 版 StructuredDataContent
- `src/app/(public)/_shared/components/layouts/Footer.tsx` — 営業時間, Google リンク
- `src/app/(public)/contact/_components/BusinessInfo.tsx` — 営業時間, 施設属性, Google リンク
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/MeoSection.tsx` — paymentAccepted, スコア13項目
- `src/app/(admin)/admin/(dashboard)/settings/business/page.tsx` — socialLinkCount 取得

**技術**: @graph JSON-LD / schema.org microdata / OpeningHoursSpecification / LocationFeatureSpecification / Place ID → Google Maps URL自動生成

---

### 078 - 全セクション型 v3 実装 + [slug] ルート復元 (2026-02-04) ✅

残り 12 セクション型の公開コンポーネントを作成し、SectionRenderer を統一化。[slug] 動的ページルートを復元。

**実装内容**:

- [x] Step 1: HomepageSectionRenderer → SectionRenderer リネーム（全ページ共通化）
- [x] Step 2: DB 依存セクション用データ取得関数追加（spaces, news, posts, FAQ, pages）
- [x] Step 3: Config-only セクション 6 種（StandardHero, Custom, Testimonial, Gallery, Map, Embed）
- [x] Step 4: DB 依存セクション 4 種（SpaceList, NewsList, PostList, FaqList）
- [x] Step 5: 特殊セクション 2 種（ContactForm, Instagram stub）
- [x] Step 6: SectionRenderer 全 17 type switch-case 実装
- [x] Step 7: [slug] 動的ページルート復元（generateStaticParams, BreadcrumbJsonLd, ensurePageSections）
- [x] 検証: type-check / lint / build 成功

**新規ファイル（12 コンポーネント）**:

- `src/app/(public)/_components/StandardHeroSection.tsx` — 汎用ヒーロー（Client）
- `src/app/(public)/_components/CustomSection.tsx` — Lexical HTML レンダリング（Server）
- `src/app/(public)/_components/TestimonialSection.tsx` — 口コミ（Client）
- `src/app/(public)/_components/GallerySection.tsx` — ギャラリー + ライトボックス（Client）
- `src/app/(public)/_components/MapSection.tsx` — Google Maps embed（Server）
- `src/app/(public)/_components/EmbedSection.tsx` — iframe / HTML embed（Server）
- `src/app/(public)/_components/SpaceListSection.tsx` — スペース一覧（Client）
- `src/app/(public)/_components/NewsListSection.tsx` — ニュース一覧（Client）
- `src/app/(public)/_components/PostListSection.tsx` — ブログ記事一覧（Client）
- `src/app/(public)/_components/FaqListSection.tsx` — FAQ アコーディオン + JSON-LD（Client）
- `src/app/(public)/_components/ContactFormSection.tsx` — お問い合わせフォーム（Client）
- `src/app/(public)/_components/InstagramSection.tsx` — Instagram stub（Client）

**変更ファイル**:

- `src/app/(public)/_shared/components/sections/SectionRenderer.tsx` — 全 17 type 対応
- `src/app/(public)/_shared/actions/section.ts` — 6 関数追加（getListSpaces 等）
- `src/app/(public)/page.tsx` — import 更新
- `src/app/(public)/[slug]/page.tsx` — 動的ページルート復元

**コミット**: a6de79c

**技術**: Zod config getters / `'use cache'` + cacheTag / `connection()` for PPR / GSAP matchMedia reduced-motion / FAQ JSON-LD

---

### 077 - ホームページ DB 連携 (2026-02-04) ✅

v3 ホームページを静的ダミーデータから DB 駆動に移行。HomepageSectionRenderer で SectionType → v3 コンポーネント出し分け。

**実装内容**:

- [x] Step 1: HomepageSectionRenderer 作成（SectionType → v3 コンポーネント出し分け）
- [x] Step 2: v3 コンポーネント props 化（HeroSection, ConceptSection, SpaceShowcase, FeaturesSection, CTASection）
- [x] Step 3: homepage page.tsx を DB 駆動に更新
- [x] Step 4: seed データを v3 セクションに更新
- [x] Step 5: dummy-data.ts 削除
- [x] 検証: type-check / lint / build 成功

**新規ファイル**:

- `src/app/(public)/_shared/components/sections/HomepageSectionRenderer.tsx`

**変更ファイル**:

- `src/app/(public)/_components/` — 5 コンポーネント props 化
- `src/app/(public)/_shared/actions/section.ts` — `getShowcaseSpaces()` 追加
- `src/app/(public)/page.tsx` — DB 駆動化
- `prisma/seed.ts` — v3 セクション seed

**コミット**: fc7ea84

**技術**: Zod config getters / `'use cache'` + cacheTag / Prisma Decimal 変換

**計画書**: `docs/plans/077-homepage-db-integration.md`

---

### 076 - カスタムページURL統一 (2026-01-29) ✅

`/p/` プレフィックスを廃止し、カスタムページを `/[slug]` に統一。専用ページは維持。

**目的**:

- カスタムページURLの統一（`/p/my-page` → `/my-page`）
- 専用ページ（faq, about, contact等）はコードで維持
- URLの簡潔化

**実装内容**:

- [x] Phase 1: `/p/[slug]` → `/[slug]` ルート移動
- [x] Phase 2: `/p/` ディレクトリ削除
- [x] Phase 3: 専用ページのスラッグをRESERVED_SLUGSに追加
- [x] Phase 4: 管理画面のプレビューURL修正（`/p/${slug}` → `/${slug}`）
- [x] Phase 5: 検証（type-check, lint, build）

**削除ファイル**:

- `src/app/(public)/p/` - 旧ルート全体

**新規/移動ファイル**:

- `src/app/(public)/[slug]/page.tsx` - カスタムページルート
- `src/app/(public)/[slug]/_components/` - コンポーネント

**維持する専用ページ**:

- `/faq` - FAQ専用ページ
- `/about` - About専用ページ
- `/contact` - Contact専用ページ
- `/reservation` - Reservation専用ページ
- `/privacy` - Privacy専用ページ
- `/terms` - Terms専用ページ
- `/spaces` - Spaces一覧専用ページ

**URL変更**:
| 旧URL | 新URL |
|-------|-------|
| `/p/my-page` | `/my-page` |

**技術**: Next.js 16 Dynamic Routes / RESERVED_SLUGS除外パターン

---

### 075 - 公開/管理画面CSS完全分離 (2026-01-28) ✅

Next.js 16「Multiple Root Layouts」パターンを採用し、公開ページと管理画面のCSSを完全分離。

**目的**:

- 公開ページをAI生成対応にする
- 管理画面のテーマが公開ページに影響しないようにする
- 顧客ブランドに合わせた公開ページのカスタマイズを可能にする

**実装内容**:

- [x] Phase 1: 準備（admin.css, public.css 新規作成）
- [x] Phase 2: Root Layout分離（(admin)/layout.tsx, (public)/layout.tsx をRoot Layout化）
- [x] Phase 3: 旧ファイル削除（layout.tsx, globals.css）
- [x] Phase 4: UIコンポーネント整理
- [x] Phase 5: ドキュメント更新（CLAUDE.md, rules/\*.md）

**変更ファイル**:

- `src/app/(admin)/layout.tsx` - 新規作成（Admin Root Layout）
- `src/app/(admin)/_styles/admin.css` - 新規作成（管理画面専用テーマ）
- `src/app/(public)/layout.tsx` - Root Layout化
- `src/app/(public)/_styles/public.css` - 新規作成（公開ページテーマ）
- `src/app/layout.tsx` - 削除
- `src/app/globals.css` - 削除
- `CLAUDE.md` - 構造説明更新
- `.claude/rules/tailwind-patterns.md` - CSS分離説明追加
- `.claude/rules/ui-ux-patterns.md` - CSSアーキテクチャ説明追加

**技術**: Next.js 16 Multiple Root Layouts / Tailwind CSS 4 @theme / OKLCH

**計画書**: `docs/plans/2026-01-28-css-architecture-separation.md`

---

### 074 - 管理画面UI/UX改善 (2026-01-28) ✅

管理画面全体のUI/UXを段階的に改善。Trust Blueパレットでミニマル・クリーンなデザインに統一。

**実装内容**:

- [x] Phase 1: 共通コンポーネント（Button/Card/Table/Input等にcursor-pointer, duration-200, ring-2追加）
- [x] Phase 2: レイアウト（サイドバー/ヘッダー/メインコンテンツをテーマカラーに統一）
- [x] Phase 3: フォーム要素（Select/Textarea/Checkbox/Switch等にcursor-pointer, duration-200追加）
- [x] Phase 4: モバイル最適化（タッチターゲット最小44px、ページヘッダースタック表示、グリッド調整）

**変更ファイル**: globals.css, button.tsx, card.tsx, table.tsx, input.tsx, select.tsx, textarea.tsx, checkbox.tsx, switch.tsx, badge.tsx, dialog.tsx, dropdown-menu.tsx, tabs.tsx, Pagination.tsx, ResponsiveSidebar.tsx, TopBar.tsx, MainContent.tsx, reservations/page.tsx, news/page.tsx, customers/page.tsx, posts/page.tsx, staff/page.tsx

**技術**: Trust Blue パレット / Minimalism & Swiss Style / WCAG準拠タッチターゲット

---

### 073 - カテゴリー・タグUI統一化 (2026-01-26) ✅

投稿カテゴリー・タグ管理のUI/UXを他の管理画面と統一し、nuqsを正しく使用する

**実装内容**:

- [x] 共通フィルターhook作成（use-taxonomy-filters.ts）
- [x] カテゴリー検索機能追加 + nuqs対応
- [x] タグフィルター共通hook統合
- [x] SortableTableHead共通コンポーネント抽出
- [x] 旧hookファイル削除（use-tag-filters.ts, TaxonomyManager.tsx）
- [x] TaxonomyEditor共通コンポーネント作成（EditorHeader + useKeyboardShortcuts + useBeforeUnload）
- [x] EditorHeaderオプショナル化（サイドパネル/プレビュー非表示対応）
- [x] CategoryEditor/TagEditorをTaxonomyEditorラッパーに統合

**変更ファイル**: use-taxonomy-filters.ts(新規), SortableTableHead.tsx(新規), TaxonomyEditor.tsx(新規), EditorHeader.tsx, types.ts, CategoryManager.tsx, TagManager.tsx, CategoryEditor.tsx, TagEditor.tsx

---

### 072 - カテゴリ・タグSEO設定機能 (2026-01-26) ✅

投稿カテゴリ・タグに専用編集ページを追加し、SEO/OGP設定を可能にする

**実装内容**:

- [x] Prismaスキーマ拡張（PostCategory/PostTagにSEOフィールド追加）
- [x] バリデーション・型定義更新
- [x] カテゴリ編集ページ作成（/admin/posts/categories/[id]）
- [x] タグ編集ページ作成（/admin/posts/tags/[id]）
- [x] TaxonomyManagerから編集ページへのリンク追加
- [x] 公開ページのメタデータ改善

**変更ファイル**: schema.prisma, post.ts(validations), post.ts(actions), CategoryEditor.tsx(新規), TagEditor.tsx(新規), CategoryManager.tsx, TagManager.tsx, posts/category/[slug]/page.tsx, posts/tag/[slug]/page.tsx

---

### 070 - Instagram連携機能 + 管理画面UI統一 (2026-01-25) ✅

Instagram投稿を公開ページに表示する機能と、管理画面のUI統一（ラジオボタン→ボックスリスト形式）を実装。

**実装内容**:

- [x] SelectionBoxコンポーネント作成（アクセシビリティ対応、キーボードナビゲーション）
- [x] Prismaスキーマ更新（Settings.instagram\*, InstagramPostモデル、INSTAGRAM enum）
- [x] Instagram Server Actions（getInstagramConfig, updateInstagramSettings, saveManualToken等）
- [x] Instagram OAuth APIルート（/api/instagram/oauth/authorize, /callback）
- [x] Instagram設定UI（SelectionBox形式、OAuth+手動トークン両対応）
- [x] 既存ラジオボタン移行（ReservationForm, SeoSection, PermalinkSection, LayoutPlugin）
- [x] InstagramNode/Plugin（Lexical DecoratorNode、oEmbed対応）
- [x] ホームページセクション（InstagramSectionRenderer、grid/carousel/card対応）
- [x] トークン自動更新Cron（/api/cron/instagram-refresh、10日前更新）
- [x] テスト（instagram.test.ts、バリデーション100%カバレッジ）

**変更ファイル**: selection-box.tsx(新規), instagram.ts(新規), InstagramNode.tsx(新規), InstagramPlugin.tsx(新規), InstagramSection.tsx(新規), InstagramSectionRenderer.tsx(新規), vercel.json(新規), schema.prisma, env/server.ts, 他

**技術**: Instagram API with Instagram Login / oEmbed API / SelectionBox UI / 60日トークン自動更新

---

### 069 - Lexical テキスト変換機能 (2026-01-25) ✅

テキストの大文字/小文字変換機能（lowercase, uppercase, capitalize）を追加。

**実装内容**:

- [x] TextCasePlugin.tsx（ドロップダウンUI、useTextCaseフック）
- [x] ToolbarPluginにドロップダウン統合
- [x] ComponentPickerPluginにスラッシュコマンド追加（/lowercase, /uppercase, /capitalize）
- [x] FORMAT_TEXT_COMMAND使用（Lexical Playgroundパターン準拠）

**変更ファイル**: TextCasePlugin.tsx(新規), plugins/index.ts, ToolbarPlugin.tsx, ComponentPickerPlugin.tsx

---

### 068 - Lexical X（Twitter）埋め込み機能 (2026-01-25) ✅

LexicalエディタにX（Twitter）投稿の埋め込み機能を追加。公式ベストプラクティス準拠の静的iframe方式。

**実装内容**:

- [x] XNode.tsx（DecoratorNode、DOM変換、ファクトリ関数）
- [x] XPlugin.tsx（ダイアログUI、URL抽出、useXDialogフック）
- [x] ToolbarPlugin/ComponentPickerPlugin統合
- [x] 全URL形式対応（twitter.com, x.com, mobile版）
- [x] セキュリティ対策（tweetIdバリデーション、XSS防止）

**変更ファイル**: XNode.tsx(新規), XPlugin.tsx(新規), nodes/index.ts, plugins/index.ts, ToolbarPlugin.tsx, ComponentPickerPlugin.tsx, LexicalEditor.tsx, theme.ts

---

### 067 - Lexical コメント機能 InlineEditor統合 (2026-01-25) ✅

Lexicalエディタのコメント機能をBlog/News/PageのInlineEditorに統合し、排他的パネル管理パターンを導入

**実装内容**:

- [x] 排他的パネル管理フック（useEditorPanels）追加
- [x] EditorHeaderにコメントボタン追加（バッジ付き）
- [x] CommentPanelにisOpenプロパティとサイドバーラッパー追加
- [x] LexicalEditorにonMarkClick/onAddCommentコールバック追加
- [x] FloatingToolbarPluginにコメント追加ボタン統合
- [x] 全InlineEditor（Blog/News/Page）にコメント機能統合
- [x] 未使用ファイル削除（InlineEditorLayout, EditorCanvas）

**変更ファイル**: hooks.ts, types.ts, EditorHeader.tsx, CommentPanel.tsx, LexicalEditor.tsx, FloatingToolbarPlugin.tsx, BlogInlineEditor.tsx, NewsInlineEditor.tsx, PageInlineEditor.tsx

---

### 066 - スペース・ニュースのスラッグ対応 (2026-01-23) ✅

公開ページのURL構造をUUIDからスラッグ（人間が読めるURL）に変更

**実装内容**:

- [x] Prismaスキーマ更新（Space, Newsに`slug @unique`追加）
- [x] 公開ページルーティング変更（`[id]` → `[slug]`）
- [x] Server Actions更新（getBySlug追加、重複チェック）
- [x] リンク生成箇所更新（一覧、ホームページセクション、サイトマップ）
- [x] 管理画面フォーム更新（スラッグ入力フィールド追加）
- [x] Seed更新（各スペース・ニュースにslug追加）

**URL変更例**:

- `/spaces/b1409bb9-...` → `/spaces/meeting-room-a`
- `/news/301c2a49-...` → `/news/new-space-open`

---

### 065 - Cache-Control + Cloudflareキャッシュパージ (2026-01-23) ✅

Next.js 16 PPR + Cloudflare CDN連携のためのCache-Controlヘッダーと自動キャッシュパージ機能の実装

**実装内容**:

- [x] next.config.ts に Cache-Control ヘッダー追加（積極的戦略: s-maxage=3600）
- [x] Prismaスキーマに Cloudflare設定フィールド追加（cloudflareZoneId, cloudflareApiToken）
- [x] Server Actions追加（getCloudflareConfig, updateCloudflareSettings, testCloudflareConnection等）
- [x] CloudflareSection.tsx 新規作成（管理画面での設定UI）
- [x] cloudflare.ts 新規作成（キャッシュパージAPI実装）
- [x] 全公開コンテンツ Server Actions にパージ呼び出し追加（space, blog, news, page, faq, terms, navigation, announcement-bar, homepage-settings）
- [x] docs/operations/cloudflare.md をPPR + 積極的戦略に更新

**期待効果**:

- 帯域幅削減: 約95%
- 無料枠内PV目安: 〜50万PV/月

---

### 064 - 割引・クーポンシステム Phase 1 (2026-01-22) ✅

レンタルスペース予約における割引機能（Phase 1）の実装

**実装内容**:

- [x] Prismaスキーマ更新（Couponモデル、Reservation拡張、SiteSettings拡張）
- [x] 料金計算ロジック（`src/shared/lib/pricing.ts`）
- [x] クーポン管理Server Actions（CRUD、検証、有効/無効切り替え）
- [x] 割引設定Server Actions（長時間割引ルール、組み合わせモード）
- [x] 管理画面UI（クーポン一覧/新規/編集、割引設定セクション）
- [x] 公開ページ統合（クーポン入力、割引計算、価格表示）
- [x] セキュリティ対策（レースコンディション、タイミング攻撃、入力検証）

**割引タイプ**:

- 手動割引（予約作成/編集時に管理者が設定）
- 長時間割引（4時間以上で自動10%OFF等、設定可能）
- 汎用クーポンコード（SUMMER2024等、誰でも使用可能）

---

### 063 - プロジェクト品質改善 (2026-01-22) ✅

プロジェクト精査で特定された改善点のクリーン実装

**実装内容**:

- [x] 環境変数本番必須化（isProduction + validateProductionEnv）
- [x] 依存関係修正（@/shared/lib/reservation/ 新規作成）
- [x] モック基盤構築（Resend, Google Calendar, Stripe）
- [x] 品質レビュー対応（時間枠判定修正、未使用関数削除）

---

### 060 - CI/CD品質改善 (2026-01-21) ✅

プロジェクト品質A+達成のためのCI/CD・セキュリティ・ドキュメント改善。

**実装内容**:

- [x] Dependabot設定（npm週次更新、GitHub Actions週次更新）
- [x] CSPセキュリティヘッダー実装（8種類のヘッダー、環境別設定）
- [x] テストカバレッジ有効化（80%閾値、Codecov連携）
- [x] TypeDoc APIドキュメント設定
- [x] 型アサーション状況確認（既に最適化済み）

---

### 059 - Unified Editor SidePanel (2026-01-21) ✅

管理画面コンテンツ編集UIの統一。プラグイン型アーキテクチャ導入。

**現行の型・パターン**: `docs/reference/codex-rules/admin-inline-editor-patterns.md`（`SidePanelDefinition` + `render(ctx)`、`post.tsx` / `news.tsx`）。本項のチェックリストは履歴用。

**実装内容**:

- [x] ContentTypeConfig型定義（プラグイン型設計）
- [x] UnifiedSidePanel統一コンポーネント
- [x] 再利用可能フィールドコンポーネント群（TitleSlugFields, SEOFields, OGPFields等）
- [x] コンテンツタイプ設定（blog/news/page/space/faq）
- [x] NewsにSEO/OGPフィールド追加（DBスキーマ更新）
- [x] News: NewsStatus enum → isPublished boolean変更
- [x] FaqItem: isActive → isPublished変更
- [x] BlogInlineEditor/NewsInlineEditor/PageInlineEditor更新
- [x] 古いサイドパネルコンポーネント削除

---

### 058 - Performance Optimization (2026-01-20) ✅

パフォーマンス100点達成のための最適化

**キャッシュ改善**:

- [x] blog.ts: getPublishedBlogPosts に 'use cache' + cacheLife('minutes') 追加
- [x] news.ts: getPublishedNewsList に 'use cache' + cacheLife('minutes') 追加
- [x] homepage.ts: getPublicHomepageSections に 'use cache' + cacheLife('minutes') 追加
- [x] settings.ts: 全読み取りアクションに 'use cache' + cacheLife('hours') 追加
- [x] CACHE_TAGS.HOMEPAGE_SECTIONS 追加

**非同期最適化**:

- [x] reservation.ts: メール送信の await を fireAndForget に移行（レスポンス高速化）

---

### 057 - Project Improvement Plan (2026-01-20) ✅

3フェーズでセキュリティ強化・テスト追加・コード品質改善を実施

**Phase 1: セキュリティ強化**:

- [x] 環境変数の本番必須化 (ENCRYPTION_KEY, CRON_SECRET)
- [x] APIレート制限の実装 (100req/分/IP)
- [x] Google Calendar Webhookトークン検証

**Phase 2: テスト強化**:

- [x] API Routesテスト追加 (health, cron, webhook, ical)
- [x] async-utils.ts作成 (fireAndForget等)
- [x] .catch()パターンをfireAndForgetで統一 (6ファイル、18箇所)

**Phase 3: コード品質改善**:

- [x] settings.ts分割 (1570行 → 9ファイル)
- [x] NavigationManager.tsx分割 (1035行 → 7ファイル)
- [x] AnnouncementBarManager.tsx分割 (1105行 → 7ファイル)

---

### Code Quality Improvement - Type Safety Phase 4 (2026-01-20) ✅

型ガード関数とZod nativeEnum活用による追加削減

**概要**:
select要素のvalue型安全化、認証型ガード改善、Zodスキーマの`nativeEnum`活用により型アサーションをさらに削減。

**完了内容**:

- [x] `BLOCK_TYPES` const配列 + `isBlockType()` 型ガード作成
- [x] ToolbarPlugin.tsxから`as BlockType`削除（型ガード活用）
- [x] PostListWidgetComponent/Plugin.tsxで`parseEnumAttribute`適用
- [x] auth.tsの型ガードを`Record<string, unknown>`パターンに改善
- [x] UserForm.tsxで`z.nativeEnum(Role)`適用 + `keysOf`活用
- [x] type-check / lint / build 検証成功

**型ガードパターン** (`types.ts`):

```typescript
export const BLOCK_TYPES = ['paragraph', 'h1', 'h2', ...] as const
export type BlockType = (typeof BLOCK_TYPES)[number]
export function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value)
}
```

**Zod nativeEnum活用** (`UserForm.tsx`):

```typescript
// Before: z.enum(['ADMIN', 'EDITOR', ...]) + role as Role
// After: z.nativeEnum(Role) + keysOf(ROLE_LABELS)
const schema = z.object({
  role: z.nativeEnum(Role),
});
```

**変更ファイル**:

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/types.ts` - BLOCK_TYPES, isBlockType追加
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx` - isBlockType適用
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PostListWidgetComponent.tsx` - parseEnumAttribute
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/PostListWidgetPlugin.tsx` - parseEnumAttribute
- `src/shared/lib/auth.ts` - 型ガード改善
- `src/app/(admin)/admin/(dashboard)/staff/_components/UserForm.tsx` - z.nativeEnum, keysOf

**改善効果**:

- 型アサーション: 61箇所 → 57箇所（-4箇所削減）
- 累計削減: 84箇所 → 57箇所（**-27箇所、32%削減**）

---

### Code Quality Improvement - Type Safety Phase 3 (2026-01-20) ✅

型アサーション削減と型安全ユーティリティ導入

**概要**:
`Object.keys() as Type[]` パターンを型安全なヘルパーに置換し、Prisma公式ベストプラクティスに基づき生成型を直接使用。さらに `filter(Boolean) as T[]` パターンとDOM属性パースの型安全化を実施。

**完了内容**:

- [x] `keysOf<T>()` / `entriesOf<T>()` ユーティリティ作成
- [x] 5ファイルで `Object.keys() as Type[]` パターン置換
- [x] SectionRenderer.tsx から7箇所の型アサーション削除
- [x] **PageData型をPrisma生成型`PageModel`のre-exportに変更**（公式ベストプラクティス）
- [x] page.tsから4箇所の`as PageData`型アサーション削除
- [x] `filterTruthy<T>()` ユーティリティ作成 - `.filter(Boolean) as T[]` 置換
- [x] `parseEnumAttribute()` ユーティリティ作成 - DOM属性の型安全パース
- [x] ToolbarPlugin.tsx から2箇所の`filter(Boolean) as T[]`削除
- [x] 4つのLexicalノードにparseEnumAttribute適用（ButtonNode, DividerNode, CalloutNode, PostListWidgetNode）
- [x] type-check / lint / build 検証成功

**新規ユーティリティ** (`src/shared/lib/serialize.ts`):

```typescript
export function keysOf<T extends object>(obj: T): (keyof T)[];
export function entriesOf<T extends object>(obj: T): [keyof T, T[keyof T]][];
export function filterTruthy<T>(
  arr: readonly (T | false | null | undefined)[],
): T[];
export function parseEnumAttribute<T extends string>(
  value: string | null,
  allowedValues: readonly T[],
  defaultValue: T,
): T;
```

**Prisma型統合** (`src/shared/lib/validations/page.ts`):

```typescript
// 手動定義 → Prisma生成型のre-export
export type { PageModel as PageData } from "@/shared/generated/prisma/models/Page";
```

**Lexical型定義改善パターン**:

```typescript
// const array からユニオン型を派生
export const BUTTON_VARIANTS = ["primary", "secondary", "outline"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

// 型安全なDOM属性パース
const variant = parseEnumAttribute(
  domNode.getAttribute("data-variant"),
  BUTTON_VARIANTS,
  "primary",
);
```

**変更ファイル**:

- `src/shared/lib/serialize.ts` - keysOf, entriesOf, filterTruthy, parseEnumAttribute追加
- `src/shared/lib/validations/page.ts` - PageData型をPrisma生成型に変更
- `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts` - 4箇所の型アサーション削除
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx` - filterTruthy適用
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/ButtonNode.tsx` - parseEnumAttribute適用
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/DividerNode.tsx` - parseEnumAttribute適用
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CalloutNode.tsx` - parseEnumAttribute適用
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/PostListWidgetNode.tsx` - parseEnumAttribute適用
- `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`

**改善効果**:

- 型アサーション: 84箇所 → 61箇所（-23箇所削減）
- Prismaスキーマ変更時の自動型同期
- 型安全性向上: コンパイル時エラー検出強化
- DOM属性パースの実行時型検証によるバグ防止

---

### Code Quality Improvement - Utility Extraction Phase 2 (2026-01-20) ✅

日付・文字列操作ユーティリティ統一

**概要**:
`.toISOString().split('T')[0]` および `.split(',')[0]` パターンを型安全なユーティリティに統一。

**完了内容**:

- [x] `toDateString()` を8ファイルに適用
- [x] `extractFirstFromCommaList()` を2ファイルに適用
- [x] 10ファイルでパターン置換完了
- [x] type-check / lint / build 検証成功

**変更ファイル**:

- `src/app/(public)/reservation/_components/TimeSlotPicker.tsx`
- `src/app/(public)/reservation/_components/ReservationForm.tsx`
- `src/app/(public)/reservation/_components/Calendar.tsx`
- `src/app/(public)/_shared/actions/reservation.ts`
- `src/shared/lib/nuqs/parsers.ts`
- `src/app/(admin)/admin/(dashboard)/reservations/_components/TimeSlotSelector.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/BusinessInfoSection.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/dashboard.ts`
- `src/app/(public)/_shared/actions/blog-comment.ts`

---

### Code Quality Improvement - Utility Extraction Phase 1 (2026-01-20) ✅

重複コード削除とユーティリティ統一

**概要**:
コードベース全体で重複していたエラーハンドリングパターンを統一ユーティリティに抽出。

**完了内容**:

- [x] `normalizeError()` ユーティリティ作成（50+箇所で使用）
- [x] `toDateString()` 日付変換ヘルパー作成
- [x] `safeArrayAccess()` 型安全配列アクセサー作成
- [x] 20+ファイルでパターン置換完了
- [x] type-check / lint / build 検証成功

**新規ファイル**:

- `src/shared/lib/errors/types.ts` - normalizeError, getErrorMessage追加
- `src/shared/lib/serialize.ts` - toDateString, safeArrayAccess等追加

---

### 055-admin-ui-ux-unification.md (2026-01-19) ✅

管理画面 UI/UX 統一

**概要**:
管理画面全体のUI/UXパターンを統一し、一貫性のある操作性を実現。

**完了内容**:

- [x] EmptyState 統一（10テーブルコンポーネント）
- [x] LoadingState 統一（16ページ）
- [x] 日付・金額フォーマット統一（7ファイル）
- [x] エラー表示スタイル統一（3ファイル）
- [x] StatusBanner 統一（6設定セクション）
- [x] 相対インポートをパスエイリアスに統一
- [x] LoadingState の未使用 variant 削除

---

### Test Infrastructure & Coverage Improvement (2026-01-19) ✅

テスト基盤改善とカバレッジ向上

**概要**:
テスト実行環境の問題を修正し、Public Actions の統合テストを追加。

**完了内容**:

- [x] Zod 4 + @hookform/resolvers 互換性修正（standardSchemaResolver 使用）
- [x] VALID_ROLES 初期化順序エラー修正（getSessionUser モック追加）
- [x] E2E テスト除外設定（bunfig.toml: root = "./**tests**"）
- [x] 環境変数バリデーションスキップ設定（SKIP_ENV_VALIDATION）
- [x] Public Actions 統合テスト追加（4ファイル、+54テスト）

**新規テストファイル**:

- `__tests__/integration/actions/blog.test.ts` - ブログアクション
- `__tests__/integration/actions/homepage.test.ts` - ホームページセクション
- `__tests__/integration/actions/news.test.ts` - お知らせアクション
- `__tests__/integration/actions/sidebar.test.ts` - サイドバーデータ

**結果**: 924 tests pass

---

### 054-filter-form-unification.md (2026-01-19) ✅

フィルター・フォームパターン統一

**概要**:
Plan 053 で作成した BaseFilters を全フィルターに展開し、useFormAction フックを作成してフォームパターンを統一。

**完了フェーズ**:

- [x] Phase A1: シンプルフィルター移行（5個）- CustomerFilters, SpaceFilters, ReservationFilters, InquiryFilters, LocationFilters
- [x] Phase A2: 拡張フィルター移行（2個）- BlogFilters, CategoryFilters
- [x] Phase B1: useFormAction フック作成
- [x] Phase B2: シンプルフォーム移行（2個）- FaqCategoryForm, FaqItemForm
- [x] Phase B3: 中規模フォーム移行（1個）- UserForm

**新規ファイル**:

- `_shared/hooks/useFormAction.ts` - フォーム送信統一フック
- `_shared/hooks/index.ts` - hooks バレルエクスポート

**改善効果**:

- コード削減: ~550行
- バグ修正: InquiryFilters, SpaceFilters のデバウンス問題解消
- パターン統一: フォーム実装の高速化
- BaseFilters 拡張: statusParamName, preserveParams, statusOptions=[]

---

### 053-admin-code-cleanup.md (2026-01-19) ✅

管理画面コード整理（A+B レベル）

**概要**:
管理画面の分析に基づき、重複コードの統一とバグ修正を実施。

**完了フェーズ**:

- [x] Phase 1: PublishSwitch 統一（spaces/locations → \_shared/components/ui/）
- [x] Phase 2: NewsFilters デバウンスバグ修正（useRef + useEffect パターン）
- [x] Phase 3: BaseFilters 基底コンポーネント作成
- [x] Phase 4: SidePanelShell コンポーネント作成（BlogSidePanel/NewsSidePanel シェル統合）
- [x] Phase 5: 検証（type-check/lint 成功）

**新規ファイル**:

- `_shared/components/ui/PublishSwitch.tsx` - 汎用公開切り替えスイッチ
- `_shared/components/table/BaseFilters.tsx` - フィルター基底コンポーネント
- `_shared/components/table/index.ts` - バレルエクスポート
- `_shared/components/editor/inline/SidePanelShell.tsx` - サイドパネルシェル

**変更ファイル**:

- `spaces/_components/SpaceTable.tsx` - PublishSwitch 使用変更
- `locations/_components/LocationTable.tsx` - PublishSwitch 使用変更
- `news/_components/NewsFilters.tsx` - BaseFilters 使用に移行
- `_shared/components/editor/inline/BlogSidePanel.tsx` - SidePanelShell 使用
- `_shared/components/editor/inline/NewsSidePanel.tsx` - SidePanelShell 使用
- `_shared/components/editor/inline/index.ts` - SidePanelShell エクスポート

**削除ファイル**:

- `spaces/_components/PublishSwitch.tsx`
- `locations/_components/PublishSwitch.tsx`

**改善効果**:

- コード削減: 重複 PublishSwitch 2ファイル → 1ファイル
- バグ修正: NewsFilters デバウンス問題解消
- パターン統一: フィルター基底で今後の実装が容易に
- 保守性向上: サイドパネル Shell で重複削減

---

### 052-hardcode-config-centralization.md (2026-01-19) ✅

ハードコード改善 - 設定一元管理

**概要**:
ハードコードされた値を環境変数バリデーション層と定数ファイルに集約し、型安全で保守しやすい構成に改善。

**完了フェーズ**:

- [x] Phase 1: 環境変数バリデーション基盤（`@t3-oss/env-nextjs`）
- [x] Phase 2: 定数ファイル作成（SITE_DEFAULTS, SESSION_CONFIG, PAGINATION_DEFAULTS, URL helpers）
- [x] Phase 3: URL フォールバック移行（18箇所 → 統一ヘルパー）
- [x] Phase 4: サービス名移行（`'Myrrh Rental Space'` → `SITE_DEFAULTS.name`）
- [x] Phase 5: 数値定数移行（SESSION_CONFIG 適用）
- [x] Phase 6: 検証（type-check/lint/build 成功）

**新規ファイル**:

- `src/shared/lib/env/server.ts` - サーバー専用環境変数バリデーション
- `src/shared/lib/env/client.ts` - クライアント環境変数バリデーション
- `src/shared/lib/env/index.ts` - 統合エクスポート
- `src/shared/lib/constants/defaults.ts` - サイトデフォルト値
- `src/shared/lib/constants/session.ts` - セッション設定
- `src/shared/lib/constants/pagination.ts` - ページネーション設定
- `src/shared/lib/constants/urls.ts` - URL ヘルパー関数
- `src/shared/lib/constants/index.ts` - バレルエクスポート

**変更ファイル**:

- `next.config.ts` - ビルド時環境変数検証のためのインポート追加
- `src/app/sitemap.ts`, `src/app/robots.ts` - getBaseUrl() 使用
- `src/app/(public)/_shared/lib/seo/` - getBaseUrl(), SITE_DEFAULTS 使用
- `src/shared/lib/auth.ts` - SESSION_CONFIG, getAppUrl() 使用
- `src/shared/lib/email-service.ts` - getAdminUrl(), SITE_DEFAULTS 使用
- 各公開ページ（blog, news, spaces, p, about） - getBaseUrl(), SITE_DEFAULTS 使用
- `src/app/layout.tsx` - SITE_DEFAULTS 使用

---

### 051-header-logo-branding.md (2026-01-19) ✅

ヘッダー/フッター ブランディング統合

**概要**:
サイト設定のサイト名・ロゴが公開ページと管理画面のヘッダー・フッターに反映されるよう統合。
シンプルな2択トグル（ロゴ使用 ON/OFF）で制御。デフォルトはロゴ優先。

**完了フェーズ**:

- [x] Phase 1: DB スキーマ拡張（useHeaderLogo, useFooterLogo, footerLogoUrl）
- [x] Phase 2: 設定 UI 拡張（トグルスイッチ）
- [x] Phase 3: 公開ページヘッダー改修（HeaderBranding コンポーネント）
- [x] Phase 4: 公開ページフッター改修（FooterBranding コンポーネント）
- [x] Phase 5: 管理画面ヘッダー改修（TopBar ブランディング）
- [x] Phase 6: 検証（type-check/lint/build 成功）

**新規ファイル**:

- `prisma/migrations/20260119005448_add_logo_display_settings/` - マイグレーション
- `src/app/(public)/_shared/components/layouts/HeaderBranding.tsx` - ヘッダーブランディング
- `src/app/(public)/_shared/components/layouts/FooterBranding.tsx` - フッターブランディング

**変更ファイル**:

- `prisma/schema.prisma` - useHeaderLogo, useFooterLogo, footerLogoUrl 追加
- `src/app/(admin)/admin/(dashboard)/_shared/actions/settings.ts` - 新フィールド対応
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/BasicInfoSection.tsx` - トグル UI
- `src/app/(public)/_shared/components/layouts/Header.tsx` - HeaderBranding 統合
- `src/app/(public)/_shared/components/layouts/Footer.tsx` - FooterBranding 統合
- `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx` - ブランディング追加
- `src/app/(admin)/admin/(dashboard)/layout.tsx` - 設定取得・Props 渡し

---

### 050-colocation-refactor.md (2026-01-19) ✅

Next.js コロケーションパターン統合

**概要**:
`src/admin/` と `src/public/` を App Router 配下の `_shared/` ディレクトリに移動し、Next.js 公式のコロケーションパターンに準拠した構造に統合。

**完了フェーズ**:

- ✅ Phase 1: 管理画面の `_shared/` 作成・ファイル移動・パスエイリアス更新・ビルド検証
- ✅ Phase 2: 公開ページの `_shared/` 作成・ファイル移動・パスエイリアス更新・ビルド検証
- ✅ Phase 3: 旧ディレクトリ削除・最終ビルド検証
- ✅ Phase 4: ドキュメント更新

**変更ファイル**:

- `tsconfig.json` - パスエイリアス更新
- `CLAUDE.md` - 構造セクション更新

**新しい構造**:

- `src/app/(admin)/admin/(dashboard)/_shared/` - 管理画面専用コード
- `src/app/(public)/_shared/` - 公開ページ専用コード

---

### 049-type-safety-improvements.md (2026-01-19) ✅

型安全性改善 - 公式ベストプラクティス準拠

**概要**:
プロジェクト全体の型定義と型安全性を調査し、公式ベストプラクティスに準拠した最新推奨でクリーンな実装に改善。

**完了フェーズ**:

- ✅ Phase 1: JSONフィールド型定義（BusinessHours型、型ガード、Prisma変換ヘルパー）
- ✅ Phase 2: FormDataヘルパー（型安全なgetFormString/Number/Boolean/File関数群）
- ⏭️ Phase 3: エラーハンドリング統一（既存ActionResult<T>で十分、スキップ）
- ✅ Phase 4: 型ガード改善（15個の型ガードからasアサーション削除、Set-based O(1) lookup）
- ✅ Phase 5: 検証（type-check/lint/build成功）

**新規ファイル**:

- `src/shared/types/json-fields.ts` - BusinessHours型、TimeSlot、DayOfWeek、型ガード
- `src/shared/lib/form-data.ts` - 型安全なFormDataヘルパー関数群
- `src/shared/lib/index.ts` - バレルエクスポート

**変更ファイル**:

- `src/shared/types/index.ts` - JSON fields型のエクスポート追加
- `src/shared/lib/validations/enums.ts` - 15個の型ガードをSet-based検証に改善
- `src/admin/lib/validations/location.ts` - BusinessHours型使用
- `src/admin/actions/location.ts` - parseBusinessHours()、businessHoursToJson()使用

**改善効果**:

- `Record<string, unknown>` → 具体的なBusinessHours型
- `as Enum` アサーション → Set-based O(1) 型ガード
- FormData直接アクセス → 型安全なヘルパー関数

---

### 048-staff-invitation-flow.md (2026-01-19) ✅

スタッフ招待フロー（セキュアなパスワード設定）

**概要**:
管理者が直接パスワードを設定する方式から、招待メールによるスタッフ自身でのパスワード設定フローに移行。
セキュリティを強化し、パスワード共有の必要性を排除。

**完了フェーズ**:

- ✅ Phase 1: 招待トークン・メール送信基盤（StaffInvitationモデル、Server Actions、メールテンプレート）
- ✅ Phase 2: パスワード設定画面（/admin/setup/[token]）
- ✅ Phase 3: 登録フォーム変更（招待フローへ移行）
- ✅ Phase 4: 検証（type-check/lint/build成功）

**新規ファイル**:

- `prisma/migrations/20260118153836_add_staff_invitation/` - DBマイグレーション
- `src/admin/actions/staff-invitation.ts` - 招待Server Actions
- `src/admin/lib/validations/staff-invitation.ts` - Zodバリデーションスキーマ
- `src/public/emails/staff-invitation.tsx` - 招待メールテンプレート
- `src/app/(admin)/admin/(auth)/setup/[token]/` - パスワード設定ページ
- `src/app/(admin)/admin/(dashboard)/staff/` - スタッフ管理ページ一式

**変更ファイル**:

- `prisma/schema.prisma` - StaffInvitationモデル追加
- `src/shared/lib/email-service.ts` - sendStaffInvitationEmail関数追加

**フロー**:

1. 管理者: メールアドレス入力 → 「招待を送信」
2. システム: 招待トークン生成 → 招待メール送信
3. スタッフ: メール受信 → URLクリック → パスワード設定
4. 完了: 設定したパスワードでログイン可能

---

### 046-customer-creation.md (2026-01-18) ✅

顧客管理 - 新規顧客作成機能

**概要**:
管理画面の顧客管理に新規顧客作成機能を追加。
電話予約や来店予約時に顧客を事前登録できるようにする。

**完了フェーズ**:

- ✅ Phase 1: createCustomer Server Action
- ✅ Phase 2: CustomerForm コンポーネント
- ✅ Phase 3: 新規顧客ページ (/admin/customers/new)
- ✅ Phase 4: 顧客一覧に「新規顧客」ボタン追加
- ✅ Phase 5: 検証（type-check/lint/build 成功）

**新規ファイル**:

- `src/app/(admin)/admin/(dashboard)/customers/new/page.tsx` - 新規顧客ページ
- `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerForm.tsx` - 顧客作成フォーム

**変更ファイル**:

- `src/admin/actions/customer.ts` - createCustomer Server Action 追加
- `src/app/(admin)/admin/(dashboard)/customers/page.tsx` - 新規顧客ボタン追加

---

### 045-admin-reservation-creation.md (2026-01-18) ✅

管理者用予約作成機能（電話予約対応）

**概要**:
電話予約など、管理者が手動で予約を入力する必要がある場合に対応する機能。
予約一覧ページに「新規予約」ボタンを追加し、顧客検索・スペース選択・日時指定で予約を作成。

**完了フェーズ**:

- ✅ Phase 1: 基盤（バリデーション、Server Action、ボタン追加）
- ✅ Phase 2: フォームUI（予約作成ページ・フォーム）
- ✅ Phase 3: 顧客選択（CustomerSelector、searchCustomers API）
- ✅ Phase 4: 空き時間選択（TimeSlotSelector）
- ✅ Phase 5: 検証（type-check/lint/build 成功）

**新規ファイル**:

- `src/admin/lib/validations/admin-reservation.ts` - 管理者用予約バリデーションスキーマ
- `src/app/(admin)/admin/(dashboard)/reservations/new/page.tsx` - 予約作成ページ
- `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationForm.tsx` - 予約作成フォーム（2カラムレイアウト）
- `src/app/(admin)/admin/(dashboard)/reservations/_components/CustomerSelector.tsx` - 顧客検索・新規入力コンポーネント
- `src/app/(admin)/admin/(dashboard)/reservations/_components/TimeSlotSelector.tsx` - 空き時間選択コンポーネント

**変更ファイル**:

- `src/admin/actions/reservation.ts` - createAdminReservation, getSpacesForReservation 追加
- `src/admin/actions/customer.ts` - searchCustomers 追加
- `src/app/(admin)/admin/(dashboard)/reservations/page.tsx` - 新規予約ボタン追加

**機能詳細**:

- 顧客検索・選択（デバウンス付きリアルタイム検索）
- 新規顧客作成（予約と同時に顧客レコード作成）
- 料金自動計算 + 手動調整
- ステータス選択（PENDING / CONFIRMED）
- メモ入力・メール送信設定
- Google Calendar / iCal 同期

---

### 044-space-management-tab-integration.md (2026-01-18) ✅

スペース管理タブ統合 - UI/UX改善

**概要**:
スペース管理・場所管理・カテゴリー管理の3つの独立ページを、1つのスペース管理ページ内に3タブとして統合。
サイドバーの簡素化と関連機能の集約により、操作性・視認性を向上。

**完了フェーズ**:

- ✅ Phase 1: タブ統合コンポーネント作成（SpaceManagementTabs, 各TabContent）
- ✅ Phase 2: ページ統合（spaces/page.tsx をタブ統合ページに更新）
- ✅ Phase 3: サイドバー・リダイレクト（場所/カテゴリー項目削除、リダイレクト設定）
- ✅ Phase 4: 検証（type-check/lint/build成功）

**新規ファイル**:

- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceManagementTabs.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTabContent.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/LocationTabContent.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/CategoryTabContent.tsx`

**変更ファイル**:

- `src/app/(admin)/admin/(dashboard)/spaces/page.tsx` - タブ統合ページに更新
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` - 場所/カテゴリー削除
- `src/app/(admin)/admin/(dashboard)/locations/page.tsx` - リダイレクト化
- `src/app/(admin)/admin/(dashboard)/space-categories/page.tsx` - リダイレクト化

**UI/UX改善効果**:

- サイドバー項目数: 16項目 → 14項目（-2）
- 関連機能: 3つの別ページ → 1ページ3タブ
- 操作性: ページ遷移不要、タブ切り替えのみ

---

### 043-space-location-category.md (2026-01-18) ✅

スペースの場所・用途カテゴリー機能

**概要**:
スペース管理に「場所（Location）」と「用途カテゴリー（SpaceCategory）」の2つの分類軸を追加。
複数建物・店舗への対応と、用途別分類を実現。

**完了フェーズ**:

- ✅ Phase 1: DBスキーマ・マイグレーション・バリデーション・Server Actions
- ✅ Phase 2: 管理画面UI - Location（CRUD、並び替え、公開/非公開切り替え）
- ✅ Phase 3: 管理画面UI - SpaceCategory（CRUD、並び替え、アイコン・色選択）
- ✅ Phase 4: Space管理への統合（SpaceFormに場所・カテゴリー選択追加）
- ✅ Phase 5: 公開サイト対応（SpaceInfo に場所・カテゴリー表示）
- ✅ Phase 6: 検証・ドキュメント（type-check/lint/build成功、テスト通過）

**新規ファイル**:

- `src/admin/lib/validations/location.ts` - Locationバリデーションスキーマ
- `src/admin/lib/validations/space-category.ts` - SpaceCategoryバリデーションスキーマ
- `src/admin/actions/location.ts` - Location Server Actions（CRUD + 並び替え）
- `src/admin/actions/space-category.ts` - SpaceCategory Server Actions（CRUD + 並び替え）
- `src/app/(admin)/admin/(dashboard)/locations/` - Location管理ページ一式
- `src/app/(admin)/admin/(dashboard)/space-categories/` - SpaceCategory管理ページ一式

**変更ファイル**:

- `prisma/schema.prisma` - Location, SpaceCategoryモデル追加、Space拡張
- `src/admin/lib/permissions.ts` - locations, spaceCategoriesリソース追加
- `src/admin/lib/validations/space.ts` - locationId, categoryIdフィールド追加
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceForm.tsx` - 場所・カテゴリー選択UI追加
- `src/app/(admin)/admin/(dashboard)/spaces/new/page.tsx` - 場所・カテゴリーオプション取得
- `src/app/(admin)/admin/(dashboard)/spaces/[id]/edit/page.tsx` - 同上
- `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` - サイドバーにメニュー追加
- `src/app/(public)/spaces/[id]/page.tsx` - location/category include追加
- `src/app/(public)/spaces/[id]/_components/SpaceInfo.tsx` - 場所・カテゴリー表示

**マイグレーション**: `20260118_add_location_and_space_category`

---

### 042-complete-separation-architecture.md (2026-01-18) ✅

管理/公開 完全分離アーキテクチャ

**概要**:
管理ページと公開ページのコンポーネント・ライブラリを完全に分離し、
顧客ごとのカスタマイズとAIによる変更影響把握を容易にする。

**完了フェーズ**:

- ✅ Phase 1: ディレクトリ構造作成 + tsconfig パスエイリアス設定
- ✅ Phase 2: shared/ への移動（13 lib ファイル + Prisma generated）
- ✅ Phase 3: admin/ への移動（17 項目: components, actions, hooks, contexts, lib）
- ✅ Phase 4: public/ への移動（68 ファイル: components, actions, emails, lib）
- ✅ Phase 5: types/ 分離（shared/types, admin/types）
- ✅ Phase 6: 旧ディレクトリ削除 + 最終検証（type-check/lint/build 成功）
- ✅ Phase 7: ドキュメント更新
- ✅ Phase 8: admin/public 相互参照の完全解消
- ✅ Phase 9: ユーティリティ関数分離（重複コード統一）

**Phase 8 詳細**:

- shared/への追加移動: server-actions型、layout型、calendar-sync、google-calendar、nuqs、errors、styles、validations、aria-live-context
- public/actions/作成: homepage、blog、news、settings、reservation
- クロスリファレンス検証: admin→public 0件、public→admin 0件
- 検証: type-check/lint/build すべて成功

**Phase 9 詳細**:

- ユーティリティ関数分離: formatCurrency/formatPrice/formatDate → shared、formatChange/getChangeColor/formatBytes → admin専用
- 公開ページの重複formatPrice関数を削除（3ファイル）
- audit.tsからマイグレーションコメント削除（クリーン実装）
- 検証: type-check/lint/build すべて成功

**最終アーキテクチャ**:

```
src/
├── admin/          # 管理画面すべて（publicを参照しない）
│   ├── actions/
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── lib/
│   └── types/
├── public/         # 公開ページすべて（adminを参照しない）
│   ├── actions/
│   ├── components/
│   ├── emails/
│   ├── lib/
│   └── types/
├── shared/         # 共有コード（admin/public両方から参照可）
│   ├── contexts/
│   ├── generated/prisma/
│   ├── lib/
│   └── types/
└── app/            # ルート（変更なし）
```

---

### 041-admin-cleanup-refactoring.md (2026-01-17) ✅ Phase 1-5

管理画面クリーンアップ＆フルリファクタリング

**概要**:
プロジェクト全体を分析し、まとまりがない部分・不足している部分を洗い出し、
2025-2026年のベストプラクティスに準拠したクリーンな実装へリファクタリング。

**完了フェーズ**:

- ✅ Phase 1: サイドバーにユーザー管理・監査ログ追加、廃止コンポーネント削除
- ✅ Phase 2: 未使用ディレクトリ削除（.gitkeepのみのディレクトリ）
- ✅ Phase 3: 命名規則統一（blog-filters.tsx → BlogFilters.tsx等）
- ✅ Phase 4: テーブルをServer Component化（React Compiler完全互換）
  - TanStack Table依存を削除
  - 6テーブルをServer Componentに移行
  - インタラクティブ要素のみClient Component化（PublishSwitch, ActionCell等）
  - クライアントJSバンドル削減
- ✅ Phase 5: 設定セクション整理（orphaned sections統合）
  - TermsAgreementSectionをbusiness/予約タブに統合
  - GoogleCalendarSection, ICalFeedSection, TwoWaySyncSectionをapi/カレンダータブに統合
- ✅ Phase 6: 公開ページPagination/Filters分析 → **現状維持**
  - 顧客カスタマイズを考慮し、ローカルコンポーネント構成を維持
  - 共通化はテンプレート配布時のカスタマイズ性を損なうため見送り

**コミット**:

- b68b15d (Phase 1-3)
- 297ff46 (P2修正: サイドバー条件付きレイアウト)
- 84cd14b (Phase 4: Server Component Table移行)
- c3f8820 (Phase 5: orphaned sections統合)

---

### 040-system-features-tab-integration.md (2026-01-17) ✅

システム管理の関連機能をサイト設定にタブ統合

**概要**:
039で追加したシステム管理ページの「関連機能」リンクカードを廃止し、
ナビゲーション・お知らせバーはサイト設定にタブ統合、監査ログはリンクカードとして配置。

**実装内容**:

- サイト設定: 3タブ → 5タブ（一般/SEO/レイアウト/ナビゲーション/お知らせバー）+ 監査ログリンクカード
- システム管理: リンクカードセクション削除（3タブのみ）
- 旧ページのリダイレクト: `/settings/navigation` → `/settings/site?tab=navigation`、`/settings/announcement-bar` → `/settings/site?tab=announcement-bar`

**変更ファイル**:

- `src/app/(admin)/admin/(dashboard)/settings/site/page.tsx` - タブ追加、データ取得追加
- `src/app/(admin)/admin/(dashboard)/settings/system/page.tsx` - リンクカード削除
- `src/app/(admin)/admin/(dashboard)/settings/navigation/page.tsx` - リダイレクト化
- `src/app/(admin)/admin/(dashboard)/settings/announcement-bar/page.tsx` - リダイレクト化

**マイグレーション**: 不要

---

### 039-settings-category-tabs.md (2026-01-17) ✅

設定カテゴリページへのタブUI追加

**概要**:
038で作成したカテゴリカード方式の詳細ページに、タブUIを追加する。

**タブ構成**:

- site: 一般 / SEO / レイアウト（3タブ）
- business: 事業者情報 / 営業時間 / 予約（3タブ）
- notify: メール / 通知 / 決済（3タブ）
- api: Resend / Turnstile / Google Maps / カスタム（4タブ）
- system: メンテナンス / Cookie / 権限（3タブ + リンクカード）

**実装内容**:

- 汎用タブコンポーネント `SettingsTabs.tsx`（nuqs + Radix UI Tabs）
- 全5カテゴリページにタブUI適用
- URL状態同期（`?tab=xxx`）

**新規ファイル**:

- `settings/_components/SettingsTabs.tsx`

**変更ファイル**:

- `settings/site/page.tsx`
- `settings/business/page.tsx`
- `settings/notify/page.tsx`
- `settings/api/page.tsx`
- `settings/system/page.tsx`

**マイグレーション**: 不要

---

### 038-settings-page-restructure.md (2026-01-17) ✅

設定ページのカテゴリカード方式へのリストラクチャ

**概要**:
現在のタブベース設定ページ（10タブ + 3ボタン）を、カテゴリカード方式（iOS設定/WordPress風）に再構築。

**カテゴリ構成**:

- サイト設定: 一般、SEO、レイアウト
- ビジネス設定: 事業者情報、営業時間、予約
- 通知・決済: メール、決済（Stripe）
- 外部連携: APIキー（Resend、Turnstile、Google等）
- システム管理: メンテナンス、Cookie同意、権限マトリクス（リンク: ナビ/お知らせバー/監査ログ）

**実装内容**:

- カード一覧トップページ（5カテゴリ）
- 各カテゴリの独立ページ（site/business/notify/api/system）
- SettingsCard/SettingsLayoutコンポーネント
- 旧タブベースUI削除

**新規ファイル**:

- `settings/page.tsx` - カード一覧トップ
- `settings/site/page.tsx` - サイト設定
- `settings/business/page.tsx` - ビジネス設定
- `settings/notify/page.tsx` - 通知・決済
- `settings/api/page.tsx` - 外部連携
- `settings/system/page.tsx` - システム管理
- `_components/SettingsCard.tsx`
- `_components/SettingsLayout.tsx`

**マイグレーション**: 不要

---

### 037-blog-sidebar.md (2026-01-17) ✅

ブログサイドバー機能

**概要**:
ブログページにサイドバーを追加し、検索・新着記事・人気記事・カテゴリー・タグのウィジェットを表示する。サイト設定でグローバル制御、ページ単位で個別制御が可能。

**実装内容**:

- DBスキーマ: Settings/Pageモデルにサイドバー設定フィールド追加
- Server Actions: `getSidebarSettings()`, `updateSidebarSettings()`, `getSidebarData()`
- サイドバーコンポーネント: 5ウィジェット（検索、新着、人気、カテゴリー、タグ）
- ブログページ統合: 一覧・詳細ページに2カラムレイアウト
- 管理画面UI: レイアウトタブにサイドバー設定セクション追加
- ページ単位設定: カスタムページでのサイドバー表示ON/OFF設定
- レスポンシブ: lg以上で2カラム、md以下で1カラム（サイドバー下部）

**新規ファイル**:

- `src/lib/validations/sidebar.ts`
- `src/actions/public/sidebar.ts`
- `src/components/site/sidebar/` - 6コンポーネント
- `src/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection.tsx`
- `src/app/(public)/p/[slug]/page.tsx` - カスタムページ公開表示（サイドバー対応）

**変更ファイル**:

- `prisma/schema.prisma` - Settings/Pageモデル拡張
- `src/actions/admin/settings.ts` - サイドバー設定追加
- `src/actions/admin/page.ts` - showSidebar保存処理追加
- `src/lib/validations/page.ts` - showSidebarスキーマ追加
- `src/app/(public)/blog/page.tsx` - サイドバー統合
- `src/app/(public)/blog/[slug]/page.tsx` - サイドバー統合
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/LayoutTab.tsx`
- `src/components/admin/editor/inline/types.ts` - PageEditorFormData拡張
- `src/components/admin/editor/inline/side-panel/LayoutFields.tsx` - サイドバー設定UI追加
- `src/app/(admin)/admin/(dashboard)/pages/_components/PageInlineEditor.tsx` - showSidebar対応

**マイグレーション**: `20260117000900_add_sidebar_settings`

---

### 036-test-coverage-full.md (2026-01-17) ✅

テストカバレッジ向上（フルカバレッジ + E2E）

**概要**:
既存のBun Testフレームワーク基盤を活用し、プロジェクト全体のテストカバレッジを大幅に向上。

**フェーズ構成（全完了）**:

- Phase 1: Unit Tests - Zodバリデーション（8ファイル完了）
- Phase 2: Unit Tests - 権限・認証ロジック
- Phase 3: Integration Tests - Server Actions（12ファイル完了）
- Phase 4: E2E Tests - Playwright導入（195テスト）
- Phase 5: CI/CD統合（GitHub Actions）

**成果**:

- Unit/Integration テスト: 約50ファイル追加
- E2Eテスト: 195テスト（auth:31, reservation:11, spaces:25, blog:43, reservations:40, users:45）
- CI/CD: GitHub Actions ワークフロー完備

---

### 035-performance-optimization.md (2026-01-16)

パフォーマンス最適化 Priority 1 実装完了

**概要**:
プロジェクト全体の分析に基づき、パフォーマンス改善を実施。

**実装内容（Priority 1）**:

- DBインデックス: 既に存在（変更不要）
- コネクションプール: 本番環境 max: 20 に調整
- ダッシュボード集計: $queryRaw でDB側集計に最適化
- 画像priority: blog/spaces の最初の2画像に追加

**変更ファイル**:

- `src/lib/prisma.ts` - コネクションプール調整
- `src/actions/admin/dashboard.ts` - 集計最適化
- `src/app/(public)/blog/page.tsx` - 画像priority追加
- `src/app/(public)/spaces/page.tsx` - 画像priority追加

**マイグレーション**: 不要

---

### 034-react-compiler-memoization-cleanup.md (2026-01-16)

React Compiler対応 - useMemo/useCallback削除

**概要**:
React Compiler（Next.js 16で有効）環境に対応し、不要な手動メモ化（useMemo/useCallback）を削除。React公式ベストプラクティスに準拠したクリーンな実装に移行。

**実装内容**:

- useMemo: 4ファイル → 2ファイル（2削除）
- useCallback: 50ファイル → 12ファイル（38削除）
- 保持基準: useEffect依存配列で使用、外部ライブラリAPI統合（Lexical registerCommand）、参照安定化必須

**削除対象**:

- 単純なイベントハンドラ（onClick, onChange等）
- Context Provider関数
- カスタムフック戻り値
- ダイアログ開閉関数
- コンポーネント返却のuseCallback（アンチパターン）

**保持ファイル**:

- `use-calendar-state.ts` - useMemo（new Date()参照安定化）
- `LexicalEditor.tsx` - useMemo（Lexical initialConfig）
- `ToolbarPlugin.tsx` - useCallback（$updateToolbar、useEffect依存）
- `MediaLibraryPlugin.tsx` - useCallback（fetchMedia、useEffect依存）
- `InlineTitleEditor.tsx` - useCallback（adjustHeight、useEffect依存）
- 9 Lexicalノードコンポーネント - useCallback（onDelete、editor.registerCommand依存）

**マイグレーション**: 不要

---

### 033-media-picker-integration.md (2026-01-16)

メディアピッカー統合（画像設定UI改善）

**概要**:
画像設定UIをURL直接入力からメディアライブラリダイアログへ移行。クリーンアーキテクチャで汎用メディアピッカーを新規構築。

**実装内容**:

- 3タブ構成: ライブラリ選択 + URL入力 + アップロード
- 単一/複数選択モード対応
- React Hook Form統合（useSingleMediaPicker, useMultipleMediaPicker）
- Lexical非依存の汎用コンポーネント
- 5箇所のフォームに統合（SpaceForm, ImageFields, PageSeoForm, SectionEditor, CardPlugin）

**新規ファイル**:

- `src/types/media-picker.ts` - 型定義
- `src/hooks/use-media-picker.tsx` - 公開APIフック
- `src/hooks/use-media-selection.ts` - 選択状態管理
- `src/hooks/use-media-library.ts` - ライブラリ取得
- `src/hooks/use-media-upload.ts` - アップロード処理
- `src/components/admin/media-picker/` - ダイアログ・タブ・UIコンポーネント

**変更ファイル**:

- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceForm.tsx`
- `src/components/admin/editor/inline/side-panel/ImageFields.tsx`
- `src/components/admin/editor/inline/BlogSidePanel.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/seo/_components/PageSeoForm.tsx`
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/SectionEditor.tsx`
- `src/components/admin/editor/lexical/plugins/CardPlugin.tsx`

**マイグレーション**: 不要

---

### 031-terms-agreement-management.md (2026-01-16)

利用規約同意機能の実装

**概要**:
予約システムに利用規約同意機能を実装。スペースごとに異なる利用規約を設定でき、予約時に顧客が規約に同意することで法的コンプライアンスを担保。

**実装内容**:

- Terms/TermsVersion/TermsAgreementモデル（バージョン管理・同意記録）
- 管理画面CRUD UI（規約一覧・作成・編集・バージョン管理）
- 公開UI（TermsAgreementDialog - スクロール検出付きモーダル）
- Server Actions（管理用・公開用）
- RBAC権限設定（termsリソース追加）
- SpaceForm統合（規約選択ドロップダウン）

**変更ファイル**:

- `prisma/schema.prisma` - Terms, TermsVersion, TermsAgreementモデル追加
- `src/lib/validations/terms.ts` - 新規: Zodスキーマ
- `src/actions/admin/terms.ts` - 新規: 管理用Server Actions
- `src/actions/public/terms.ts` - 新規: 公開用Server Actions
- `src/lib/permissions.ts` - termsリソース権限追加
- `src/lib/validations/space.ts` - termsId追加
- `src/actions/admin/space.ts` - termsId保存対応
- `src/components/site/TermsAgreementDialog.tsx` - 新規: 公開UI
- `src/app/(admin)/admin/(dashboard)/terms/**` - 新規: 管理画面
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceForm.tsx` - 規約選択追加

**マイグレーション**: `20260116010114_add_terms_management`

---

### 032-enum-type-guards.md (2026-01-16)

Prisma Enum型アサーション全削除 + 型ガード集約

**問題**:

- コードベース全体で`as ReservationStatus`等の型アサーションが散在
- 実行時検証なしの危険な型変換
- Prisma生成enum型とZod推論型の混在

**解決策**:

- 中央集権型ガードモジュール（`src/lib/validations/enums.ts`）作成
- Prismaのenum型をre-export、型ガード関数を提供
- URLパラメータ用フィルターパーサー追加
- CalendarView型ガード追加
- PrismaのJson型フィールドに実行時バリデーション追加

**変更ファイル**:

- `src/lib/validations/enums.ts` - 新規: 中央集権型ガードモジュール
- `src/lib/calendar/calendar-types.ts` - isValidCalendarView, getValidCalendarView追加
- `src/lib/validations/media.ts` - parseMediaTypeFilter, parseMediaUsageFilter追加
- `src/actions/admin/customer.ts` - CustomerWithReservations型修正
- `src/actions/admin/homepage-settings.ts` - parseSectionConfig追加
- `src/components/site/sections/SectionRenderer.tsx` - getSafeConfig使用
- 各種ページ・コンポーネント - 型ガード使用に移行

**マイグレーション**: 不要

---

### 031-media-type-assertion-removal.md (2026-01-16)

MediaType/MediaUsage型アサーション排除

**問題**:

- `as MediaType`/`as MediaUsage`型アサーションが4箇所で使用されていた
- Zod推論型とPrisma生成型が別の型として認識されていた

**解決策**:

- ZodスキーマでPrisma生成のenumを直接使用（re-export）
- 型ガード関数（`isValidMediaType`, `isValidMediaUsage`）を追加
- constants.tsを型安全に修正（MediaType/MediaUsageを直接使用）
- UIコンポーネントで型ガードを使用

**変更ファイル**:

- `src/lib/validations/media.ts` - Prisma型をre-export、型ガード追加
- `src/actions/admin/media.ts` - 型アサーション削除
- `src/app/(admin)/admin/(dashboard)/media/_components/constants.ts` - 型安全な定数
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx` - 型ガード使用
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaUploadDialog.tsx` - 型ガード使用
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx` - 型ガード使用
- `src/app/(admin)/admin/(dashboard)/media/_components/MediaTable.tsx` - 型ガード使用

**マイグレーション**: 不要

---

### 030-media-management.md (2026-01-16)

メディア管理機能

**実装内容**:

- Mediaモデル: ファイルメタデータ永続化（filename, url, size, dimensions等）
- MediaType/MediaUsage enum: ファイル種別・用途分類
- Supabase Storage連携: `media`バケットへのファイルアップロード
- Server Actions: CRUD、論理削除、一括削除
- 管理画面UI: グリッド/リストビュー、フィルター、検索、D&Dアップロード
- Lexicalエディター連携: MediaLibraryPlugin（画像選択・挿入）

**新規ファイル**:

- `src/lib/validations/media.ts` - Zodスキーマ
- `src/actions/admin/media.ts` - Server Actions
- `src/app/(admin)/admin/(dashboard)/media/` - 管理画面ページ・コンポーネント
- `src/components/admin/editor/lexical/plugins/MediaLibraryPlugin.tsx` - エディタープラグイン

**変更ファイル**:

- `prisma/schema.prisma` - Mediaモデル、enum追加
- `src/lib/supabase.ts` - MEDIAバケット追加
- `src/lib/permissions.ts` - mediaリソース権限追加
- `src/lib/utils.ts` - formatBytes, formatDate関数追加
- `src/components/admin/editor/lexical/` - MediaLibraryPlugin統合

**マイグレーション**: `bunx prisma migrate dev --name add_media_model`

---

### 029-type-errors-fix.md (2026-01-16)

型エラー・ビルドエラー修正

**問題**:

- `isSystemPage` 型エラー: Prisma マイグレーション未適用
- Server Actions 同期関数エラー: `canDeletePage` が sync 関数
- Next.js 16 PPR エラー: `generateMetadata` 内の Prisma クエリ

**解決策**:

- `bunx prisma migrate dev --name add_is_system_page_to_pages` 実行
- `canDeletePage` を `src/lib/validations/page.ts` へ移動
- `getPageSeo` に `'use cache'` ディレクティブ追加

**変更ファイル**:

- `prisma/migrations/20260115154941_add_is_system_page_to_pages/`
- `src/actions/admin/page.ts`
- `src/lib/validations/page.ts`
- `src/lib/page-metadata.ts`

**マイグレーション**: あり（isSystemPage カラム追加）

---

### 028-prisma-decimal-serialization-fix.md (2026-01-16)

Prisma Decimal シリアライゼーション修正

**問題**: `SpaceListSection.tsx` で「Only plain objects can be passed to Client Components」エラー

**原因**: Prisma Decimal 型（`area`, `hourlyPrice`, `dailyPrice`）は JSON シリアライズ不可

**実装内容**:

- `SerializedSpace` 型定義: Decimal → number 変換後の型
- `getSpaces()` 関数: `.toNumber()` で Decimal → number 変換
- 既存パターン（`src/actions/admin/space.ts`）と整合性のある実装

**変更ファイル**:

- `src/components/site/sections/SpaceListSection.tsx`

**マイグレーション**: 不要

---

### 027-nuqs-best-practices.md (2026-01-16)

nuqs ベストプラクティス準拠

**実装内容**:

- history: 'push' - Paginationにブラウザ履歴サポート追加（UX改善）
- throttleMs: 500 - 検索入力にスロットリング追加（パフォーマンス改善）
- 管理画面パーサー集約: `src/lib/nuqs/search-params.ts`に`adminUserSearchParams`/`adminAuditLogSearchParams`追加
- createLoaderパターン統一: 管理画面で`createSearchParamsCache.parse()`を`createLoader`に置き換え

**変更ファイル**:

- `src/lib/nuqs/search-params.ts` - 管理画面用SearchParams追加
- `src/lib/nuqs/index.ts` - エクスポート追加
- `src/app/(public)/blog/_components/blog-pagination.tsx` - history: 'push'追加
- `src/app/(public)/blog/_components/blog-filters.tsx` - throttleMs追加
- `src/app/(public)/spaces/_components/Pagination.tsx` - history: 'push'追加
- `src/app/(public)/spaces/_components/SpaceFilters.tsx` - throttleMs追加
- `src/app/(public)/news/_components/NewsPagination.tsx` - history: 'push'追加
- `src/app/(admin)/admin/(dashboard)/users/page.tsx` - loadAdminUserSearchParams使用
- `src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx` - loadAdminAuditLogSearchParams使用
- `src/components/admin/ui/Pagination.tsx` - nuqs移行（router.push → useQueryState）
- `src/components/admin/ui/index.ts` - インポートパス修正

**マイグレーション**: 不要

---

### 026-remove-as-const-assertions.md (2026-01-16)

as const型アサーション削除 + 型アサーション改善（Phase 1-3）

**Phase 1: as const削除**

- プロジェクト全体から`as const`型アサーションを削除
- オブジェクト定数: interfaceまたはRecord型による明示的な型注釈に移行
- 配列定数: union型定義 + readonly配列に移行
- Enum風定数: union型 + Recordパターンに移行
- インラインCSS: React.CSSPropertiesによる型注釈に移行
- Prismaクエリ: satisfies演算子による型安全性確保

**Phase 2: 型アサーション（as Type）改善**

- セッションユーザー型: `getSessionUser`型ガード関数で`as User`/`as Role`を削除
- User型再定義: Better Auth の string 型 role を Role enum に変換
- 実行時検証追加: `isValidRole`でrole値を検証
- HOF改善: withAuth/withPermission/withReadPermission/withRole から型アサーション削除
- createSuccess改善: 関数オーバーロードで戻り値型を明確化

**Phase 3: さらなる型アサーション削減**

- Server Actions: 13ファイルで`as Role`を`getRoleFromSession`ヘルパーに置き換え
- URLSearchParams: 4ファイルでバリデーション関数（validateStatus等）に置き換え
- JSON config: 7つの型ガード関数追加（isHeroConfig, isSpaceListConfig等）
- FormData: `getFormString`, `getFormStringOrNull`等のヘルパー追加
- localStorage: 限定値の型ガード追加（isValidConsentStatus）

**変更ファイル**: 50+ファイル

- `src/lib/auth.ts` - User型再定義、getSessionUser型ガード、isValidRole、getRoleFromSession追加
- `src/lib/permissions.ts` - `as Role`削除
- `src/lib/utils.ts` - FormDataヘルパー追加
- `src/lib/validations/homepage-section.ts` - 型ガード関数追加
- `src/types/server-actions.ts` - HOF改善、createSuccess改善
- `src/actions/admin/*.ts` - 13ファイルをgetRoleFromSessionに移行
- `src/app/(admin)/.../users/page.tsx` 他4ファイル - URLSearchParamsバリデーション追加
- `src/app/(admin)/.../settings/_components/tabs/SectionEditor.tsx` - 型ガード使用
- `src/components/site/CookieConsentBanner.tsx` - localStorage型ガード追加

**マイグレーション**: 不要

---

### 025-homepage-settings-to-pages.md (2026-01-15)

ホームページ設定のページ管理への移動

**実装内容**:

- ホームページセクション管理を「設定 > ホームページタブ」から「ページ管理」に移動
- ページ一覧に仮想「ホームページ」行を追加（先頭表示）
- 設定タブを10→9タブに削減
- 既存コンポーネント（HomepageTab, SectionEditor）を100%再利用

**新規ファイル**:

- `src/app/(admin)/admin/(dashboard)/pages/homepage/edit/page.tsx` - 編集画面

**変更ファイル**:

- `src/lib/validations/page.ts` - SYSTEM_PAGE_SLUGSに'homepage'追加
- `src/app/(admin)/admin/(dashboard)/pages/page.tsx` - 仮想行追加
- `src/app/(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx` - タブ削除
- `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/index.ts` - export削除
- `src/actions/admin/homepage-settings.ts` - revalidatePath更新
- `src/actions/admin/page.ts` - SYSTEM_PAGE_SLUGS使用に統一

**マイグレーション**: 不要

---

### 024-bun-test-framework.md (2026-01-14)

Bun 1.3.6テストフレームワーク導入

**実装内容**:

- Bun ネイティブテストランナー(`bun:test`)による包括的テスト環境
- Prisma Client モック（外部ライブラリ不使用）
- Better Auth セッションモック
- Next.js API モック（headers, redirect, revalidatePath）
- カスタムアサーション（ActionResult型対応）
- 121テスト、379 expect() calls、150ms実行

**新規ファイル**:

- `__tests__/setup.ts` - グローバルセットアップ
- `__tests__/mocks/` - prisma.ts, auth.ts, next.ts, index.ts
- `__tests__/fixtures/` - users.ts, reservations.ts, index.ts
- `__tests__/helpers/` - session-mock.ts, assertions.ts, index.ts
- `__tests__/unit/lib/permissions.test.ts` - 権限管理テスト
- `__tests__/unit/lib/validations/reservation.test.ts` - 予約バリデーションテスト
- `__tests__/unit/lib/reservation-utils.test.ts` - 予約重複チェックテスト
- `__tests__/unit/types/server-actions.test.ts` - Server Actions HOFテスト

**変更ファイル**:

- `bunfig.toml` - テスト設定追加
- `package.json` - テストスクリプト追加

**マイグレーション**: 不要

---

### 023-grapesjs-removal-homepage-settings.md (2026-01-14)

GrapesJS完全廃止 + ホームページセクション設定機能

**実装内容**:

- GrapesJSビジュアルエディターの完全削除（パッケージ、スキーマ、コード、ドキュメント）
- Blog/News/PageエディターをLexicalに統一
- ホームページセクション設定: CTA、Blog、News、FAQの4セクション
- FAQセクション: 専用モデル（HomepageFaq/HomepageFaqItem）、ドラッグ＆ドロップ並び替え
- 管理画面: 設定ページに「ホームページ」タブ追加
- 公開ページ: 設定ベースのセクション表示

**新規ファイル**:

- `src/actions/admin/homepage-settings.ts` - Server Actions
- `src/app/.../settings/_components/tabs/HomepageTab.tsx` - 管理画面タブ
- `src/components/site/sections/BlogSection.tsx` - ブログセクション
- `src/components/site/sections/NewsSection.tsx` - お知らせセクション
- `src/components/site/sections/FAQSection.tsx` - FAQセクション

**削除ファイル**:

- `src/components/admin/editor/grapesjs/` - GrapesJSエディター全体
- `src/actions/admin/grapes-page.ts`, `src/lib/grapesjs-renderer.ts`
- `src/app/(admin)/.../grapes-pages/`, `src/app/(public)/g/`
- GrapesJS関連docs（016, 017, 018, 020）

**マイグレーション**: `bunx prisma db push` または `bunx prisma migrate dev --name remove_grapesjs_add_homepage_settings`

---

### 022-type-safety-hof-migration.md (2026-01-13)

型安全性向上 + HOFパターン統一

**実装内容**:

- AuditUser型導入: `as never` アサーション30箇所以上を排除
- withPermission HOF移行: 13ファイルの手動認証パターンを統一
- checkReadPermissionヘルパー: 読み取り専用アクション用軽量パターン
- React 19対応: forwardRef廃止、FC型廃止

**変更ファイル**:

- `src/lib/audit.ts` - AuditUser型、isSuccessResult型ガード
- `src/types/server-actions.ts` - AuditUser再エクスポート
- `src/actions/admin/*.ts` - 12ファイルをwithPermission HOFに移行
- `src/components/site/ui/Checkbox.tsx` - forwardRef → ref as props
- `src/contexts/aria-live-context.tsx` - FC → 関数宣言

**マイグレーション**: 不要

---

### 021-seo-accessibility-optimization.md (2026-01-13)

SEO/アクセシビリティ最適化（メタデータ・JSON-LD・WCAG 2.1 AA準拠）

**実装内容**:

- SEOメタデータファクトリ: Settings DBから動的生成、canonical URL対応
- JSON-LD構造化データ: WebSite/Article/NewsArticle、XSSサニタイズ強化
- アクセシビリティ基盤: SkipLink、ARIAライブリージョン、prefers-reduced-motion
- CSS改善: WCAG AA準拠コントラスト比（4.5:1以上）

**新規ファイル**:

- `src/lib/seo/` - metadata-factory.ts, json-ld-config.ts, index.ts
- `src/lib/a11y/` - skip-link.ts, motion-utils.ts, aria-live.ts, index.ts
- `src/contexts/` - aria-live-context.tsx, index.ts
- `src/components/a11y/` - SkipLink.tsx, AriaLiveRegion.tsx, index.ts

**変更ファイル**:

- `src/components/seo/JsonLd.tsx` - NewsArticleJsonLd追加、XSSサニタイズ強化
- `src/app/(public)/page.tsx` - generateMetadata + WebSiteJsonLd追加
- `src/app/(public)/blog/[slug]/page.tsx` - ArticleJsonLd追加
- `src/app/(public)/news/[id]/page.tsx` - NewsArticleJsonLd追加
- `src/app/globals.css` - コントラスト比改善 + prefers-reduced-motion
- `src/app/(public)/layout.tsx` - SkipLink, AriaLiveProvider, AriaLiveRegion追加

**マイグレーション**: 不要

---

### 021-permission-management-system.md (2026-01-13)

権限管理システム（RBAC + 監査ログ + レートリミット）

**実装内容**:

- 5階層ロールシステム: SUPER_ADMIN, ADMIN, EDITOR, VIEWER, USER
- 権限ライブラリ: コードベースRBAC（ROLE_PERMISSIONS定義）
- 監査ログ: 書き込み操作 + セキュリティイベント自動記録
- レートリミット: ログイン試行制限（5回/15分）
- 管理UI: 権限マトリクス、監査ログ一覧、ロール管理強化

**新規ファイル**:

- `src/lib/permissions.ts` - 権限定義・チェック関数
- `src/lib/audit.ts` - 監査ログライブラリ
- `src/lib/rate-limit.ts` - レートリミットライブラリ
- `src/actions/admin/audit-log.ts` - 監査ログServer Actions
- `src/app/(admin)/admin/(dashboard)/audit-logs/` - 監査ログページ
- `src/app/(admin)/admin/(dashboard)/settings/permissions/` - 権限マトリクスページ

**変更ファイル**:

- `prisma/schema.prisma` - Role enum拡張、Permission/RolePermission/AuditLog/LoginAttemptモデル追加
- `src/types/server-actions.ts` - withPermission/withRole HOF追加
- `src/actions/admin/user.ts` - 権限ベース認可に移行
- `src/app/(admin)/admin/(dashboard)/users/` - 新ロールシステム対応UI

**マイグレーション**: `bunx prisma db push` 済み

---

### 020-blog-news-grapesjs-migration.md (2026-01-13)

Blog/News GrapesJS移行 + ステータスEnum化 + バージョン管理

**実装内容**:

- DBスキーマ: `BlogPostStatus`/`NewsStatus` enum、`projectData` JSON、Versionモデル追加
- Server Actions: GrapesJS対応、publish/unpublish分離、バージョン自動作成
- エディター: `BlogInlineEditor`/`NewsInlineEditor`をGrapesJS統合
- 公開ページ: 全クエリを`status: PUBLISHED`に変更

**変更ファイル**:

- `prisma/schema.prisma` - enum、Versionモデル
- `src/actions/admin/blog.ts`, `news.ts` - Server Actions
- `src/app/(admin)/admin/(dashboard)/blog/_components/BlogInlineEditor.tsx` - GrapesJS
- `src/app/(admin)/admin/(dashboard)/news/_components/NewsInlineEditor.tsx` - GrapesJS
- `src/components/admin/editor/inline/EditorHeader.tsx` - publishActions
- 公開ページ/クエリ: status enum使用

**マイグレーション**: `bunx prisma migrate dev --name blog_news_grapesjs_migration`

---

### 019-admin-ui-ux-integration.md (2026-01-13)

Admin UI/UX統合（レスポンシブ対応・ダッシュボード改善）

**実装内容**:

- レスポンシブ対応: サイドバー折りたたみ、モバイルオーバーレイ、TopBar追加
- AdminLayoutContext: サイドバー状態管理（expanded/collapsed/hidden）
- GenericSidePanel: 汎用サイドパネル設計（タブ対応、型安全ジェネリクス）
- ダッシュボードグラフ: Recharts導入、直近30日予約数・売上推移

**新規ファイル**:

- `src/types/admin-layout.ts` - レスポンシブレイアウト型
- `src/contexts/admin-layout-context.tsx` - サイドバー状態Context
- `src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx` - レスポンシブサイドバー
- `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx` - モバイルヘッダー
- `src/types/editor-panel.ts` - 汎用パネル型
- `src/components/admin/editor/shared/GenericSidePanel.tsx` - 統合サイドパネル
- `src/app/(admin)/admin/(dashboard)/_components/charts/ReservationChart.tsx` - 予約・売上グラフ

**変更ファイル**:

- `src/app/(admin)/admin/(dashboard)/layout.tsx` - レスポンシブレイアウト
- `src/actions/admin/dashboard.ts` - getReservationChartData()追加
- `src/app/(admin)/admin/(dashboard)/page.tsx` - グラフセクション追加

**マイグレーション**: 不要

---

### 018-grapesjs-database-integration.md (2026-01-13)

GrapesJSデータベース連携機能

**実装内容**:

- GrapesPageモデル: ページデータ（title, slug, content, projectData）永続化
- GrapesPageVersionモデル: バージョン履歴（公開時に自動作成）
- ステータス管理: DRAFT/PUBLISHED/ARCHIVED、論理削除（isActive）
- SEO対応: metaDescription, metaKeywords, OGP設定
- Server Actions: CRUD、公開/非公開、バージョン復元、バックアップ/インポート/エクスポート
- 管理画面UI: 一覧、作成ダイアログ、GrapesJSエディター統合、バージョン履歴
- 公開ページ: `/g/[slug]` ルートでGrapesPageコンテンツ表示

**新規ファイル**:

- `src/lib/validations/grapes-page.ts` - Zodスキーマ、型定義
- `src/actions/admin/grapes-page.ts` - Server Actions（全CRUD、バージョン、バックアップ）
- `src/app/(admin)/admin/(dashboard)/grapes-pages/page.tsx` - 一覧ページ
- `src/app/(admin)/admin/(dashboard)/grapes-pages/[id]/edit/page.tsx` - 編集ページ
- `src/app/(admin)/admin/(dashboard)/grapes-pages/_components/` - コンポーネント一式
  - `CreateGrapesPageDialog.tsx` - 新規作成ダイアログ
  - `GrapesPageActions.tsx` - 操作メニュー
  - `GrapesPageEditor.tsx` - エディターUI
  - `GrapesPageSidePanel.tsx` - SEO/OGP設定パネル
  - `GrapesPageVersionHistory.tsx` - バージョン履歴
  - `index.ts` - エクスポート
- `src/app/(public)/g/[slug]/page.tsx` - 公開表示ページ

**変更ファイル**:

- `prisma/schema.prisma` - GrapesPageStatus enum, GrapesPage, GrapesPageVersion モデル追加

**マイグレーション**: `bunx prisma migrate dev --name add_grapes_page` が必要

---

### 017-grapesjs-custom-blocks.md (2026-01-13)

GrapesJSカスタムブロック拡張（レンタルスペース専用）

**実装内容**:

- HeroSection: フルワイドヒーロー（背景画像/グラデーション、CTAボタン）
- ReservationForm: 予約フォームプレースホルダー（公開時に実コンポーネント置換）
- FeatureGrid: 機能紹介グリッド（2-4カラム、アイコン+タイトル+説明）
- TestimonialSlider: お客様の声スライダー（静的/動的データソース選択）
- ContactSection: お問い合わせセクション（2カラム、連絡先+フォーム）
- 新規ブロックカテゴリ「レンタルスペース」追加
- CSS変数対応（テーマカスタマイズ）
- GrapesJSレンダラー（プレースホルダー置換ユーティリティ）

**新規ファイル**:

- `src/components/admin/editor/grapesjs/blocks/hero-section.ts`
- `src/components/admin/editor/grapesjs/blocks/reservation-form.ts`
- `src/components/admin/editor/grapesjs/blocks/feature-grid.ts`
- `src/components/admin/editor/grapesjs/blocks/testimonial-slider.ts`
- `src/components/admin/editor/grapesjs/blocks/contact-section.ts`
- `src/lib/grapesjs-renderer.ts`

**変更ファイル**:

- `src/components/admin/editor/grapesjs/config/editor-config.ts` - rentalカテゴリ追加
- `src/components/admin/editor/grapesjs/blocks/index.ts` - 新ブロック登録
- `public/admin/grapesjs-canvas.css` - ブロックスタイル追加

**マイグレーション**: 不要

---

### 016-grapesjs-visual-editor.md (2026-01-13)

GrapesJSビジュアルエディター環境構築

**実装内容**:

- GrapesJS本体と公式React統合のインストール（@grapesjs/react v2.0.0）
- TypeScript型定義の作成
- Next.js 16クライアントサイド対応（SSR回避）
- カスタムブロック登録（Callout, FAQ, PostListWidget, Button, Divider）
- プラグイン動的インポート（コード分割）
- エディターテーマとキャンバススタイル

**新規ファイル**:

- `src/components/admin/editor/grapesjs/` - エディターコンポーネント一式
- `public/admin/grapesjs-canvas.css` - キャンバス内スタイル

**変更ファイル**:

- `package.json` - GrapesJS関連パッケージ追加

**マイグレーション**: 不要

---

### 015-code-quality-refactoring.md (2026-01-12)

コード品質リファクタリング

**実装内容**:

- Server Actionヘルパー統一（Turnstile検証、Zodエラー抽出）
- React 19フック作成（useFormSubmission、useFormPending）
- Admin UI CVA→TV統一（button、badge、label、dropdown-menu）
- Server Actionsリファクタリング（contact、reservation、blog-comment）
- class-variance-authorityパッケージ削除

**新規ファイル**:

- `src/lib/action-helpers.ts` - Server Actionヘルパー関数
- `src/hooks/use-form-submission.ts` - React 19フォームフック

**変更ファイル**:

- `src/components/admin/ui/button.tsx` - CVA→TV
- `src/components/admin/ui/badge.tsx` - CVA→TV
- `src/components/admin/ui/label.tsx` - 簡略化
- `src/components/admin/ui/dropdown-menu.tsx` - CVA→TV
- `src/actions/contact.ts` - ヘルパー使用
- `src/actions/reservation.ts` - ヘルパー使用
- `src/actions/blog-comment.ts` - ヘルパー使用

**マイグレーション**: 不要

---

### 014-reservation-calendar.md (2026-01-11)

予約管理カレンダービュー機能

**実装内容**:

- 月/週/日の3ビュー切り替え
- ステータス変更（カレンダー上でクリック→ダイアログ）
- スペース表示モード（統一表示・フィルター・分割）
- ステータスフィルター
- URL状態管理（view/date/space/status）
- Clean Architecture: Domain Layer分離

**新規ファイル**:

- `src/lib/calendar/calendar-types.ts` - 型定義
- `src/lib/calendar/calendar-domain.ts` - ドメインロジック
- `src/app/(admin)/admin/reservations/_components/calendar/` - カレンダーコンポーネント一式
- `src/app/(admin)/admin/reservations/calendar/page.tsx` - カレンダーページ

**変更ファイル**:

- `src/actions/admin/reservation.ts` - `getReservationsForCalendar()`, `getSpacesForCalendar()` 追加
- `src/app/(admin)/admin/reservations/page.tsx` - カレンダー表示リンク追加

**マイグレーション**: 不要（スキーマ変更なし）

---

### 013-google-calendar-integration.md (2026-01-11)

Google Calendar連携機能（Phase 1-4 全完了）

**Phase 1: 基本連携**:

- サービスアカウント連携: 共有カレンダーへの予約自動登録
- OAuth連携（オプション）: 管理者個人カレンダーへの登録
- iCal生成: RFC 5545準拠の.icsファイル
- Add to Calendarリンク: Google/Outlook/Apple対応
- 予約作成時の自動同期、キャンセル時のイベント削除

**Phase 2: ステータス変更同期**:

- CONFIRMED時にカレンダーイベント更新（または新規作成）
- CANCELLED時にカレンダーイベント削除

**Phase 3: iCalフィード**:

- トークンベースiCalフィード配信API
- 外部カレンダー（TimeTree等）からの購読

**Phase 4: 双方向同期**:

- ポーリング方式: 1〜60分間隔で変更チェック
- Webhook方式: Google Calendar Push Notifications
- 両方使用可能（推奨）
- 手動同期ボタン
- イベント削除→予約キャンセル、時間変更→予約更新

**新規ファイル**:

- `src/lib/google-calendar.ts` - Google Calendar APIクライアント
- `src/lib/calendar-sync.ts` - 予約同期サービス
- `src/lib/ical.ts` - iCal生成・Add to Calendarリンク
- `src/app/(admin)/admin/settings/_components/sections/GoogleCalendarSection.tsx` - 設定UI
- `src/app/(admin)/admin/settings/_components/sections/ICalFeedSection.tsx` - iCalフィードUI
- `src/app/(admin)/admin/settings/_components/sections/TwoWaySyncSection.tsx` - 双方向同期UI
- `src/app/api/cron/calendar-sync/route.ts` - ポーリングCron API
- `src/app/api/webhooks/google-calendar/route.ts` - Webhook受信API
- `src/app/api/ical/[token]/route.ts` - iCalフィード配信API
- `vercel.json` - Vercel Cron設定

**変更ファイル**:

- `prisma/schema.prisma` - Reservation/Settingsにカレンダー関連フィールド追加
- `src/lib/auth.ts` - Googleプロバイダー追加
- `src/actions/admin/settings.ts` - Google Calendar設定Server Actions
- `src/actions/reservation.ts` - カレンダー同期呼び出し追加
- `src/lib/email-service.ts` - iCal添付・カレンダーリンク追加
- `src/emails/reservation-confirmation.tsx` - カレンダーリンクセクション追加

**環境変数**:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth用
- `CRON_SECRET` - ポーリングAPI認証（本番必須）
- `NEXT_PUBLIC_APP_URL` - Webhook URL生成用

**デプロイ時**: `bunx prisma migrate dev --name add_google_calendar_integration` が必要

---

### 012-nextjs-best-practices.md (2026-01-11)

Next.js公式ベストプラクティス準拠改善

**実装内容**:

- adminをRoute Group `(admin)/admin/` に変更（URLは `/admin/...` のまま）
- cache() APIでverifySession/verifyAdminSessionをメモ化（DALパターン）
- withAuth HOFを直接auth()呼び出しに変更（Server Actions用）

**変更ファイル**:

- `src/app/(admin)/admin/` - 新しいRoute Group（移動）
- `src/lib/auth.ts` - verifySession, verifyAdminSession追加
- `src/types/server-actions.ts` - withAuth HOF改善

---

### 011-server-client-separation.md (2026-01-11)

D&DページのServer/Client Component分離

**実装内容**:

- Next.js公式ベストプラクティスに準拠したServer/Client分離
- blog/categories: page.tsx(506行)をServer Component(8行)+Client Component(379行)に分離
- settings/navigation: page.tsx(1068行)をServer Component(23行)+Client Component(780行)に分離
- 共通DragHandleコンポーネント活用（重複削除）

**新規ファイル**:

- `src/app/admin/blog/categories/_components/CategoryManager.tsx`
- `src/app/admin/settings/navigation/_components/NavigationManager.tsx`

**変更ファイル**:

- `src/app/admin/blog/categories/page.tsx` - Server Component化
- `src/app/admin/settings/navigation/page.tsx` - Server Component化

---

### 010-withauth-badge-improvements.md (2026-01-11)

withAuth HOF完全移行 + Badge variant意味的整合

**実装内容**:

- 全Server Actions mutation関数（69関数）をwithAuth HOFに移行
- Badge variantの意味的整合（Inquiry/Customer/Publishステータス色修正）
- CustomerDetail.tsxの重複コード削除
- announcement-bar.tsの認証パターン統一（auth()→withAuth）

**変更ファイル**:

- 11個のServer Actionsファイル（blog, settings, api-keys, navigation, space, user, news, customer, reservation, inquiry, announcement-bar）
- `src/components/admin/status-badges.tsx` - variant修正
- `src/app/admin/customers/[id]/_components/CustomerDetail.tsx` - 重複削除

---

### 009-delayed-improvements.md (2026-01-11)

延期されていたコード改善タスクの実装

**実装内容**:

- StatusBadge共通化: 5つの重複コンポーネントを `status-badges.tsx` に統一
- withAuth HOF: Server Actions用の認証ラッパー関数を追加
- 命名規則統一: 5ファイルをkebab-caseからPascalCaseにリネーム
- 重複コード削除: Turnstile.tsxの重複verifyTurnstileToken関数削除

**新規ファイル**:

- `src/components/admin/status-badges.tsx`

**変更ファイル**:

- `src/types/server-actions.ts` - withAuth HOF追加
- 各テーブル/詳細コンポーネント - StatusBadgeインポート更新
- 各ページ - リネームファイルのインポート更新

**削除ファイル**:

- 5つの重複StatusBadge.tsx

**リネームファイル**:

- `login-form.tsx` → `LoginForm.tsx`
- `user-form.tsx` → `UserForm.tsx`
- `user-actions.tsx` → `UserActions.tsx`
- `image-upload.tsx` → `ImageUpload.tsx`
- `turnstile.tsx` → `Turnstile.tsx`

---

### 008-api-keys-management.md (2026-01-11)

外部サービスAPIキー管理機能

**実装内容**:

- 管理画面からResend/Turnstile/Google MapsのAPIキー設定
- AES-256-GCM暗号化による安全な保存
- マスク表示（例: `re_1234...7890`）
- 各サービスの接続テスト機能
- 汎用APIキー管理（任意のサービス用JSON形式）
- 設定画面に「APIキー」タブ追加

**新規ファイル**:

- `src/types/api-keys.ts` - 型定義
- `src/lib/validations/api-keys.ts` - Zodスキーマ
- `src/lib/api-keys/` - サービスヘルパー（helpers/resend/turnstile/google-maps）
- `src/actions/admin/api-keys.ts` - Server Actions（認証付き）
- `src/app/admin/settings/_components/sections/ResendSection.tsx`
- `src/app/admin/settings/_components/sections/TurnstileSection.tsx`
- `src/app/admin/settings/_components/sections/GoogleMapsSection.tsx`
- `src/app/admin/settings/_components/sections/CustomApiKeysSection.tsx`
- `src/app/admin/settings/_components/tabs/ApiKeysTab.tsx`
- `src/app/admin/settings/_components/shared/StatusBanner.tsx`

**変更ファイル**:

- `prisma/schema.prisma` - APIキー関連フィールド追加
- `src/app/admin/settings/_components/SettingsTabs.tsx` - APIキータブ追加

**デプロイ時**: `bunx prisma migrate dev --name add_api_keys_management` が必要

---

### 007-announcement-bar-design-styles.md (2026-01-11)

お知らせバー デザインスタイルプリセット機能

**実装内容**:

- 5種類のデザインスタイル追加（solid/gradient/outlined/glass/minimal）
- サイト全体で統一されたスタイル設定
- 管理画面にリアルタイムプレビュー機能
- 無効値のフォールバック処理

**変更ファイル**:

- `prisma/schema.prisma` - announcementBarDesignStyleフィールド追加
- `src/actions/admin/settings.ts` - デザインスタイル設定の取得・更新
- `src/app/admin/settings/_components/sections/AnnouncementBarCarouselSection.tsx` - UI追加
- `src/components/site/AnnouncementBarCarousel.tsx` - スタイルクラス実装
- `src/components/site/AnnouncementBarWrapper.tsx` - バリデーション追加

**デプロイ時**: `bunx prisma migrate dev --name add_announcement_bar_design_style` が必要

---

### 006-announcement-bar-and-news-editor.md (2026-01-11)

お知らせバー機能 + お知らせ管理tiptap統合

**実装内容**:

- お知らせ管理にtiptapリッチテキストエディター導入（画像・YouTube対応）
- AnnouncementBar機能の新規実装（サイト上部バナー）
- 3種類のタイプ（info/warning/promo）、カスタム色、表示期間指定
- セキュリティ: Server Actions認証、XSS対策（DOMPurify）

**新規ファイル**:

- `src/actions/admin/announcement-bar.ts` - Server Actions
- `src/app/admin/settings/announcement-bar/page.tsx` - 管理画面
- `src/components/site/AnnouncementBar.tsx` - 表示コンポーネント
- `src/components/site/AnnouncementBarWrapper.tsx` - Server Component ラッパー
- `docs/requirements/announcement.md` - 要件定義

**変更ファイル**:

- `prisma/schema.prisma` - AnnouncementBarモデル追加
- `src/app/admin/news/_components/NewsForm.tsx` - tiptap統合
- `src/app/(public)/news/[id]/_components/NewsContent.tsx` - iframe対応
- `src/app/(public)/layout.tsx` - AnnouncementBarWrapper追加

**デプロイ時**: `bunx prisma migrate dev --name add_announcement_bar` が必要

---

### 005-actionresult-complete-migration.md (2026-01-10)

ActionResult完全移行 - 全Server Actions統一

**実装内容**:

- BusinessHoursSection.tsx の unsafe cast（`as string[]`、`as BusinessHours`）を`??`に置換
- 全管理画面Server Actions（11ファイル）をActionResult<T>型に統一
- `defaultBusinessHours: unknown | null` → `BusinessHours | null`型修正
- フォームコンポーネント（SpaceForm, BlogForm, NewsForm）の戻り値アクセス修正

**変更ファイル（14ファイル）**:

- `src/actions/admin/user.ts` - ActionResult移行
- `src/actions/admin/navigation.ts` - ActionResult移行
- `src/actions/admin/space.ts` - ActionResult移行
- `src/actions/admin/reservation.ts` - ActionResult移行
- `src/actions/admin/blog.ts` - ActionResult移行
- `src/actions/admin/customer.ts` - ActionResult移行
- `src/actions/admin/inquiry.ts` - ActionResult移行
- `src/actions/admin/news.ts` - ActionResult移行
- `src/actions/admin/settings.ts` - ActionResult移行 + defaultBusinessHours型修正
- `src/app/admin/settings/_components/BusinessHoursSection.tsx` - unsafe cast排除
- `src/app/admin/spaces/_components/SpaceForm.tsx` - result.data.id参照
- `src/app/admin/blog/_components/BlogForm.tsx` - result.data.id参照
- `src/app/admin/news/_components/NewsForm.tsx` - result.data.id参照

---

### 004-type-safety-improvement.md (2026-01-10)

型安全性向上 - ベストプラクティス準拠

**実装内容**:

- JSONフィールドのZodバリデーション関数（`as`キャスト排除）
- Prisma WhereInput型エイリアス（`Record<string, unknown>`排除）
- 共通Server Actions型（ActionResult<T>）

**新規ファイル**:

- `src/types/server-actions.ts` - 共通ActionResult型
- `src/types/prisma.ts` - WhereInput型エイリアス
- `src/types/index.ts` - 集約re-export
- `src/lib/json-validators.ts` - Zodバリデーション関数

**変更ファイル**: 11ファイル（actions, pages）

---

### 003-reservation-terms-agreement.md (2026-01-10)

予約フォーム規約同意機能

**実装内容**:

- 予約フォームに規約同意チェックボックスを追加
- 同意日時（termsAgreedAt）をDBに記録
- 管理画面から有効/無効・文言・対象規約を設定可能

**新規ファイル**:

- `src/components/site/ui/Checkbox.tsx`
- `src/app/admin/settings/_components/sections/TermsAgreementSection.tsx`

**変更ファイル**:

- `prisma/schema.prisma` - Reservation/Settings にフィールド追加
- `src/actions/admin/settings.ts` - 設定取得/更新関数追加
- `src/lib/validations/reservation.ts` - 規約同意スキーマ追加
- `src/actions/reservation.ts` - 規約同意対応
- `src/app/(public)/reservation/page.tsx` - 設定取得
- `src/app/(public)/reservation/_components/ReservationForm.tsx` - UI追加

**デプロイ時**: `bunx prisma migrate dev --name add_terms_agreement` が必要

---

### 002-stripe-payment-settings.md (2026-01-10)

Stripe決済設定 + 画像アップロード統合

**実装内容**:

- 画像アップロード: EditorToolbar.tsx に ImageUploadDialog を統合
- Stripe設定: 決済タブ追加、APIキー暗号化保存、接続テスト機能
- セキュリティ: AES-256-GCM暗号化、XSS対策、ブラウザ拡張対策

**新規ファイル**:

- `src/lib/crypto.ts`
- `src/lib/stripe.ts`
- `src/lib/validations/stripe.ts`
- `src/app/admin/settings/_components/sections/StripeSection.tsx`
- `src/app/admin/settings/_components/tabs/PaymentTab.tsx`

---

### 001-architecture-improvements.md (2026-01-10)

アーキテクチャのベストプラクティス準拠改善

**実装内容**:

- tsconfig.json: target を ES2017 → ES2022 に更新
- globals.css: フォント変数の修正（--font-sans を正しく参照）
- prisma.ts: PostgreSQL Pool の接続設定強化
- layout.tsx: dynamic 設定のコメント明確化

**精査結果**: 総合スコア 4.2/5

---

### settings-tab-refactoring.md (2026-01-09)

設定画面のタブリファクタリング

**実装内容**:

- page.tsx を 773行 → 110行 に削減
- 6タブ構成（一般・事業者・SEO・メール・予約・システム）
- nuqs による URL 状態管理

---

### tiptap-integration.md (2026-01-09)

TipTap エディタの統合

**実装内容**:

- RichTextEditor コンポーネント作成
- EditorToolbar / EditorContent 分離
- BlogForm への統合

---

## 未着手の計画

なし
