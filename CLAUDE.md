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

> 実バージョンは `package.json` + `bun.lock` が SSoT。下記は major.minor で各世代固有の注意点を記述。コア依存の列挙は [AGENTS.md](AGENTS.md#tech-stack)。

| 技術            | 注意点                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16.2    | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）。Suspense 内 async SC は `await connection()`                                               |
| React 19.2      | Compiler 1.0 自動メモ化。`useCallback`/`useMemo`/`memo` 禁止（例外→`react-patterns.md`）                                                                            |
| TypeScript 6.0  | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                                                                                                           |
| Prisma 7.8      | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*`。CLI flag 変更（`migrate diff --to-schema` / `--shadow-database-url` 削除）               |
| Tailwind 4.2    | CSS-first `@theme`、セマンティックトークン必須、default bp + `--breakpoint-3xl: 120rem`、カードグリッドは Container Queries（named `@container/main` 対応）         |
| Better Auth 1.6 | `adminAuth`/`customerAuth` 分離、独自 `ROLE_PERMISSIONS` SSoT、`generateId: "uuid"` 必須                                                                            |
| Zod 4.3         | `.merge()` deprecated（→ `.extend(shape)`）、`.refine()` 後の `.omit()` 不可、`error:` 必須、`z.registry<T>().register(schema, meta)` がメタデータ SSoT（ADR 0018） |
| Lexical 0.43    | NodeState API（`$config` + `createState`）                                                                                                                          |
| nuqs 2.8        | パーサーマップ `@/shared/lib/nuqs`、`useQueryStates({ shallow: false })` で RSC 再レンダリング                                                                      |
| Bun 1.3         | test は per-directory バッチ（`mock.module` 干渉回避）、`packageManager: bun@1.3.12` pinned                                                                         |

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
- **Cloud Run probe endpoint (`/api/live` / `/api/health`) は `proxy.ts` rate-limit 除外必須** — probe は `x-forwarded-for` 未設定で `getClientIp()` が `"unknown"` を返し同一 bucket 合算で 429 → コンテナ kill 連鎖の silent bug。`/api/webhooks` / `/api/cron` と同列で早期リターン。Cloud Run / Dockerfile 変更時は禁止事項 15 項目（`ops/deployment-patterns.md`）を横断チェック
- **管理画面向け preview は第 3 root layout `(preview)/` + 公開 renderer 抽出パターン**（ADR 0020）— Next.js 公式 Draft Mode（公開 URL 流用）は headless CMS 等の用途向け。管理者専用の軽量 preview で公開 layout の分離を維持したい場合は `(preview)/` を新設し、`HomepageSections` / `ManagedPageSections` を `_shared/components/{homepage,pages}/` に抽出して公開 + preview 両用にする。未認証 fallback は `(preview)/error.tsx` で `/admin/login` 誘導。URL 生成は `@/shared/lib/preview-routes` SSoT 経由

### Validation / Domain

- **配列 uniqueness はスキーマ層で契約** — `imageUrls` / `facilities` / `tags` 等は Zod `.refine()` で重複拒否。UI 層の Set dedup 禁止。cross-field 重複は top-level refine（→ `zod-patterns.md`）
- **`<input type="datetime-local">` の Zod は `.datetime({ local: true })` 必須** — strict `.datetime()` は `"YYYY-MM-DDTHH:mm"` を reject（→ `zod-patterns.md`）
- **Mutually exclusive boolean フィールドは 3 層防御** — ① UI `disabled` ② onChange で子 field クリア ③ domain command で `normalizeXxx()` ヘルパー強制正規化（Event `status` ↔ `registrationOpen` 参照）
- **管理ユーザー操作（招待・作成・ロール変更・削除）は階層制御の 2 層防御必須** — UI で `getInvitableRoles(actorRole)` フィルタ + domain command で `canInviteRole()` / `canModifyUser()` による `DomainError("FORBIDDEN")`
- **ドメインコマンドの actor 引数は `{ id: string; role: Role }` オブジェクト** — 単独 `actorUserId: string` 禁止。`executeAdminMutationResult` から `(user) => cmd(input, { id: user.id, role: user.role })` で渡す
- **`executeAdminMutationResult` の監査ログは fire-and-forget 必須** — 実行順序契約は `execute → await afterSuccess → fireAndForget(logAction)` で不変。`await logAction` にすると Prisma 監査書き込み失敗時に `afterSuccess` がスキップされ `updateTag` が呼ばれず公開ページが stale のままになる silent bug。監査はコンプライアンス用の非クリティカル副作用で、mutation 応答を遅延・失敗させない（→ `server-actions/implementation.md` §executeAdminMutationResult 実行順序契約）
- **外部 API 統合は SSoT ヘルパー経由必須** — Resend は `sendEmail()`、Google Calendar は `withGoogleApiRetry()`、Turnstile は `validateTurnstile()`、Cloudflare R2 は `uploadFile()` / `deleteFile()`（`@/shared/lib/r2/*`）。直接 SDK 呼び出しは接続テスト / OAuth 初期化のみ例外（→ `external-api-retry-patterns.md`）
- **GCal outbound sync は attendees 空 + description マーカー + fireAndForget** — サービスアカウント + DWD 未設定では `attendees` populate 不可（Google 公式）。業界標準（Eventbrite/Peatix/connpass/Luma/Meetup 全社）と揃える。description 1 行目に `予約ID:` / `イベントID:` マーカー（`OUTBOUND_*_MARKER`）を埋め込み `isAppGeneratedCalendarEvent` で inbound ループ防止。Server Action の `afterSuccess` で `fireAndForget` 非ブロッキング実行。エラー記録は `markXxxCalendarSyncError` 経由のみ（catch で `logError` 重複禁止）（→ `ical-patterns.md` §GCal Outbound Sync）
- **Turnstile 配置基準** — 未認証公開フォーム必須。認証済みでも予約作成/変更/キャンセル・決済等の高リスク操作は許容。参照系は不要

### UI / UX

- **全 interactive 要素は WCAG 2.5.5 Enhanced (AAA) 準拠 44×44 CSS px 必須** — public/admin Button は全 size で `min-h-11` 以上。checkbox/radio は wrapper で 44px ヒットエリア確保（→ `frontend/accessibility/touch-text.md` §タッチターゲット、`frontend/project-design-config.md` §レスポンシブ設計）
- **カードグリッドは Container Queries、マクロレイアウトは viewport breakpoint** — `@container` + `@md:grid-cols-2 @3xl:grid-cols-3` がカード系 SSoT、`CARD_GRID_COLS_MAP` も container variant 化済。管理画面 dashboard は named container `@container/main` on `MainContent.tsx`（children で `@md/main:` / `@3xl/main:`）（→ `gotchas/ui.md` §公開ページ レスポンシブ標準、`frontend/tailwind-patterns.md` §Container Queries）
- **arbitrary sizing（`max-w-[65ch]` / `[85vh]` 等）は @theme token で参照** — `--hero-min-height(-lg|-xl)` / `--modal-max-height(-lg|-xl)` / `--lightbox-max-*` / `--dropdown-min-width` / `--prose-narrow|medium` / `--container-measure` / `--container-header-max` / `--touch-target-min` が SSoT（public.css / admin.css の `@theme`）。新規 arbitrary 値は 3 回以上使用されたら @theme に昇格。**`<feature>-demo/` 配下は設計探索（variant 比較）のため arbitrary 値を意図的に保持し昇格対象外**（`hero-demo` / `spaces-design-demo` 参照）
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
- **Homepage hero CTA は primary conversion action（予約等）に向ける** — browse navigation（`/spaces` 一覧等）は secondary CTA（`homepage-cta` セクション）に譲る。hero CTA は mobile fold 内に収めて first view の action wall とする
- **画像 overlay text は 12px 以上（WCAG a11y）** — label/caption に `text-[0.55rem]` (8.8px) 禁止。editorial でも mobile 最小 `text-[0.75rem]` (12px)、photo credit のみ `text-[0.625rem]` (10px) まで許容。画像上テキストは 3 層防御（scrim + paint-order stroke + text-shadow）必須（→ `frontend/accessibility/images-text.md` §画像上テキストの 3 層可読性保証）
- **画像に text overlay する responsive hero は grid cell overlap パターン** — モバイル `col-start-1 row-start-1` + z-index で overlay、desktop で `md:col-start-2` に分離。単一 h1 / DOM 重複なしで SEO 整合（→ `tailwind-patterns.md` §同 Grid cell overlap）
- **Tailwind v4 responsive reset が必要な値は inline style 不可** — `style={{ WebkitTextStroke: "..." }}` は specificity で `md:[-webkit-text-stroke:0]` を上書きする silent bug。arbitrary class `[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]` + `md:[-webkit-text-stroke:0px_transparent]` を使う（→ `tailwind-patterns.md` §インラインスタイル vs Tailwind arbitrary properties）
- **mypage の「お名前未登録」警告は `IncompleteProfileNotice` 経由必須** — page 個別実装禁止、layout 集約 SSoT（`mypage/_components/incomplete-profile-notice.tsx`）
- **mypage の `loading.tsx` は `MypageSkeleton` (variant: list/detail/form) 必須** — 単一 spinner placeholder 禁止（layout shift + dead UX 解消、`aria-busy` + `aria-live="polite"` 内蔵）
- **`PublishSwitch` 呼び出しに `resourceLabel: string` 必須** — Switch まで `aria-label` forwarding（SR で resource context 通知、視覚 label span は `aria-hidden`）
- **mypage edit page の `redirect()` は `?reason=` 付与必須** — `status|deadline|discount` 等で detail page に理由バナー表示（dead-end 防止、`reservations/[id]/edit/page.tsx` 参照実装）
- **公開フォーム送信成功画面に next-step CTA 必須** — 「他を見る」「ホームに戻る」等で dead-end 解消（contact / event registration / reservation form 全成功画面、`role="status" aria-live="polite"` 併設）
- **公開ページ `text-[10px]` 禁止** — `text-xs` (12px) 以上、画像 overlay photo credit のみ `[0.625rem]` (10px) 例外（WCAG a11y、→ `frontend/accessibility/touch-text.md` §フォントサイズ最小値）
- **公開 uppercase ラベル tracking は `[0.18em]` 標準** — `[0.1em]/[0.14em]/[0.4em]` 等の中間値禁止、heading 微調整 `[0.01em]/[0.02em]` のみ例外（→ `frontend/accessibility/touch-text.md` §Uppercase ラベル tracking 標準値）
- **HERO 高さの arbitrary svh 禁止** — `min-h-[var(--hero-min-height-sm|--hero-min-height|--hero-min-height-lg)]` token 参照必須（`HERO_PARALLAX_HEIGHT_MAP` / `StandardHeroSection.HEIGHT_MAP` / `CompactHero` 全て移行済）
- **admin table の `<input type="checkbox">` 直書き禁止** — `CheckboxCell` (`@/admin/components/table`) 経由で 44px ヒットエリア確保（ADR 0022）。行 checkbox の `aria-label` は entity の意味ある識別子（タイトル / 日時+スペース名）を使用、`id.slice(0, 8)` 等の技術的識別子禁止
- **自前 LightboxOverlay 復活禁止** — `ImageGallery` / `GallerySection` の lightbox は Radix Dialog (`Dialog.Root` + `Dialog.Title` + `Dialog.Close`) 採用、focus trap / Escape / focus 復帰 / body scroll lock を Radix 標準に委譲。手動 `useEffect` body lock + `useRef` Tab handling 復活禁止
- **`*_GRID_COLS_MAP` は全て Container Queries variants** — `GRID_COLS_MAP` / `CARD_GRID_COLS_MAP` / `GALLERY_GRID_COLS_MAP` は `@md:`/`@3xl:` で統一済、viewport breakpoint (`md:`/`lg:`) 復活禁止。consumer は親に `@container` 必須

---

## プロセスルール

### 検証

- **作業中** `bun run type-check`、**完了前** `bun run validate`、**コミット前** `bun run validate && bun run build`
- **依存パッチ/マイナー更新後は `bun run validate` 必須** — eslint-plugin-react-hooks 7.0.1 → 7.1.1 のようなパッチで新 lint ルール（`set-state-in-effect` / `immutability` / `refs` / `purity` 等）が追加され実質破壊的変更になる。新ルール由来のエラーは eslint-disable ではなく公式推奨パターン（"Adjusting State Directly During Render" / `useSyncExternalStore` / render 中 derive）への書き換えで解消する
- **テスト実行ポリシー（ADR 0014）** — 毎回のコミット前・完了前に **全テストを走らせる必要はない**。責務分担:
  - ローカル（開発中）: 関連する 1〜数ファイルのみ `bun test <path/to/file.test.ts>` で回す。TDD 時は `bun test --watch <path/to/file.test.ts>` を単一ファイル指定で使う（親ディレクトリ指定は ADR 0010 違反）。fail fast が欲しければ `bun test --bail=1 <path>`、名前フィルターは `--test-name-pattern <pat>`
  - lefthook `pre-push`: `type-check` + `architecture-boundaries.test.ts` を自動実行（`lefthook.yml`）
  - CI (`.github/workflows/ci.yml`): `bun run test:unit && bun run test:integration` + E2E を毎 push/PR で実行
  - フル実行を手で確認したい場合のみ `bun run test:all`。日常の作業では不要
- **`test:unit` / `test:integration` は per-directory バッチ**（`package.json` 参照）— `bun test __tests__/unit` / `bun test --coverage <dir>` への簡略化禁止（`mock.module` 干渉で偽陽性）。CI の `.github/workflows/ci.yml` も同一制約（→ ADR 0010）
- **Coverage は参考値のみ** — `bunfig.toml` の coverage 設定は撤去済（ADR 0014）。必要時は `bun test --coverage <single-file>` で単発実行し参考値として扱う。CI には coverage ゲートを置かない
- **大規模監査の前提** — `bun run validate` が exit 0 なら compiler/linter 基準ではクリーン。監査で大量違反報告時はまず validate を ground truth に
- **Pre-existing test failure の切り分け** — `git stash -u && bun test <file> && git stash pop` で HEAD 時点の fail 数と比較
- **Bun test `mock<() => ...>` は引数を捨てる silent bug** — 引数なし `mock<() => Promise<T>>` 型は `toHaveBeenCalledWith({ ... })` 検証で常に空配列マッチして false-positive pass する（型推論で記録される args 型が `[]`）。**実 args を検証する場合は `mock<(args: T) => Promise<...>>` 型必須**。Plan の test スタブを書く際にこれを優先（実例: P18 Bundle A で reviewer が指摘 → mockCreate 型を `(args) =>` 化して args 検証が機能、`bun-patterns.md` への追記候補）

### 調査・監査

- **「公式推奨」主張前**: `mcp__context7__query-docs` で一次資料確認（Radix / RHF / Next.js / React / Prisma / Zod）
- **「公式準拠」「クリーン実装」「ベストプラクティス」指示時は context7 verification 必須** — agent dispatch 前に Next.js / React / Prisma / Zod / Better Auth / Lexical / **WAI-ARIA APG（`/w3c/aria-practices`）** の該当バージョン docs を `mcp__context7__query-docs` で取得し、プロジェクトルール（`.claude/rules/**`）との乖離をチェック。プロジェクト独自厳格化（公式より厳しい）は ADR 扱いで保持
- **a11y 実装は ARIA First Rule（"native HTML > ARIA role"）を最優先で適用** — `role="button"` + 自前キーボードハンドラ（Enter=keydown / Space=keyup）は 2nd-best。native `<button>` を absolute overlay + `pointer-events-none/auto` で組み替えられないか先検討（gotchas/ui.md §button ネスト禁止 / frontend/accessibility/semantics.md §クリッカブルカード — Block Link / Card Overlay パターン）。2nd-best 実装を提案する前に必ず第一推奨の適用可否を検証
- **a11y 実装前に UX state の実使用を grep で確認** — `selectedId` / `isSelected` 等の state が外部 consumer と連動しない「視覚ハイライト専用」なら dead state として削除候補。dead state に `aria-pressed` / キーボードハンドラ / focus ring を付けるのは over-engineering（`media/_components/MediaGrid.tsx` の `selectedId` 削除が参照事例）
- **context7 に無い Playground / reference implementation は `gh api` で一次ソース直接参照** — Lexical の `FloatingTextFormatToolbarPlugin` / `setFloatingElemPosition` / `DraggableBlockPlugin_EXPERIMENTAL` 等は `@lexical/react` の公開 API ではなく Playground 固有の参考実装のため context7（`/facebook/lexical` / `/websites/lexical_dev` 両方）にヒットしない。`gh api repos/facebook/lexical/contents/packages/lexical-playground/...` で裏取り。この場合の主張粒度は「公式 API ドキュメント準拠」ではなく **「reference implementation 準拠」** と明記（overstate 回避）
- **Radix primitives の具体例**: context7 取得不可 → `WebFetch` で `https://www.radix-ui.com/primitives/docs/components/<name>`
- **Claude Code 自体の公式仕様（hooks/skills/sub-agents/settings/permissions）は `code.claude.com/docs/en/<topic>` を WebFetch で取得** — context7 はサードパーティライブラリ用で Claude Code 本体は未収録。Agent SDK は別ルート（`docs.anthropic.com` 配下）
- **`mcp__context7__query-docs` の引数は `query`（`topic` / `question` は誤り）** — `{ libraryId, query, tokens }` の 3 引数。誤引数は `InputValidationError: Invalid input: expected string, received undefined` で即失敗。旧 MCP API を記憶ベースで呼ばない
- **一括修正後**: Grep で違反パターン残存ゼロ確認してから完了報告
- **精査系 subagent の「使用なし」「欠落」報告は実装 Read + grep で二段検証必須** — grep ベース調査は seed 関数内の間接使用を見落として false positive を出す
- **Explore / 監査 subagent の数値・採用範囲リストは grep で再検証必須** — `breakpoint 使用箇所数` / `@container 採用ファイル数` / `arbitrary 値の件数` 等は rule docs の記述を根拠に hallucinate することあり（このセッションで `xl:` 22→実際 18、`@container` 採用 5→実際 3 の drift を検出）。修正計画に組み込む前に `grep -rE "\bxl:" src/ --include="*.tsx" -c | awk -F: '{s+=$2} END{print s}'` 等で ground truth を取る
- **Plan 作成時の rule docs 構造仮定は事前 grep 必須** — 「`gotchas.md` の noindex テーブル」「`<rule>.md` の §X セクション」等の構造を仮定して plan の Task に書く前に、`grep -nE '^##|^\|' .claude/rules/<file>.md` でテーブル形式 / paragraph 形式 / セクション存在を実体確認。仮定が外れると implementer DEVIATION → controller 補完 commit という余計な commit が発生する（実例: P15 Task 6.2 で gotchas.md は paragraph 形式だったがテーブル前提で書いたため追加 commit `a9e28ad8` が発生）
- **Plan 記載の destination URL / API path / route は `ls` で物理実在確認必須** — 既存 ActionCell の href 文字列を grep で抽出して plan に書いた destination URL が、実は対応する route file（`<resource>/[id]/edit/page.tsx` 等）を持たず 404 になる pre-existing バグ事例あり（P18 plan 検証中に Bundle C reviewer が PostTable `/admin/posts/[id]/edit` で発見、commit `d638b45f` で 3 ファイル一括 fix）。grep で href 文字列が見つかった = route が動作している、ではない。Plan 段階で `ls 'src/app/(admin)/admin/(dashboard)/<resource>/[id]/'` で sub-route 実在を直接確認する
- **新機能の表記・命名は類似既存機能と grep で揃えてから plan に書く** — P18 で「複製名 `(コピー)`（半角）」を plan に書いたが、Event 既存実装は `（コピー）`（全角）。reviewer 指摘 → fix commit `d2dc2e7e` が発生。新規 plan のコード例（命名規則 / 表記 / 接尾辞）は `grep -rn "<related-keyword>" src/shared/domain/<sibling>/` で類似実装と比較してから書く
- **レビューエージェント指摘**: `gotchas.md` と照合して誤報除外（`revalidateTag` 第2引数、JSX IIFE 算術式偽陽性、`select.tsx` required 等）。`bun run lint` exit 状態 + Read を ground truth とする
- **監査エージェント指摘**: 該当 rule ファイル（`react-patterns.md` / `lexical-patterns.md` / `type-safety.md` 等）の「例外」節とクロスリファレンス
- **SSoT 重複検出の grep**: symbol 名だけでなく **literal 文字列**（`"スーパー管理者"` 等）でも再 grep
- **ESLint `no-restricted-syntax` selector は静的+動的両対応** — `> ArrayExpression` は literal `[a, b]` のみ、`items.map(...)` 等の動的配列を見逃す。禁止パターン追加時は `CallExpression[callee.property.name='map']` 経路も `selector` に含める（`$transaction` rule が実例）
- **Plan `完了` ステータスでも実装存在とは限らない** — 大規模リデザイン・命名規約変更で機能が削除／置換されることあり。plan 参照時は `Glob` で実在確認 + `Grep` で代表 symbol + `git log --oneline -- <path>`
- **bundle「未使用チャンク」報告は `react-loadable-manifest.json` で lazy-load 確認必須** — `.next/server/app/*.html` 埋め込み scan だけでは `next/dynamic` 経由の lazy chunk を「未使用」と誤認する false positive。Lexical / Recharts / Radix 等の 200KB+ チャンクは大抵 lazy-load 正当化済みのため、削除判定前に manifest で参照元ルート数を確認
- **`<library> X.Y` 形式の version 表記は `package.json` (SSoT) と drift しやすい** — `bun update` で minor/major bump が起きた後は `grep -rn '<lib> [0-9]\+\.[0-9]\+' .claude/ CLAUDE.md src/` で参照箇所を一括更新。本プロジェクトでは `Prisma 7.7` が 6 箇所散在し commit `ef87f8ac` で 7.8 に統一。doc 内の minor version は世代固有の注意点（API/CLI 変更）を表すが、CLAUDE.md 冒頭注釈どおり実バージョンは `package.json` + `bun.lock` が正
- **Edit tool は old_string / new_string 内の `\u00XX` literal escape を実 Unicode 文字に normalize する** — JSON parsing 段階で `\u00A5` → `¥` 等に変換されるため、両方を含む edit は「No changes to make」エラーになる。literal escape sequence を保持したまま書き出す必要がある場合は Python script (`chr(92) + 'u00A5'`) で迂回する（実例: C1 Phase 7 で `gotchas/deployment.md` の Turbopack ¥ JSX gotcha 復元時）
- **大規模 rule docs (>500 行) は barrel-index pattern で分割** — barrel `<topic>.md` が `paths:` frontmatter + sub-file links のみ持ち、実体は `<topic>/<subtopic>.md` に配置。autoload chain で sub-file も連鎖ロード。適用済み: `react-patterns.md` / `frontend/gsap-patterns.md` / `frontend/lexical-patterns.md` / `frontend/admin-ui-patterns.md` (hybrid) / `server-actions.md` / `frontend/accessibility.md` / `gotchas.md`。新規 rule docs が 500 行を超えそうなら sub-file 設計を先行検討

### Git / Migration

- **Worktree 作成前**: `git status --short | wc -l` + `ls prisma/migrations/ | tail -1` で未コミット migration 確認、ドリフトあれば先に WIP commit（→ `gotchas.md`）
- **Prisma 7.8 CLI フラグ変更**: `migrate diff --to-schema-datamodel` → `--to-schema`、`--shadow-database-url` 削除、`db execute --schema` 削除。非対話 destructive migration は「schema 編集 → `mkdir prisma/migrations/<ts>_<name>` → `migration.sql` 手書き → `db execute --file` → `migrate resolve --applied`」順（→ `gotchas.md`）
- **schema.prisma commit 後は `prisma/migrations/` 側も同時 commit 必須** — schema のみ commit は `prisma migrate deploy` が CI/prod で fail する silent drift
- **destructive migration 適用後は dev server を該当 worktree から再起動必須** — 共有 dev DB のため、他の worktree / main から起動中の dev server は古い code + 新 schema で `PrismaClientKnownRequestError: The column ... does not exist` → 公開ページ白画面の silent bug（→ `gotchas/deployment.md` §Worktree §共有 dev DB + 異 worktree dev server）
- **テストファイルは top-level `__tests__/` のみ** — `src/**/__tests__/` 配置禁止（`tsconfig.test.json` include 範囲外）（→ `test-quality.md`）
- **ADR 新規作成前に `ls docs/architecture/decisions/ | grep "^00"` で既存番号確認** — 連番重複採番を防ぐ。本セッションで 0011 衝突が発生（`0011-dual-better-auth-instance.md` 既存を見落として重複作成 → 0014 に変更）
- **`package.json` scripts 削除・リネーム時は横断 grep 必須** — `AGENTS.md` / `CONTRIBUTING.md` / `cloudbuild.yaml` / `.github/workflows/*.yml` / `.claude/{rules,agents,skills}/**` / `docs/guides/**` / `bunfig.toml` / `.vscode/launch.json` に旧 script 名が残らないか確認（ADR 0014 で実例化）
- **ADR 制約と設定ファイルの整合を grep で周期検証** — `bunfig.toml` / `playwright.config.ts` / `.gitignore` 等が ADR 制約と乖離した dead code になっていないか（本セッション: `coverageThreshold` が ADR 0010 採択後も残存していた → ADR 0014 で撤去）
- **`bun.lock` 単独コミット禁止** — `scripts/check-protected-files.sh` が拒否（依存更新は `package.json` と同時 stage 必須）。大きな改修バンドル内に誤混入した lockfile 差分は `git restore --staged --worktree bun.lock` で HEAD に戻して分離
- **単一 worktree に複数改修が混入したら Conventional Commits type で分離** — `feat:` / `refactor:` / `fix:` / `docs:` を個別 commit に。lefthook `commit-msg` hook が type を強制するため、scope 汚染のまま 1 commit で push すると review / revert 粒度が崩れる。`git add <subset>` → commit の反復で分離
- **`.serena/memories/` は部分 tracked / 部分 ignored 状態** — `.gitignore` 全体無視ルールに対し、過去 commit 済みファイル（`suggested_commands.md` / `test-quality-analysis.md` 等）は tracked のまま残存。これらを update 後の `git add` は `paths are ignored` エラーで失敗するため `git add -f <path>` 必須。新規 memory file は ignore されるので commit したい場合のみ `-f` を使う（実例: C1 Phase 3 で ADR drift 解消 commit 時に発生）

### 実装パターン

- **Prisma enum 新規追加は 8 箇所同時更新**: ① schema + migration ② `enums/prisma-types` re-export ③ `enums/guards` 型ガード ④ `enums/helpers` ラベル + parseFilter ⑤ validation スキーマ ⑥ domain types + queries + commands ⑦ Server Actions + 公開フォーム ⑧ 管理 UI + seed + テスト。①〜③は 1 implementer にバンドル。**enum がテンプレート/UI Meta を持つ場合は +3 箇所**: 例 `TermsType` は `TERMS_TYPES` 配列（`validations/terms.ts`）+ `TERMS_TYPE_META`（管理 Dialog のアイコン）+ `TERMS_TEMPLATES` Record（`terms-templates.ts`）。参照実装: `prisma/migrations/20260421022747_add_review_guidelines_and_cookie_policy_terms_types/`
- **新規 Prisma モデル追加は `schema + seed + admin-ui` の 3 点セット同時作成必須** — seed 漏れは EmptyState で実装検証不可。enum フィールドは**全値を seed に網羅**
- **Seed 関数は `upsert` で idempotent 化 + `seedAll` / `seedDemo` 両方に登録** — `deleteMany + create` は `--demo` で既存破壊（`seedEmailTemplates` 参照）
- **Terms / News / Post / Section / Space の seed は Lexical JSON 同時保存必須** — `contentHtml` 単独禁止。`buildParagraphEditorStateJson()` + `buildParagraphHtml()`（`@/shared/lib/lexical/description-defaults.ts`）
- **公開一覧ページ新設の 10 点セット**: ① `page.tsx` + `loading.tsx` + `error.tsx` ② `generatePageMetadata(slug)` + `BreadcrumbJsonLd` ③ `getPageSectionsWithFallback(slug)` ④ trailing sections から同種 + `cta` 除外 ⑤ `default-page-sections.ts` + `SYSTEM_PAGES` ⑥ seed Page レコード ⑦ sitemap.ts ⑧ NavigationItem seed ⑨ E2E fixtures urls ⑩ layout.tsx `alternates`（該当時）
- **「推奨で」「クリーン実装」指示時の変換セット** — ① nuqs `parseAsString.withDefault` → `parseAsStringLiteral(values)` + `isValid*` 型ガード ② 複合 `sort` → `sortBy` + `sortOrder` + `SortableColumnHeader` ③ 手動 debounce → `useDebouncedCallback`（`@/admin/hooks`）④ Select `onValueChange` `as` → `isValid*` narrow ⑤ 同系統テーブルと Grep 比較
- **Reader 関数を `"use server"` で export しない — Route Handler `route.ts` が公式推奨**（Next.js 16 [backend-for-frontend](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/backend-for-frontend.mdx) ガイド）。canonical: `checkAdminAuth` (401) / `checkPermission` (403, `request.headers` を第 3 引数で渡す) + `NextResponse.json` + `AbortSignal.timeout` + zod `safeParse` + `jsonError` / `jsonValidationError`。参照実装: `src/app/(admin)/admin/api/{ogp,notifications/unread-count}/route.ts`（ADR 0019）
- **UX スケール判断は seed 件数ではなく CMS 運用上限で** — Location / Category / Tag 等運用者が追加できるリソースは production 想定値（数十〜100）で設計。フィルタ UI 閾値目安: pill 2〜5 / scroll 6〜15 / dropdown 16+
- **Feature toggle 粒度** — 単一 tenant は per-entity 単一層、multi-tenant template は `Settings.xxxEnabledGlobal` + `Entity.xxxEnabled` の 2 層（precedence 一方向: Global OFF → 常に非表示 / Global ON → per-entity 効く）。参照: `Settings.reviewsEnabledGlobal` ↔ `Space.reviewsEnabled`
- **Lexical 新規ノードで作成時バリアント選択 UI が必要な場合** — dialog-upfront 3 コマンド体制（`OPEN_XXX_DIALOG_COMMAND` / `INSERT_XXX_COMMAND` / `UNGROUP|TRANSFORM_XXX_COMMAND`）。全 UI 経路（Insert / FT / ⋮⋮ / keyboard）は dispatch 前に `$getSelectionBlockNodes()` のキーをスナップショットして payload に積む（ダイアログフォーカスで editor 選択が失われるため必須）。hardcoded default 値の silent 挿入禁止。参照実装: `GroupPlugin`（→ `frontend/lexical-patterns.md` §グループ化）
- **UI デザイン探索は `src/app/(public)/<feature>-demo/` で複数バリアント比較** — `hero-demo/` / `spaces-design-demo/` が参照実装。上部 sticky nav で variant 切替 + `max-w-[420px]` wrapper で desktop でも mobile preview 可能。`shared.ts` に variant metadata（name / tagline / description / pros / cons）を SSoT 化。決定後も reference として保持（削除しない）
- **管理画面 table 行クリック遷移は `ClickableTableRow`（`@/admin/components/table`）+ `stopRowClick` 経由必須** — `<tr>` への `position: relative` は CSS 仕様 undefined behavior、複数 `<td>` を単一 `<a>` で包むのが HTML 仕様禁止のため Card Overlay 第一推奨は table row に適用不可。第二推奨（`tabIndex={0}` + `onKeyDown(Enter)` + `aria-label`）を `ClickableTableRow` に集約済。internal interactive 要素（CheckboxCell / StatusSelect / ActionDropdown / mailto link）を含む `<TableCell>` には `onClick={stopRowClick}` 付与（→ `frontend/admin-ui/tables.md` §テーブル行クリック遷移パターン）
- **Next.js 16 typedRoutes + `router.push(template literal)` の library boundary cast** — `typedRoutes: true` 環境では `${string}` template literal を `Route<string>` 型に narrow できない（公式制約）。helper component（`ClickableTableRow` 等）で href を受ける場合は **公開 API は `string`、内部の `router.push` 呼び出しで `as Route<string>` cast を 1 箇所に閉じ込める**。consumer 側では cast 不要。`type-safety.md` の `as` 例外条項（DOM event target / Prisma JSON 等）と同等の library boundary 扱い

### Subagent 規律

- **implementer は sonnet 以上**（haiku 禁止、report 捏造リスク）
- **完了報告後は独立検証**: `git log --oneline` + `git show --stat HEAD`
- **SSoT ヘルパー（`executeAdminMutationResult` / `fireAndForget` / `safeFetch` / `sendEmail` 等）の改修は ADR / rule ファイルで実行順序・契約を事前確認必須** — 別 AI / implementer が「クリーンに直す」指示で契約を壊す事故あり（例: `await logAction` 化 → cache invalidation スキップ regression、ADR 0019）。これらヘルパーを編集する dispatch prompt には「該当 ADR / rule を Read してから変更」「契約破りを疑ったら justified deviation として報告」を明記
- **review agent の「欠落」「型不整合」報告は Read + Glob で実在確認** — project-reviewer は `Serialized<T>` 型システムを未把握で Date→string を warning 化、route-structure-reviewer は Glob Windows パス変換で実在 loading.tsx を「欠落」扱いする false positive 傾向あり。report ベースで修正着手せず、対象ファイルを直接 Read して現状確認
- **reviewer は MINGW64 `()` 含みパス Glob で誤検出する** — cache-strategy-reviewer 等が `src/shared/lib/constants/` 実在を「不在」と報告し「キャッシュ実装なし」と結論する false positive。受領後は `ls src/shared/lib/constants/` + `grep -rln "updateTag\|revalidateTag\|'use cache'" src/` で独立検証してから判断
- **密結合タスクは 1 implementer にバンドル**
- **Sequential-commit plan も 1 implementer に bundle 推奨** — 「N Task それぞれが独立 commit を要求する」plan は 1 dispatch + 「各 Task で commit + commit message は plan 指定文字列をそのまま使用」指示で context 効率最大化。Task 間 setup overhead 排除 + 中間 type-check broken でも plan 範囲が短いため許容できる。controller は完了後 `git log --oneline -N` + `git show --stat` で commit SHA / 行数を独立検証（実例: P15 admin auth route relocation で 7 commit を 1 dispatch 完了）
- **implementer dispatch の git 禁止は `add`/`commit`/`push` だけでなく `reset`/`checkout`/`restore`/`stash` も全面禁止明記必須** — 並列 implementer で一方の `git reset` / `git restore` が他方の成果や controller の直前編集を silent revert する事故が実発生（2026-04-22 セッションで 4 agent 並列中に controller quick fixes 5 件 + 他 agent の main file 変更が HEAD@{0} `reset: moving to HEAD` で消失）。prompt に 🚫 `git add / commit / push / reset / checkout / restore / stash` を明記。staging は controller 側で実行し implementer は編集のみ
- **parallel implementer 完了後は 3 段検証** — ① `git status --short`（modifications + untracked 列挙、`[post-subagent] git snapshot` hook の出力は truncate されうるため authoritative でなく `git status` 直接実行が ground truth）② `wc -l` で対象ファイルの行数 delta 確認（agent 報告の行数と照合）③ `grep` で期待 symbol 存在 + 削除 symbol 不在を確認。`system-reminder` の「X was modified by linter」も edit 時点 snapshot が表示されるケースがあり stale しうるため、現状は必ず `grep` / `Read` で直接確認
- **dispatch プロンプトに「plan 記載 identifier と実装が乖離していれば justified deviation として保持し報告」を明記** — plan に合わせた強制 rename 禁止
- **plan 実行前の前提実在確認** — plan に「既存テスト XXX に mock 追加」「既存ファイル YYY を修正」と記載されていても、実行前に `ls <path>` / `Glob` で **実在確認必須**。実在しない場合は Bundle スコープを「pure function 抽出 + 新規 unit test」「小機能追加」等に変換する判断を controller が行う（implementer を BLOCKED にせず scope を柔軟に変換）
- **並列 reviewer dispatch 前に `.claude/rules/**` 準拠度を grep で先行確認** — rule で既に厳格化済みのパターン（`revalidateTag\(.\*,`/`useCallback\(`/`gsap.matchMedia` 等）は 1 回の grep で violations ゼロを判定できる。多数の reviewer を並列起動するより、grep hits を元に必要 reviewer を絞る方が token コスト + context 圧迫を削減
- **long-running general-purpose agent（tool_uses 40+ / duration 300s+）の最終報告が途切れたら git で独立検証** — SendMessage で再取得を待つより `git status --short` + `git diff --stat HEAD` + 対象ファイル個別 diff の方が速く正確。subagent の「実装完了」報告が HEAD と収束して staged diff ゼロのケースも検出できる
- **implementer dispatch prompt に「JSDoc / コメントに "Phase X.Y" / "refactor from Y" / "後継 UI" 等のタスク・フロー参照を含めない」を明示** — デフォルトで混入しがち。CLAUDE.md の general rule「Don't reference the current task, fix, or callers」と衝突し commit 前の grep + cleanup が発生する（2026-04-22 Phase B.5-2 で 4 ファイル × 7 箇所の cleanup 事例）
- **subagent frontmatter `memory: project` は実利用がある場合のみ付ける** — 公式仕様で Read/Write/Edit ツールが暗黙有効化 + MEMORY.md (200行/25KB) が system prompt に注入される。本文で MEMORY 参照を持つ設計か `.claude/agent-memory/<name>/` に dir があるかで判定。未使用で付けると context 浪費 + 最小権限原則違反（2026-04-23 監査で 10 agent 削除）
- **小規模 Bundle（1-4 task / 4-5 commit）は combined reviewer（spec + quality 1 dispatch）を推奨** — Bundle A/B/C 全てに spec / quality 個別 reviewer を厳格適用すると 1 plan で 6+ reviewer dispatch になり context 圧迫。P18 で 2 Bundle / 1 combined review に絞り P17（3 Bundle / 3 spec + 3 quality review）より context 残量を 30%+ 確保した実績。combined prompt は spec compliance check と code quality check の両 section を 1 prompt 内に同居させ、JSON で `spec_compliance.verdict` / `code_quality.verdict` / `overall_verdict` の 3 値を返させる

---

## ワークフロー

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

- **計画作成**: `brainstorming` → `writing-plans`（specs: `docs/superpowers/specs/`、plans: `docs/superpowers/plans/`）。意図明確時は Q&A スキップ可
- **計画実行**: `subagent-driven-development`（推奨）または `executing-plans`
- **完了時**: `verification-before-completion` → `finishing-a-development-branch`
- **セッション継続時**: `docs/plans/README.md` 確認
- **セッション跨ぎ大規模 plan は handoff memory 必須** — `~/.claude/projects/<slug>/memory/project_<phase>-handoff.md`（type=project）に ①plan 場所 ②worktree 場所 ③commit SHA ④残 chunk 分割 ⑤次セッション起動コマンドの 5 点セット + `MEMORY.md` に一行 index。context 枯渇で中断判断した phase（例: Section Architecture Phase B.4）で canonical。**複数 plan を順次実行する場合**は plan 毎に「スコープ + 着手前の前提 + 起動コマンド例」を分けて記載（実例: `project_p17-19-sequential-handoff.md`）— plan が独立 context（rule auto-load 範囲が異なる）のため 1 セッション 1 plan の規律を自動付与できる
- **大規模 plan / handoff memory 作成前は `~/.claude/projects/<slug>/memory/MEMORY.md` を `Read` で再読込必須** — session-start に system prompt 経由で読み込まれる MEMORY.md は他の並列セッションが追記すると stale 化する（実例: 本セッション中に originSessionId `ab327602` が `project_clean-break-refactor-handoff.md` を追加 → 私が同スコープの bundled plan を新規作成 → duplicate detected → commit `29a541c9` で撤回）。新規 handoff を書く前に `Read MEMORY.md` で同スコープの既存 handoff の有無を確認し、あれば既存 handoff の規律（C1-C4 separate plans / 1-plan-per-session 等）を尊重して plan 構造を設計する

---

## SSOT 定数・シングルトン（主要）

| 定数/変数                                         | 場所                                              | メモ                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adminAuth` / `customerAuth`                      | `@/shared/lib/{admin,customer}-auth`              | cookie prefix 分離、customer は Google/LINE（`/api/customer-auth`）                                                                                                                                                 |
| `DASHBOARD_ROLES` / RBAC helpers                  | `@/shared/lib/admin-roles`                        | client-safe Role + `getInvitableRoles()` / `canInviteRole()` / `canModifyUser()`                                                                                                                                    |
| `prisma` / `basePrisma` / Prisma enums            | `@/shared/db/prisma` / `enums/prisma-types`       | `basePrisma` は Better Auth アダプター専用。Prisma enum は gateway 経由（runtime sentinel は `@generated/prisma/client` 直 import）                                                                                 |
| `CACHE_TAGS` / `CACHE_LIFE` / `invalidate*Caches` | `@/shared/lib/constants` / `@/shared/lib/cache/*` | mutation 後の無効化 SSoT（ローカル `updateTag` 羅列禁止）。`CACHE_LIFE.MAX` は stale-while-revalidate 用（cron / webhook）。顧客統計連動の mutation command は customerId を戻り値に含める契約（helper cascade 用） |
| `*_STATUS_LABELS` / `PUBLISH_LABELS`              | `enums/helpers`                                   | 全ステータス enum + publish ラベル、UI ハードコード禁止                                                                                                                                                             |
| レスポンシブ @theme tokens                        | `(public\|admin)/_styles/*.css`                   | `--breakpoint-3xl` / `--header-height` / `--hero-min-height` 等。arbitrary 値 3 回以上で token 昇格                                                                                                                 |

**完全な一覧は `.claude/rules/ssot-singletons.md`**（src/prisma 編集時に自動ロード）。auth / DB / キャッシュ / 外部連携（Calendar/Storage）/ ドメイン / Lexical / 公開 UI / @theme token のカテゴリ別に整理。

---

## 自動ロード

- **Rules**: `.claude/rules/**/*.md` — `paths:` フロントマターで条件付き自動ロード。最重要は `gotchas.md`
- **Skills**: `.claude/skills/<name>/SKILL.md` に frontmatter（`description` 必須）+ 手順本体（500 行未満推奨）。詳細は `reference/*.md` / `data/*` に分割
- **Subagents**: `.claude/agents/<name>.md` — frontmatter `name` / `description` / `tools:`（最小権限）/ `model: sonnet` / `memory: project`
- **Memory**: `~/.claude/projects/<slug>/memory/MEMORY.md` がセッション開始時に自動ロード
- **Serena memories**: `.serena/memories/**/*.md` が Serena MCP セッション開始時に自動ロード — 大規模マイグレーション・機能削除後は現状参照系（`project_overview.md` / `architecture-analysis.md` / `architecture/*.md`）を同期更新必須。stale 情報は次セッションで誤情報として注入される silent bug（実例: Supabase→R2 移行後に `project_overview.md` の `PostgreSQL (Supabase)` が残存）
- **research/analysis または完了済み project handoff の memory は冒頭に `> **Snapshot: YYYY-MM-DD**` を入れる** — `/memory-staleness-audit` skill で自動履歴扱いされる。clean-break refactor 完了 memory（「廃止済みパターン」「削除済みファイル」等の意図的履歴参照を含む）も対象。ADR で supersede された場合は併せて `> **Superseded: YYYY-MM-DD** — ADR XXXX で置換` を追記。filename に `YYYY-MM-DD` を含む場合も同等

包括的監査が必要な場合は、該当 subagent を並列起動（Agent ツール経由で description 参照）。

## 公式 API / ベストプラクティス準拠の原則

「公式推奨」「クリーン実装」「後方互換なし」指示時は以下を厳守:

1. `mcp__context7__query-docs` で該当バージョンの一次資料を取得（Next.js / React / Tailwind / WCAG / Radix / Better Auth / Prisma / Zod / Lexical 等）
2. プロジェクトルール（`.claude/rules/**`）と公式推奨の**差分を ADR 扱いで保持**（プロジェクト独自厳格化は正当化・記録）
3. 数値・採用範囲リストは必ず grep ground truth 検証（subagent の hallucination 防止、上記「調査・監査」節参照）
4. `@theme` / SSoT / ルール docs の整合を**同一コミット**で保つ（rule 更新と実装変更を同期して drift を防止）
5. 破壊的変更が発生する改修は phase 単位で 1 commit 完結（ロールバック容易化）、`docs/superpowers/plans/YYYY-MM-DD-<name>.md` に記録
6. **Claude Code hooks は公式仕様（`code.claude.com/docs/en/hooks`）に準拠** — `PostToolUse` / `SubagentStop` の stdout は Claude context に届かないため `hookSpecificOutput.additionalContext` JSON 必須。`Stop` + `asyncRewake: true` は `stop_hook_active` guard 必須（無限ループ防止）。`async` / `asyncRewake` / `if` フィールド採用。詳細・手動テスト手順は `.claude/rules/ops/hooks-patterns.md`（path-scoped autoload）
