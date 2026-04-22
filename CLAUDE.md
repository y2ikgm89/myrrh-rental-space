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

| 技術            | 注意点                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16.2    | `'use cache'` + `updateTag`（Server Actions）/ `revalidateTag`（2引数）。Suspense 内 async SC は `await connection()`                                       |
| React 19.2      | Compiler 1.0 自動メモ化。`useCallback`/`useMemo`/`memo` 禁止（例外→`react-patterns.md`）                                                                    |
| TypeScript 6.0  | `erasableSyntaxOnly`（enum 禁止）、`verbatimModuleSyntax`                                                                                                   |
| Prisma 7.7      | `createAppPrismaClient` で `$extends` 集約、enum は `@generated/prisma/*`。CLI flag 変更（`migrate diff --to-schema` / `--shadow-database-url` 削除）       |
| Tailwind 4.2    | CSS-first `@theme`、セマンティックトークン必須、default bp + `--breakpoint-3xl: 120rem`、カードグリッドは Container Queries（named `@container/main` 対応） |
| Better Auth 1.6 | `adminAuth`/`customerAuth` 分離、独自 `ROLE_PERMISSIONS` SSoT、`generateId: "uuid"` 必須                                                                    |
| Zod 4.3         | `.merge()` deprecated（→ `.extend(shape)`）、`.refine()` 後の `.omit()` 不可、`error:` 必須                                                                 |
| Lexical 0.43    | NodeState API（`$config` + `createState`）                                                                                                                  |
| nuqs 2.8        | パーサーマップ `@/shared/lib/nuqs`、`useQueryStates({ shallow: false })` で RSC 再レンダリング                                                              |
| Bun 1.3         | test は per-directory バッチ（`mock.module` 干渉回避）、`packageManager: bun@1.3.12` pinned                                                                 |

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

- **全 interactive 要素は WCAG 2.5.5 Enhanced (AAA) 準拠 44×44 CSS px 必須** — public/admin Button は全 size で `min-h-11` 以上。checkbox/radio は wrapper で 44px ヒットエリア確保（→ `frontend/accessibility.md` §タッチターゲット、`frontend/project-design-config.md` §レスポンシブ設計）
- **カードグリッドは Container Queries、マクロレイアウトは viewport breakpoint** — `@container` + `@md:grid-cols-2 @3xl:grid-cols-3` がカード系 SSoT、`CARD_GRID_COLS_MAP` も container variant 化済。管理画面 dashboard は named container `@container/main` on `MainContent.tsx`（children で `@md/main:` / `@3xl/main:`）（→ `gotchas.md` §公開ページ レスポンシブ標準、`frontend/tailwind-patterns.md` §Container Queries）
- **arbitrary sizing（`max-w-[65ch]` / `[85vh]` 等）は @theme token で参照** — `--hero-min-height` / `--modal-max-height` / `--lightbox-max-*` / `--dropdown-min-width` / `--prose-narrow|medium` / `--container-measure` / `--container-header-max` / `--touch-target-min` が SSoT（public.css / admin.css の `@theme`）。新規 arbitrary 値は 3 回以上使用されたら @theme に昇格
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
- **画像 overlay text は 12px 以上（WCAG a11y）** — label/caption に `text-[0.55rem]` (8.8px) 禁止。editorial でも mobile 最小 `text-[0.75rem]` (12px)、photo credit のみ `text-[0.625rem]` (10px) まで許容。画像上テキストは 3 層防御（scrim + paint-order stroke + text-shadow）必須（→ `frontend/accessibility.md` §画像上テキストの 3 層可読性保証）
- **画像に text overlay する responsive hero は grid cell overlap パターン** — モバイル `col-start-1 row-start-1` + z-index で overlay、desktop で `md:col-start-2` に分離。単一 h1 / DOM 重複なしで SEO 整合（→ `tailwind-patterns.md` §同 Grid cell overlap）
- **Tailwind v4 responsive reset が必要な値は inline style 不可** — `style={{ WebkitTextStroke: "..." }}` は specificity で `md:[-webkit-text-stroke:0]` を上書きする silent bug。arbitrary class `[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]` + `md:[-webkit-text-stroke:0px_transparent]` を使う（→ `tailwind-patterns.md` §インラインスタイル vs Tailwind arbitrary properties）

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

### 調査・監査

