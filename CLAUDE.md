# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム
> デプロイ: Google Cloud Run（`Dockerfile` + `cloudbuild.yaml`）— Vercel 不使用

## コマンド

```bash
bun dev                                       # 開発サーバー（Turbopack）
bun run validate                              # type-check → lint（作業中）
bun run validate && bun run build             # 完全検証（コミット前必須）
bun run build:skip-env                        # env 未設定時ビルド
bun run analyze                               # Turbopack-native bundle 解析
bun run lhci                                  # Lighthouse CI
bun run test:unit                             # 単体テスト（per-directory バッチ、簡略化禁止）
bun run test:integration                      # 統合テスト
bun run test:all                              # 単体 + 統合
bun run e2e                                   # Playwright E2E
PLAYWRIGHT_VISUAL=1 bunx playwright test --project=chromium-visual [--update-snapshots]
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun run db:seed                               # Seed
bun outdated && bun update                    # 依存更新（パッチ/マイナーでも破壊的 lint 変更あり。実行後 validate 必須）
```

保護ファイル（PreToolUse hook で編集拒否）: `.env*` / `bun.lock` / `prisma/migrations/*.sql`

## アーキテクチャ

Multiple Root Layouts: `(admin)/` と `(public)/` で CSS・認証・レイアウトを完全分離（遷移はフルページリロード）。
管理 write 系は `executeAdminMutationResult`（認証・権限・監査ログ一括処理）。API Route のみ `checkPermission()` 直接使用。
公開コンテンツ: `/posts`（ブログ）・`/news`・`/spaces`・`/events`・`/faq`。RSS: `/feed.xml`。

詳細: `.claude/rules/project-structure.md` / `.claude/rules/frontend/project-design-config.md`（パスで自動ロード）

## 技術スタック（非自明な注意点のみ）

