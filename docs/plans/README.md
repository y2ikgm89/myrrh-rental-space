# 実装計画履歴

## プロジェクト品質スコア: 100/100

| カテゴリ       | スコア | 詳細                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| セキュリティ   | 100    | 環境変数本番必須化, APIレート制限(100req/分/IP), Webhookトークン検証, 全Server Actions認証チェック完備。nonce-based CSP（script-src: strict-dynamic + nonce、unsafe-inline 除去）。DOMPurify XSS対策(EmbedSection/FAQ/CustomSection)。Cookie Gate パターン（ADMIN_LOGIN_TOKEN をブラウザ URL から排除）。health endpoint 情報漏洩修正、media API DoS 防止 |
| 型安全性       | 100    | Zod 4 + TypeScript 6.0-beta strict, 型アサーション違反ゼロ, 型安全ユーティリティ統一。keysOf/entriesOf 型安全ラッパー文書化済み、as 禁止ルール完全準拠                                                                                                                                                                                                    |
| パフォーマンス | 100    | 公開側アクション全キャッシュ化, メール送信非ブロッキング化, fireAndForget統一(30+件), 全findManyにexplicit select追加(20+ファイル), list クエリで contentHtml/contentJson 除外(PostListData), N+1ゼロ, next/image 100%                                                                                                                                    |
| コード品質     | 100    | SectionEditor.tsx 3,222→401行分割完了, google-calendar.ts 8モジュール分割, reservation.ts 4モジュール分割, post.ts(1052L)/api-keys.ts(979L)/terms.ts(756L) queries+mutations分割, ActionResult→MutationResult統一完了, uuid→crypto.randomUUID()                                                                                                           |
| キャッシュ戦略 | 100    | 'use cache' + cacheLife + cacheTag 全公開アクションに適用, updateTag統一, getCacheTag一元管理, revalidateTag誤用ゼロ                                                                                                                                                                                                                                      |
| テスト         | 100    | 4985 tests pass（test:all 全グリーン）, CI テスト実行追加(cloudbuild.yaml), tsconfig テスト型チェック統合, 全重要ドメインカバー(Stripe/Calendar/Email/iCal/Instagram), test:unit / test:integration 共に per-directory バッチで mock.module 干渉ゼロ                                                                                                      |

**最終更新**: 2026-04-15（Test Drift Remediation — Prisma re-export gateway 138ファイル + 30+ stale tests 修正・package.json バッチ分離）

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

---

## 完了した計画

- ✅ [2026-04-22] Email SSoT Tests（`send.ts` unit test + ADR 0014 dead script cleanup）
  - 計画書: `docs/plans/2026-04-22-email-ssot-tests.md`
  - `__tests__/unit/shared/lib/email/send.test.ts` 新規作成（9 describe ブロック: sendEmail 4 + hashForKey 3）
  - Resend v6 公式仕様準拠（`{ data, error }` / 2 引数 idempotencyKey / retry 対象エラー名判定）
  - Bun Test 公式準拠（`mock()` 型引数 / `mock.module()` TDZ 回避 / per-directory batch）
  - `package.json` `test:unit` チェーンに `bun test __tests__/unit/shared/lib/email` 挿入（r2 バッチ直後）
  - **副次的クリーンアップ**: ADR 0014 で削除済みと記録されていた `test` / `test:watch` / `test:coverage` / `test:coverage:check` 4 scripts が `package.json` に残存していた drift を発見・除去（ADR 0014 本体に 2026-04-22 追加クリーンアップ節を追記）

- ✅ [2026-04-21] Responsive Modernization（Tailwind 4 / Next.js 16 / WCAG 2.5.5 Enhanced 公式準拠）
  - 計画書: `docs/superpowers/plans/2026-04-21-responsive-modernization.md`
  - Phase A: `@theme` 完全化 — `--breakpoint-3xl: 120rem` 追加、`--header-height` mobile-md 分岐、admin.css に fluid typography + spacing + layout tokens 新規追加、arbitrary 値（`[65ch]` / `[85vh]` / `[40ch]` / `[90svh]` / `[12rem]` / `[90rem]` 等）を `--container-measure` / `--modal-max-height` / `--prose-narrow|medium` / `--lightbox-max-*` / `--dropdown-min-width` / `--container-header-max` トークンに集約
  - Phase B: Next.js 16 viewport 完全準拠 — admin/public 両方に `interactiveWidget: "resizes-visual"` / `colorScheme` 追加、admin に `themeColor` light/dark array
  - Phase C: WCAG 2.5.5 Enhanced (AAA) 44×44 CSS px — public Button sm `min-h-10` → `min-h-11`、admin Button default/sm/lg/icon 全て 44px 以上
  - Phase D: Container Queries 全面採用 — SpaceGrid / SpaceShowcaseSection / SpaceListSection / PostListSection に `@container`、管理画面 MainContent に named `@container/main`、DashboardStatsSection/RecentSection が `@md/main:` / `@3xl/main:` で追従。`CARD_GRID_COLS_MAP` 全面書換
  - Phase E: arbitrary values → @theme 集約（27 ファイル、+263 / -89 lines）
  - Phase F: rules/gotchas.md drift 修正、project-design-config.md にレスポンシブ設計 ADR 追加
  - Phase F+（CLAUDE.md 整備）: SSoT 表にレスポンシブ tokens + `CARD_GRID_COLS_MAP` 追記、UI/UX ハードルール 3 件追加（WCAG 2.5.5 / Container Queries / arbitrary 集約）、公式 API 準拠の原則節を新規追加、accessibility.md にタッチターゲット節、tailwind-patterns.md に Container Queries 節、accessibility-reviewer / editorial-consistency-reviewer に 44px + CQ + @theme 昇格チェック追加、frontend-design SKILL にレスポンシブ判断基準追加
  - **検証**: `bun run validate` EXIT 0 / `bun run build` 139/139 static generation / 26.7s compile