- **「公式推奨」主張前**: `mcp__context7__query-docs` で一次資料確認（Radix / RHF / Next.js / React / Prisma / Zod）
- **「公式準拠」「クリーン実装」「ベストプラクティス」指示時は context7 verification 必須** — agent dispatch 前に Next.js / React / Prisma / Zod / Better Auth / Lexical / **WAI-ARIA APG（`/w3c/aria-practices`）** の該当バージョン docs を `mcp__context7__query-docs` で取得し、プロジェクトルール（`.claude/rules/**`）との乖離をチェック。プロジェクト独自厳格化（公式より厳しい）は ADR 扱いで保持
- **a11y 実装は ARIA First Rule（"native HTML > ARIA role"）を最優先で適用** — `role="button"` + 自前キーボードハンドラ（Enter=keydown / Space=keyup）は 2nd-best。native `<button>` を absolute overlay + `pointer-events-none/auto` で組み替えられないか先検討（gotchas.md §button ネスト禁止 の Block Link / Card Overlay パターン）。2nd-best 実装を提案する前に必ず第一推奨の適用可否を検証
- **a11y 実装前に UX state の実使用を grep で確認** — `selectedId` / `isSelected` 等の state が外部 consumer と連動しない「視覚ハイライト専用」なら dead state として削除候補。dead state に `aria-pressed` / キーボードハンドラ / focus ring を付けるのは over-engineering（`media/_components/MediaGrid.tsx` の `selectedId` 削除が参照事例）
- **context7 に無い Playground / reference implementation は `gh api` で一次ソース直接参照** — Lexical の `FloatingTextFormatToolbarPlugin` / `setFloatingElemPosition` / `DraggableBlockPlugin_EXPERIMENTAL` 等は `@lexical/react` の公開 API ではなく Playground 固有の参考実装のため context7（`/facebook/lexical` / `/websites/lexical_dev` 両方）にヒットしない。`gh api repos/facebook/lexical/contents/packages/lexical-playground/...` で裏取り。この場合の主張粒度は「公式 API ドキュメント準拠」ではなく **「reference implementation 準拠」** と明記（overstate 回避）
- **Radix primitives の具体例**: context7 取得不可 → `WebFetch` で `https://www.radix-ui.com/primitives/docs/components/<name>`
- **一括修正後**: Grep で違反パターン残存ゼロ確認してから完了報告
- **精査系 subagent の「使用なし」「欠落」報告は実装 Read + grep で二段検証必須** — grep ベース調査は seed 関数内の間接使用を見落として false positive を出す
- **Explore / 監査 subagent の数値・採用範囲リストは grep で再検証必須** — `breakpoint 使用箇所数` / `@container 採用ファイル数` / `arbitrary 値の件数` 等は rule docs の記述を根拠に hallucinate することあり（このセッションで `xl:` 22→実際 18、`@container` 採用 5→実際 3 の drift を検出）。修正計画に組み込む前に `grep -rE "\bxl:" src/ --include="*.tsx" -c | awk -F: '{s+=$2} END{print s}'` 等で ground truth を取る
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
- **ADR 新規作成前に `ls docs/architecture/decisions/ | grep "^00"` で既存番号確認** — 連番重複採番を防ぐ。本セッションで 0011 衝突が発生（`0011-dual-better-auth-instance.md` 既存を見落として重複作成 → 0014 に変更）
- **`package.json` scripts 削除・リネーム時は横断 grep 必須** — `AGENTS.md` / `CONTRIBUTING.md` / `cloudbuild.yaml` / `.github/workflows/*.yml` / `.claude/{rules,agents,skills}/**` / `docs/guides/**` / `bunfig.toml` / `.vscode/launch.json` に旧 script 名が残らないか確認（ADR 0014 で実例化）
- **ADR 制約と設定ファイルの整合を grep で周期検証** — `bunfig.toml` / `playwright.config.ts` / `.gitignore` 等が ADR 制約と乖離した dead code になっていないか（本セッション: `coverageThreshold` が ADR 0010 採択後も残存していた → ADR 0014 で撤去）

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
- **UI デザイン探索は `src/app/(public)/<feature>-demo/` で複数バリアント比較** — `hero-demo/` / `spaces-design-demo/` が参照実装。上部 sticky nav で variant 切替 + `max-w-[420px]` wrapper で desktop でも mobile preview 可能。`shared.ts` に variant metadata（name / tagline / description / pros / cons）を SSoT 化。決定後も reference として保持（削除しない）

### Subagent 規律

- **implementer は sonnet 以上**（haiku 禁止、report 捏造リスク）
- **完了報告後は独立検証**: `git log --oneline` + `git show --stat HEAD`
- **review agent の「欠落」「型不整合」報告は Read + Glob で実在確認** — project-reviewer は `Serialized<T>` 型システムを未把握で Date→string を warning 化、route-structure-reviewer は Glob Windows パス変換で実在 loading.tsx を「欠落」扱いする false positive 傾向あり。report ベースで修正着手せず、対象ファイルを直接 Read して現状確認
- **reviewer は MINGW64 `()` 含みパス Glob で誤検出する** — cache-strategy-reviewer 等が `src/shared/lib/constants/` 実在を「不在」と報告し「キャッシュ実装なし」と結論する false positive。受領後は `ls src/shared/lib/constants/` + `grep -rln "updateTag\|revalidateTag\|'use cache'" src/` で独立検証してから判断
- **密結合タスクは 1 implementer にバンドル**
- **implementer dispatch の git 禁止は `add`/`commit`/`push` だけでなく `reset`/`checkout`/`restore`/`stash` も全面禁止明記必須** — 並列 implementer で一方の `git reset` / `git restore` が他方の成果や controller の直前編集を silent revert する事故が実発生（2026-04-22 セッションで 4 agent 並列中に controller quick fixes 5 件 + 他 agent の main file 変更が HEAD@{0} `reset: moving to HEAD` で消失）。prompt に 🚫 `git add / commit / push / reset / checkout / restore / stash` を明記。staging は controller 側で実行し implementer は編集のみ
- **parallel implementer 完了後は 3 段検証** — ① `git status --short`（modifications + untracked 列挙、`[post-subagent] git snapshot` hook の出力は truncate されうるため authoritative でなく `git status` 直接実行が ground truth）② `wc -l` で対象ファイルの行数 delta 確認（agent 報告の行数と照合）③ `grep` で期待 symbol 存在 + 削除 symbol 不在を確認。`system-reminder` の「X was modified by linter」も edit 時点 snapshot が表示されるケースがあり stale しうるため、現状は必ず `grep` / `Read` で直接確認
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