| 技術         | 注意点                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Next.js 16   | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）。Suspense 内 async SC は `await connection()` |
| React 19.2   | Compiler 1.0 自動メモ化。`useCallback`/`useMemo`/`memo` 禁止（例外→`react-patterns.md`）                              |
| TypeScript 6 | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                                                             |
| Prisma 7     | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*`                                             |
| Tailwind 4.2 | CSS-first `@theme`、セマンティックトークン必須                                                                        |
| Better Auth  | `adminAuth`/`customerAuth` 分離、独自 `ROLE_PERMISSIONS` SSoT、`generateId: "uuid"` 必須                              |
| Zod 4        | `.merge()` deprecated（→ `.extend(shape)`）、`.refine()` 後の `.omit()` 不可、`error:` 必須                           |
| Lexical 0.43 | NodeState API（`$config` + `createState`）                                                                            |
| nuqs 2.8     | パーサーマップ `@/shared/lib/nuqs`、`useQueryStates({ shallow: false })` で RSC 再レンダリング                        |

---

## ハードルール（プロジェクト固有）

詳細・参照実装・例外は各 rule ファイル（`.claude/rules/**/*.md`、パスで自動ロード）。

### 型・コード品質

- **型アサーション（`as`）禁止** — 型ガード・`satisfies`・Zod `safeParse` を使う（→ `type-safety.md`）
- **`useCallback`/`useMemo`/`memo` 禁止** — React Compiler 1.0 が自動メモ化。例外は `useSyncExternalStore` subscribe 等（→ `react-patterns.md`）
- **ハードコードカラー禁止** — セマンティックトークン必須（例外: `global-error.tsx`）
- **`className` テンプレートリテラル・文字列内改行禁止** — `cn()`（`@/shared/lib/cn`）使用（→ `tailwind-patterns.md`）
- **ステータス・公開状態ラベルのハードコード禁止** — `enums/helpers.ts` の `*_STATUS_LABELS` / `PUBLISH_LABELS` / `AUDIT_ACTION_LABELS` 参照
- **`isValid*` 型ガードの配置** — Prisma enum は `enums/guards.ts`、DB-VARCHAR enum は `enums/helpers.ts`（非 Prisma 値は `guards.ts` から再 export しない）

### アーキテクチャ境界

- **app 層からの Prisma 直 import 禁止** — `@/shared/db/prisma` は domain/lib 経由のみ（例外: `calendar-sync` `$queryRaw`）。Prisma enum / 名前空間は `enums/prisma-types` ゲートウェイ経由（`architecture-boundaries.test.ts` で検出）
- **`"use server"` ファイルは async 関数のみ export 可** — 型・定数・`export type { X }` 含め禁止。Turbopack bundler が型識別子を runtime 参照化する silent bug。型は `<file>-types.ts` に退避
- **内部 helper に `"use server"` を付けない** — 他の Server Action からのみ呼ばれる internal module（CDN purge / `updateTag` ラッパー等）は `import "server-only"` を使う。`"use server"` は RPC endpoint を生成するため、認証なし helper を公開すると Cache-layer DoS 等の security 経路になる（`post/cache-helpers.ts` 参照）
- **server-only 定数を Client Component から import 禁止** — client-safe ファイルに分離（`admin-roles.ts` / `admin-resources.ts` 参照）
- **server-only / Node-only SDK 統合** — `ical-generator` / `resend` / `googleapis` / `stripe` 等は `import "server-only"` 必須（→ `server-only-patterns.md` §検出 grep）

### Validation / Domain

- **配列 uniqueness はスキーマ層で契約** — `imageUrls` / `facilities` / `tags` 等は Zod `.refine()` で重複拒否。UI 層の Set dedup 禁止。cross-field 重複は top-level refine（→ `zod-patterns.md`）
- **`<input type="datetime-local">` の Zod は `.datetime({ local: true })` 必須** — strict `.datetime()` は `"YYYY-MM-DDTHH:mm"` を reject（→ `zod-patterns.md`）
- **Mutually exclusive boolean フィールドは 3 層防御** — ① UI `disabled` ② onChange で子 field クリア ③ domain command で `normalizeXxx()` ヘルパー強制正規化（Event `status` ↔ `registrationOpen` 参照）
- **管理ユーザー操作（招待・作成・ロール変更・削除）は階層制御の 2 層防御必須** — UI で `getInvitableRoles(actorRole)` フィルタ + domain command で `canInviteRole()` / `canModifyUser()` による `DomainError("FORBIDDEN")`
- **ドメインコマンドの actor 引数は `{ id: string; role: Role }` オブジェクト** — 単独 `actorUserId: string` 禁止。`executeAdminMutationResult` から `(user) => cmd(input, { id: user.id, role: user.role })` で渡す
- **外部 API 統合は SSoT ヘルパー経由必須** — Resend は `sendEmail()`、Google Calendar は `withGoogleApiRetry()`、Turnstile は `validateTurnstile()`、Cloudflare R2 は `uploadFile()` / `deleteFile()`（`@/shared/lib/r2/*`）。直接 SDK 呼び出しは接続テスト / OAuth 初期化のみ例外（→ `external-api-retry-patterns.md`）
- **GCal outbound sync は attendees 空 + description マーカー + fireAndForget** — サービスアカウント + DWD 未設定では `attendees` populate 不可（Google 公式）。業界標準（Eventbrite/Peatix/connpass/Luma/Meetup 全社）と揃える。description 1 行目に `予約ID:` / `イベントID:` マーカー（`OUTBOUND_*_MARKER`）を埋め込み `isAppGeneratedCalendarEvent` で inbound ループ防止。Server Action の `afterSuccess` で `fireAndForget` 非ブロッキング実行。エラー記録は `markXxxCalendarSyncError` 経由のみ（catch で `logError` 重複禁止）（→ `ical-patterns.md` §GCal Outbound Sync）
- **Turnstile 配置基準** — 未認証公開フォーム必須。認証済みでも予約作成/変更/キャンセル・決済等の高リスク操作は許容。参照系は不要

### UI / UX

- **DB フェッチ公開ルートは `loading.tsx` + `error.tsx` 必須**
- **URL 由来の初期値を受ける Client Component は `key={urlValue}` で remount 必須** — 同一ルート内で `searchParams` / 動的セグメントが変わっても Client は remount されず `useState` lazy init / `useForm defaultValues` / `useReducer` initial state が stale 化する（→ `react-patterns.md` §Resetting state with key）
- **Multiple Root Layouts で `app/not-found.tsx` 禁止** — `app/global-not-found.tsx` + `experimental.globalNotFound: true` 使用（→ `gotchas.md`）
- **管理画面のアクションボタンはページヘッダー右端配置** — タブ行内配置禁止（`spaces/page.tsx` `HeaderAction` 参照）
- **管理テーブルの `*Table.tsx` は `items.length === 0` で EmptyState 早期 return** — 「ヘッダーが見えない」は seed 件数を先に確認
- **enum 依存の条件フィールドは `useWatch` + 条件レンダリング** — 切替時に `setValue("field", "")` + `form.clearErrors("field")`
- **公開ページ テキスト型タブは `text-decoration: underline` + Radix Tabs / nav + `aria-current`** — `border-b-2` on `inline-block` は Chromium intrinsic width バグ。`<Link role="tab">` は WAI-ARIA 誤用（→ `frontend/accessibility.md`）
- **Grid item の default は `justify-self: stretch`** — container に `justify-items-start` + 中央/右端 item に `md:justify-self-*` で override（`site-header.tsx` 参照）
- **リスト `.map` 内の個別 `<ScrollReveal>` wrap 禁止** — `ScrollRevealGroup`（1 ScrollTrigger + stagger）に集約（→ `frontend/gsap-patterns.md` §パターン D）
- **Structured list container の canonical border**: `divide-y border-y border-border divide-border`
- **公開サインインは Better Auth Client API `signIn.email({ callbackURL })`** — Server Action 経由は Router Cache 未更新の silent bug（→ `auth-patterns.md` §signIn）
- **Tailwind v4 JIT HMR 新規 class 未反映時は dev restart** — `netstat -ano | grep :3000` → `cmd //c "taskkill /PID <pid> /F /T"` → `bun dev`（→ `gotchas.md`）
- **Event admin form は構造化フィールド先頭・本文最後** — 業界標準（Eventbrite / Peatix / connpass）は日時/定員/ステータスが主役。content-first は Article（Post / News）専用

---

## プロセスルール

### 検証

- **作業中** `bun run type-check`、**完了前** `bun run validate`、**コミット前** `bun run validate && bun run build`
- **依存パッチ/マイナー更新後は `bun run validate` 必須** — eslint-plugin-react-hooks 7.0.1 → 7.1.1 のようなパッチで新 lint ルール（`set-state-in-effect` / `immutability` / `refs` / `purity` 等）が追加され実質破壊的変更になる。新ルール由来のエラーは eslint-disable ではなく公式推奨パターン（"Adjusting State Directly During Render" / `useSyncExternalStore` / render 中 derive）への書き換えで解消する
- **`test:unit` / `test:integration` は per-directory バッチ**（`package.json` 参照）— `bun test __tests__/unit` / `bun test --coverage` への簡略化禁止（`mock.module` 干渉で偽陽性）。CI の `.github/workflows/ci.yml` も同一制約（→ ADR 0010）
- **大規模監査の前提** — `bun run validate` が exit 0 なら compiler/linter 基準ではクリーン。監査で大量違反報告時はまず validate を ground truth に
- **Pre-existing test failure の切り分け** — `git stash -u && bun test <file> && git stash pop` で HEAD 時点の fail 数と比較

### 調査・監査

- **「公式推奨」主張前**: `mcp__context7__query-docs` で一次資料確認（Radix / RHF / Next.js / React / Prisma / Zod）
- **「公式準拠」「クリーン実装」「ベストプラクティス」指示時は context7 verification 必須** — agent dispatch 前に Next.js / React / Prisma / Zod / Better Auth / Lexical / **WAI-ARIA APG（`/w3c/aria-practices`）** の該当バージョン docs を `mcp__context7__query-docs` で取得し、プロジェクトルール（`.claude/rules/**`）との乖離をチェック。プロジェクト独自厳格化（公式より厳しい）は ADR 扱いで保持
- **a11y 実装は ARIA First Rule（"native HTML > ARIA role"）を最優先で適用** — `role="button"` + 自前キーボードハンドラ（Enter=keydown / Space=keyup）は 2nd-best。native `<button>` を absolute overlay + `pointer-events-none/auto` で組み替えられないか先検討（gotchas.md §button ネスト禁止 の Block Link / Card Overlay パターン）。2nd-best 実装を提案する前に必ず第一推奨の適用可否を検証
- **a11y 実装前に UX state の実使用を grep で確認** — `selectedId` / `isSelected` 等の state が外部 consumer と連動しない「視覚ハイライト専用」なら dead state として削除候補。dead state に `aria-pressed` / キーボードハンドラ / focus ring を付けるのは over-engineering（`media/_components/MediaGrid.tsx` の `selectedId` 削除が参照事例）
- **context7 に無い Playground / reference implementation は `gh api` で一次ソース直接参照** — Lexical の `FloatingTextFormatToolbarPlugin` / `setFloatingElemPosition` / `DraggableBlockPlugin_EXPERIMENTAL` 等は `@lexical/react` の公開 API ではなく Playground 固有の参考実装のため context7（`/facebook/lexical` / `/websites/lexical_dev` 両方）にヒットしない。`gh api repos/facebook/lexical/contents/packages/lexical-playground/...` で裏取り。この場合の主張粒度は「公式 API ドキュメント準拠」ではなく **「reference implementation 準拠」** と明記（overstate 回避）
- **Radix primitives の具体例**: context7 取得不可 → `WebFetch` で `https://www.radix-ui.com/primitives/docs/components/<name>`
- **一括修正後**: Grep で違反パターン残存ゼロ確認してから完了報告
- **精査系 subagent の「使用なし」「欠落」報告は実装 Read + grep で二段検証必須** — grep ベース調査は seed 関数内の間接使用を見落として false positive を出す
- **レビューエージェント指摘**: `gotchas.md` と照合して誤報除外（`revalidateTag` 第2引数、JSX IIFE 算術式偽陽性、`select.tsx` required 等）。`bun run lint` exit 状態 + Read を ground truth とする
- **監査エージェント指摘**: 該当 rule ファイル（`react-patterns.md` / `lexical-patterns.md` / `type-safety.md` 等）の「例外」節とクロスリファレンス
- **SSoT 重複検出の grep**: symbol 名だけでなく **literal 文字列**（`"スーパー管理者"` 等）でも再 grep
- **ESLint `no-restricted-syntax` selector は静的+動的両対応** — `> ArrayExpression` は literal `[a, b]` のみ、`items.map(...)` 等の動的配列を見逃す。禁止パターン追加時は `CallExpression[callee.property.name='map']` 経路も `selector` に含める（`$transaction` rule が実例）
- **Plan `完了` ステータスでも実装存在とは限らない** — 大規模リデザイン・命名規約変更で機能が削除／置換されることあり。plan 参照時は `Glob` で実在確認 + `Grep` で代表 symbol + `git log --oneline -- <path>`
- **bundle「未使用チャンク」報告は `react-loadable-manifest.json` で lazy-load 確認必須** — `.next/server/app/*.html` 埋め込み scan だけでは `next/dynamic` 経由の lazy chunk を「未使用」と誤認する false positive。Lexical / Recharts / Radix 等の 200KB+ チャンクは大抵 lazy-load 正当化済みのため、削除判定前に manifest で参照元ルート数を確認

### Git / Migration

- **Worktree 作成前**: `git status --short | wc -l` + `ls prisma/migrations/ | tail -1` で未コミット migration 確認、ドリフトあれば先に WIP commit（→ `gotchas.md`）
- **Prisma 7.7 CLI フラグ変更**: `migrate diff --to-schema-datamodel` → `--to-schema`、`--shadow-database-url` 削除、`db execute --schema` 削除。非対話 destructive migration は「schema 編集 → `mkdir prisma/migrations/<ts>_<name>` → `migration.sql` 手書き → `db execute --file` → `migrate resolve --applied`」順（→ `gotchas.md`）
- **schema.prisma commit 後は `prisma/migrations/` 側も同時 commit 必須** — schema のみ commit は `prisma migrate deploy` が CI/prod で fail する silent drift
- **テストファイルは top-level `__tests__/` のみ** — `src/**/__tests__/` 配置禁止（`tsconfig.test.json` include 範囲外）（→ `test-quality.md`）

### 実装パターン

- **Prisma enum 新規追加は 8 箇所同時更新**: ① schema + migration ② `enums/prisma-types` re-export ③ `enums/guards` 型ガード ④ `enums/helpers` ラベル + parseFilter ⑤ validation スキーマ ⑥ domain types + queries + commands ⑦ Server Actions + 公開フォーム ⑧ 管理 UI + seed + テスト。①〜③は 1 implementer にバンドル。**enum がテンプレート/UI Meta を持つ場合は +3 箇所**: 例 `TermsType` は `TERMS_TYPES` 配列（`validations/terms.ts`）+ `TERMS_TYPE_META`（管理 Dialog のアイコン）+ `TERMS_TEMPLATES` Record（`terms-templates.ts`）。参照実装: `prisma/migrations/20260421022747_add_review_guidelines_and_cookie_policy_terms_types/`
- **新規 Prisma モデル追加は `schema + seed + admin-ui` の 3 点セット同時作成必須** — seed 漏れは EmptyState で実装検証不可。enum フィールドは**全値を seed に網羅**
- **Seed 関数は `upsert` で idempotent 化 + `seedAll` / `seedDemo` 両方に登録** — `deleteMany + create` は `--demo` で既存破壊（`seedEmailTemplates` 参照）
- **Terms / News / Post / Section / Space の seed は Lexical JSON 同時保存必須** — `contentHtml` 単独禁止。`buildParagraphEditorStateJson()` + `buildParagraphHtml()`（`@/shared/lib/lexical/description-defaults.ts`）
- **公開一覧ページ新設の 10 点セット**: ① `page.tsx` + `loading.tsx` + `error.tsx` ② `generatePageMetadata(slug)` + `BreadcrumbJsonLd` ③ `getPageSectionsWithFallback(slug)` ④ trailing sections から同種 + `cta` 除外 ⑤ `default-page-sections.ts` + `SYSTEM_PAGES` ⑥ seed Page レコード ⑦ sitemap.ts ⑧ NavigationItem seed ⑨ E2E fixtures urls ⑩ layout.tsx `alternates`（該当時）
- **「推奨で」「クリーン実装」指示時の変換セット** — ① nuqs `parseAsString.withDefault` → `parseAsStringLiteral(values)` + `isValid*` 型ガード ② 複合 `sort` → `sortBy` + `sortOrder` + `SortableColumnHeader` ③ 手動 debounce → `useDebouncedCallback`（`@/admin/hooks`）④ Select `onValueChange` `as` → `isValid*` narrow ⑤ 同系統テーブルと Grep 比較
- **UX スケール判断は seed 件数ではなく CMS 運用上限で** — Location / Category / Tag 等運用者が追加できるリソースは production 想定値（数十〜100）で設計。フィルタ UI 閾値目安: pill 2〜5 / scroll 6〜15 / dropdown 16+
- **Feature toggle 粒度** — 単一 tenant は per-entity 単一層、multi-tenant template は `Settings.xxxEnabledGlobal` + `Entity.xxxEnabled` の 2 層（precedence 一方向: Global OFF → 常に非表示 / Global ON → per-entity 効く）。参照: `Settings.reviewsEnabledGlobal` ↔ `Space.reviewsEnabled`
- **Lexical 新規ノードで作成時バリアント選択 UI が必要な場合** — dialog-upfront 3 コマンド体制（`OPEN_XXX_DIALOG_COMMAND` / `INSERT_XXX_COMMAND` / `UNGROUP|TRANSFORM_XXX_COMMAND`）。全 UI 経路（Insert / FT / ⋮⋮ / keyboard）は dispatch 前に `$getSelectionBlockNodes()` のキーをスナップショットして payload に積む（ダイアログフォーカスで editor 選択が失われるため必須）。hardcoded default 値の silent 挿入禁止。参照実装: `GroupPlugin`（→ `frontend/lexical-patterns.md` §グループ化）

### Subagent 規律

- **implementer は sonnet 以上**（haiku 禁止、report 捏造リスク）
- **完了報告後は独立検証**: `git log --oneline` + `git show --stat HEAD`
- **review agent の「欠落」「型不整合」報告は Read + Glob で実在確認** — project-reviewer は `Serialized<T>` 型システムを未把握で Date→string を warning 化、route-structure-reviewer は Glob Windows パス変換で実在 loading.tsx を「欠落」扱いする false positive 傾向あり。report ベースで修正着手せず、対象ファイルを直接 Read して現状確認
- **reviewer は MINGW64 `()` 含みパス Glob で誤検出する** — cache-strategy-reviewer 等が `src/shared/lib/constants/` 実在を「不在」と報告し「キャッシュ実装なし」と結論する false positive。受領後は `ls src/shared/lib/constants/` + `grep -rln "updateTag\|revalidateTag\|'use cache'" src/` で独立検証してから判断
- **密結合タスクは 1 implementer にバンドル**
- **implementer dispatch の staging discipline 強化** — prompt に「`git add` は touched files の明示 path 列挙のみ、`git add -A` / `git add .` / `git commit -a` 禁止」を明記。既存の uncommitted changes（他 topic の rename 等）を巻き込むリスクを明示警告する（revert + 選択的 stage + 再コミットで復旧可能だが工数を増やす）
- **dispatch プロンプトに「plan 記載 identifier と実装が乖離していれば justified deviation として保持し報告」を明記** — plan に合わせた強制 rename 禁止
- **plan 実行前の前提実在確認** — plan に「既存テスト XXX に mock 追加」「既存ファイル YYY を修正」と記載されていても、実行前に `ls <path>` / `Glob` で **実在確認必須**。実在しない場合は Bundle スコープを「pure function 抽出 + 新規 unit test」「小機能追加」等に変換する判断を controller が行う（implementer を BLOCKED にせず scope を柔軟に変換）
- **並列 reviewer dispatch 前に `.claude/rules/**` 準拠度を grep で先行確認** — rule で既に厳格化済みのパターン（`revalidateTag\(.\*,`/`useCallback\(`/`gsap.matchMedia` 等）は 1 回の grep で violations ゼロを判定できる。多数の reviewer を並列起動するより、grep hits を元に必要 reviewer を絞る方が token コスト + context 圧迫を削減
- **long-running general-purpose agent（tool_uses 40+ / duration 300s+）の最終報告が途切れたら git で独立検証** — SendMessage で再取得を待つより `git status --short` + `git diff --stat HEAD` + 対象ファイル個別 diff の方が速く正確。subagent の「実装完了」報告が HEAD と収束して staged diff ゼロのケースも検出できる

---

## ワークフロー

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

- **計画作成**: `brainstorming` → `writing-plans`（specs: `docs/superpowers/specs/`、plans: `docs/superpowers/plans/`）。意図明確時は Q&A スキップ可
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`
- **セッション継続時**: `docs/plans/README.md` 確認

---

## SSOT 定数・シングルトン

| 定数/変数                                                                                            | 場所                                           | メモ                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_ROLES` / `ROLE_LABELS` / `ROLE_DESCRIPTIONS` / `isDashboardRole()` / `DashboardRole`      | `@/shared/lib/admin-roles`                     | client-safe Role SSoT。`admin-auth.ts`（server-only）が再 export。tuple のため `isDashboardRole()` 型ガード必須                                                                                                                                                                                                                                                        |
| `INVITABLE_BY` / `getInvitableRoles()` / `canInviteRole()` / `canModifyUser()`                       | `@/shared/lib/admin-roles`                     | client-safe RBAC 階層制御。SUPER_ADMIN→ADMIN/EDITOR/VIEWER、ADMIN→EDITOR/VIEWER のみ（特権昇格防止）                                                                                                                                                                                                                                                                   |
| `adminAuth` / `customerAuth`                                                                         | `@/shared/lib/{admin,customer}-auth`           | cookie prefix 分離。顧客は Google/LINE、`basePath: /api/customer-auth`                                                                                                                                                                                                                                                                                                 |
| `prisma` / `basePrisma`                                                                              | `@/shared/db/prisma`                           | `basePrisma` は Better Auth アダプター専用（`$extends` 前）                                                                                                                                                                                                                                                                                                            |
| `CACHE_TAGS` / `getCacheTag` / `CACHE_LIFE`                                                          | `@/shared/lib/constants`                       | `CACHE_TAGS.SETTINGS` は廃止済 → 個別タグ                                                                                                                                                                                                                                                                                                                              |
| `invalidateReservationCaches` / `invalidateEventCaches` / `invalidateReviewCaches`                   | `@/shared/lib/cache/*-cache.ts`                | mutation 後のキャッシュ無効化 SSoT。ローカル `updateTag` 羅列禁止、helper を拡張                                                                                                                                                                                                                                                                                       |
| `OUTBOUND_RESERVATION_MARKER` / `OUTBOUND_EVENT_MARKER` / `isAppGeneratedCalendarEvent`              | `@/shared/lib/calendar-sync/loop-prevention`   | GCal outbound → inbound ループ防止 SSoT。outbound（`outbound.ts` / `event-outbound.ts`）が description 先頭に「予約ID:」「イベントID:」を埋め込み、inbound（`event-inbound.ts`）が `isAppGeneratedCalendarEvent(description)` で 1 本化判定してスキップ。literal を outbound / inbound で重複定義しない                                                                |
| `Resource` / `Action` / `RESOURCE_LABELS`                                                            | `@/admin/lib/admin-resources`                  | client-safe Resource SSoT。`permissions.ts` が再 export                                                                                                                                                                                                                                                                                                                |
| `TURNSTILE_ACTIONS` / `TurnstileAction` / `DEFAULT_TURNSTILE_APPEARANCE`                             | `@/shared/lib/turnstile-actions`               | client-safe Turnstile action SSoT（英数/`_`/`-`、最大32文字）。server 側 `expectedAction` 検証で同一値参照                                                                                                                                                                                                                                                             |
| `STORAGE_PREFIXES` / `StoragePrefix`                                                                 | `@/shared/lib/r2/keys`                         | 画像ストレージの key prefix SSoT（`spaces` / `posts` / `site` / `media`）。Cloudflare R2 バケット内の仮想フォルダ名に対応。upload / delete の第 2 引数で使用                                                                                                                                                                                                           |
| `Prisma` 型 / Prisma enums（`Role` / `ReservationStatus` 等 34 種）                                  | `@/shared/lib/validations/enums/prisma-types`  | client-safe gateway。`Prisma` 名前空間は型のみ再 export。**runtime sentinel（`JsonNull` / `DbNull` / `join` / `sql` / `raw`）は gateway から取得不可** — `shared/db` / `shared/domain` が `@generated/prisma/client` から直接 import                                                                                                                                   |
| `*_STATUS_LABELS` / `AUDIT_ACTION_LABELS` / `PUBLISH_LABELS` / `getPublishLabel()`                   | `enums/helpers`                                | 全ステータス enum + boolean publish のラベル SSoT。UI でハードコード禁止                                                                                                                                                                                                                                                                                               |
| `NOTIFICATION_TYPE` / `isValidNotificationType`                                                      | `enums/helpers`                                | DB VARCHAR 管理                                                                                                                                                                                                                                                                                                                                                        |
| `FaqItem.answer`                                                                                     | `prisma/schema.prisma`                         | **プレーンテキスト単一列**（`@db.Text`）。管理は `/admin/faq` → `/admin/faq/[categoryId]` master-detail、CRUD は `FaqItemDialog` / `FaqCategoryDialog`。公開は `whitespace-pre-wrap`。Lexical 本文は Post/News/Terms/Section のみ                                                                                                                                      |
| `ArticleLayout` / `ArticleHeader` / `ArticleFooter` / `ArticleTagList`                               | `@/public/components/{layouts,ui}/article-*`   | 公開記事詳細（posts/news/preview）の統一ラッパー SSoT。`<article>` 末尾に個別 border ブロックを重ねない                                                                                                                                                                                                                                                                |
| `extractHeadings` / `HeadingEntry`                                                                   | `@/shared/lib/lexical/extract-headings`        | 目次用 h2/h3 抽出（Prisma JSON / 文字列両対応）。永続化済み `anchorId` のみ返す                                                                                                                                                                                                                                                                                        |
| `CustomHeadingNode` / `anchorIdState` / `HeadingAnchorPlugin`                                        | `@/admin/.../lexical/nodes,plugins`            | `HeadingNode` の NodeState 拡張 + Node Replacement。`HeadingAnchorPlugin` が `generateUniqueSlug` で `anchorId` 自動生成                                                                                                                                                                                                                                               |
| `$getSelectionBlockNodes` / `$isMultiBlockSelection`                                                 | `@/admin/.../lexical/lib/selection-helpers`    | 選択の「ブロック粒度」を求める SSoT。deepest common ancestor の直接 block-level 子を返す（WordPress Gutenberg の `getCommonRootClientID` 等価）。Group ネストに対応: Root 直下選択 → Root 子、Group 内選択 → Group 子。Floating Text FT（単一）↔ Block FT（複数）の排他制御、`GroupPlugin` から参照。ローカル再実装禁止                                                |
| `scrollToElement` / `scrollToElementById` / `scrollToTop`                                            | `@/public/lib/scroll`                          | `--header-height` 補正 + `prefers-reduced-motion` で `behavior: "instant"` 切替                                                                                                                                                                                                                                                                                        |
| `buildReservationCalendar` / `buildEventCalendar` / `buildAddToCalendarUrls` / `buildReservationUid` | `@/shared/lib/ical`                            | **RFC 5545 準拠 ICS SSoT**。`ical-generator` v10 + `@touch4it/ical-timezones`。UID 安定・SEQUENCE 管理（`icsSequence` を `{ increment: 1 }`）・METHOD:REQUEST/CANCEL・VTIMEZONE(Asia/Tokyo)。直接 `ical()` 呼び出し禁止。ICS DL は `/api/calendar/*` route（`data:` URL は Gmail ブロック）。UI は `AddToCalendar` Server Component（→ `ical-patterns.md`）            |
| `LogoutButton` / `HeaderAuthSlot`                                                                    | `@/public/components/{ui,layouts}/*`           | 公開顧客ログアウト SSoT。`HeaderAuthSlot` は `"authenticated" \| "guest"` discriminated union。`signOut({ fetchOptions: { onSuccess: () => router.push + router.refresh } })` で PPR session 無効化。**マイページ等にローカル配置禁止** — ヘッダー右上 1 箇所（→ `auth-patterns.md`）                                                                                  |
| `ScrollReveal` / `ScrollRevealGroup`                                                                 | `@/public/components/animations/scroll-reveal` | 入場演出 SSoT。単一要素は `ScrollReveal`（Hero/CTA）、`.map` リストは `ScrollRevealGroup`（1 ScrollTrigger + stagger）。個別 wrap は fold 外 opacity:0 待機の silent bug（→ `frontend/gsap-patterns.md`）                                                                                                                                                              |
| `formatEventVenue` / `formatEventAddress`                                                            | `@/shared/domain/events/venue`                 | Event 会場表示 SSoT。`location` + `space` + `addressDetail` の 3 ソース合成。iCal LOCATION / Email / JSON-LD / EventCard / CSV / related events で共通利用。直接組み立て禁止                                                                                                                                                                                           |
| `TERMS_TEMPLATES` / `applyBusinessInfo` / `getTemplatesForType` / `BusinessInfo`                     | `@/shared/lib/terms-templates`                 | 規約テンプレート SSoT（8 標準 TermsType の HTML テンプレート + Settings 事業者情報置換ヘルパー）。`【〜を入力してください】` プレースホルダーを Settings から自動置換し、未設定フィールドは入力プロンプトとして UI に残る設計。管理画面 `terms/new/page.tsx` と `seedTerms()` の両方が参照（DRY 化済み）。新規 `TermsType` enum 追加時はこの Record にテンプレ登録必須 |

---

## 自動ロード

- **Rules**: `.claude/rules/**/*.md` — `paths:` フロントマターで条件付き自動ロード。最重要は `gotchas.md`
- **Skills**: `.claude/skills/<name>/SKILL.md` に frontmatter（`description` 必須）+ 手順本体（500 行未満推奨）。詳細は `reference/*.md` / `data/*` に分割
- **Subagents**: `.claude/agents/<name>.md` — frontmatter `name` / `description` / `tools:`（最小権限）/ `model: sonnet` / `memory: project`
- **Memory**: `~/.claude/projects/<slug>/memory/MEMORY.md` がセッション開始時に自動ロード

包括的監査が必要な場合は、該当 subagent を並列起動（Agent ツール経由で description 参照）。