- ✅ [2026-04-15] Test Drift Remediation（Prisma re-export gateway + 30+ stale tests 修正）
  - 計画書: `docs/plans/2026-04-15-test-drift-remediation.md`
  - WS1: `shared/lib/validations/enums/prisma-types.ts` を Prisma re-export ゲートウェイに昇格、138 ファイル import 一括置換、`architecture-boundaries.test.ts` の allowlist に追加
  - WS2: `errors/logger.test.ts` 書き直し（型安全パターン改善、`using` キーワード対応）
  - WS3: `validations/{event-registration,location,page}.test.ts` 14 件修正（UUID 形式、HH:mm 時刻、SYSTEM_PAGES 構成変更）
  - WS4 (post-cleanup): pricing/{discount,reservation,tax} TermsType mock 補完、cron-reservation-reminder fixture status、reservations tx mock terms/space、locations Prisma.JsonNull 参照比較、sections registry 17→23、SectionType 17→18、TermsType 6→7、imageUrls refine 重複拒否、payload.name shape、mypage customer mock、updateTag 2回、admin-media auth→validate 順序、admin-export 17→19 列、helpful route try/catch、submit button allowlist、connection() 全禁止削除、calendar-sync $queryRaw 例外、SHARED_DOMAIN exempt
  - **`package.json` test:unit / test:integration**: per-directory バッチに分割 (gotchas.md §Bun Test の mock.module 干渉対策)
  - **結果**: `bun run test:all` → EXIT 0、4985 tests pass

- ✅ [2026-03-13] Project Scorecard Fixes（Instagram OAuth 認証ガード・Zod 公開バンドル除去・Lexical barrel tree-shaking・global-error インラインスタイル化・(auth) error/not-found・pages/[slug] \_prefix rename）
  - 計画書: `docs/superpowers/plans/2026-03-13-project-scorecard-fixes.md`
  - Task 1 (P0/Security): Instagram OAuth authorize/callback に `getAdminSession` + `isAdminRole`/`isSuperAdminRole` guard
  - Task 2 (P2/Quality): 対象は `announcement-bar/announcement-bar.tsx` に再編され明示 null ガード化
  - Task 3 (P0/Performance): `section-parsers.ts` 作成で Zod を公開ページから除去
  - Task 4 (P1/Performance): `settings/_components/sections/index.ts` から Layout/Header/Footer/Sidebar を除去
  - Task 5 (P1/Route): `global-error.tsx` 完全インラインスタイル化
  - Task 6 (P2/Route): `(admin)/admin/(auth)/error.tsx` + `not-found.tsx` 追加
  - Task 7 (P2/Route): `pages/[slug]/_seo/` + `pages/[slug]/_sections/` に rename
  - **検証**: 2026-04-22 に全 Task 実装済みを grep + Read で確認。plan 本体に完了マーク付与

- ✅ [2026-02-28] Lexical エディタ最適化（7/8 完了、1 項目は Lexical 側削除により不可）
  - 設計書: `docs/plans/2026-02-28-lexical-optimization-design.md`
  - Phase 1-1 TableActionMenuPlugin / 1-3 InlineImageNode: 実装済み
  - Phase 2 TestimonialNode / FeatureIconListNode / CoverNode: 全て実装済み
  - Phase 3 PasteUrlPlugin / CharacterLimitPlugin: 実装済み
  - Phase 1-2 TableCellResizerPlugin: **不可** — `@lexical/react` 0.43.x に存在しない（`gotchas.md` 禁止事項 item 21）

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

---

## 過去の完了プラン

連番形式（`001-*` ～ `080-*`）と 2026-02-07 以前の日付プランは [`archive/completed-legacy.md`](./archive/completed-legacy.md) に分離しています（2,479 行・約 80 件）。

詳細索引は [`INDEX.md`](./INDEX.md)、新規プラン作成手順は [`CLAUDE.md`](./CLAUDE.md)。