## SSOT 定数・シングルトン（主要）

| 定数/変数                              | 場所                                              | メモ                                                                                                                                |
| -------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `adminAuth` / `customerAuth`           | `@/shared/lib/{admin,customer}-auth`              | cookie prefix 分離、customer は Google/LINE（`/api/customer-auth`）                                                                 |
| `DASHBOARD_ROLES` / RBAC helpers       | `@/shared/lib/admin-roles`                        | client-safe Role + `getInvitableRoles()` / `canInviteRole()` / `canModifyUser()`                                                    |
| `prisma` / `basePrisma` / Prisma enums | `@/shared/db/prisma` / `enums/prisma-types`       | `basePrisma` は Better Auth アダプター専用。Prisma enum は gateway 経由（runtime sentinel は `@generated/prisma/client` 直 import） |
| `CACHE_TAGS` / `invalidate*Caches`     | `@/shared/lib/constants` / `@/shared/lib/cache/*` | mutation 後の無効化 SSoT、ローカル `updateTag` 羅列禁止                                                                             |
| `*_STATUS_LABELS` / `PUBLISH_LABELS`   | `enums/helpers`                                   | 全ステータス enum + publish ラベル、UI ハードコード禁止                                                                             |
| レスポンシブ @theme tokens             | `(public\|admin)/_styles/*.css`                   | `--breakpoint-3xl` / `--header-height` / `--hero-min-height` 等。arbitrary 値 3 回以上で token 昇格                                 |

**全 27 件の完全な一覧は `.claude/rules/ssot-singletons.md`**（src/prisma 編集時に自動ロード）。auth / DB / キャッシュ / 外部連携（Calendar/Storage）/ ドメイン / Lexical / 公開 UI / @theme token のカテゴリ別に整理。

---

## 自動ロード

- **Rules**: `.claude/rules/**/*.md` — `paths:` フロントマターで条件付き自動ロード。最重要は `gotchas.md`
- **Skills**: `.claude/skills/<name>/SKILL.md` に frontmatter（`description` 必須）+ 手順本体（500 行未満推奨）。詳細は `reference/*.md` / `data/*` に分割
- **Subagents**: `.claude/agents/<name>.md` — frontmatter `name` / `description` / `tools:`（最小権限）/ `model: sonnet` / `memory: project`
- **Memory**: `~/.claude/projects/<slug>/memory/MEMORY.md` がセッション開始時に自動ロード
- **Serena memories**: `.serena/memories/**/*.md` が Serena MCP セッション開始時に自動ロード — 大規模マイグレーション・機能削除後は現状参照系（`project_overview.md` / `architecture-analysis.md` / `architecture/*.md`）を同期更新必須。stale 情報は次セッションで誤情報として注入される silent bug（実例: Supabase→R2 移行後に `project_overview.md` の `PostgreSQL (Supabase)` が残存）

包括的監査が必要な場合は、該当 subagent を並列起動（Agent ツール経由で description 参照）。

## 公式 API / ベストプラクティス準拠の原則

「公式推奨」「クリーン実装」「後方互換なし」指示時は以下を厳守:

1. `mcp__context7__query-docs` で該当バージョンの一次資料を取得（Next.js / React / Tailwind / WCAG / Radix / Better Auth / Prisma / Zod / Lexical 等）
2. プロジェクトルール（`.claude/rules/**`）と公式推奨の**差分を ADR 扱いで保持**（プロジェクト独自厳格化は正当化・記録）
3. 数値・採用範囲リストは必ず grep ground truth 検証（subagent の hallucination 防止、上記「調査・監査」節参照）
4. `@theme` / SSoT / ルール docs の整合を**同一コミット**で保つ（rule 更新と実装変更を同期して drift を防止）
5. 破壊的変更が発生する改修は phase 単位で 1 commit 完結（ロールバック容易化）、`docs/superpowers/plans/YYYY-MM-DD-<name>.md` に記録
6. **Claude Code hooks は公式仕様（`code.claude.com/docs/en/hooks`）に準拠** — `PostToolUse` / `SubagentStop` の stdout は Claude context に届かないため `hookSpecificOutput.additionalContext` JSON 必須。`Stop` + `asyncRewake: true` は `stop_hook_active` guard 必須（無限ループ防止）。`async` / `asyncRewake` / `if` フィールド採用。詳細・手動テスト手順は `.claude/rules/ops/hooks-patterns.md`（path-scoped autoload）
