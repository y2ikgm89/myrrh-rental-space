# Gotchas

プロジェクト固有の落とし穴と対処法。

## Page-First Architecture（公開ページ）

- **公開ページの `_shared/components/layouts/` は kebab-case** — `site-header.tsx`, `site-footer.tsx` 等。PascalCase のレガシーセクションコンポーネント（`_components/*.tsx`）は `[...segments]` カスタムページ用に維持
- **旧カラートークンは `@layer compat` でエイリアス** — `--color-primary` → `var(--color-accent)` 等。レガシーセクションコンポーネントが依存。新コードでは `accent`/`foreground`/`surface` 等の新トークンを直接使用すること
- **`PageContent` モデルと `Page`/`Section` モデルは共存** — 固定ページ（トップ、一覧等）は `PageContent`、カスタムページは `Page` + `Section`。削除せず維持
- **PascalCase アニメーションファイルは thin re-export** — `ScrollReveal.tsx` → `export { ScrollReveal } from "./scroll-reveal"`。レガシーセクションの import パスを壊さないため。新コードは kebab-case を直接 import
- **Prisma `Decimal` 型は `Number()` で変換** — `Space.hourlyPrice` 等は `Decimal` 型。子コンポーネントに渡す前に `Number(space.hourlyPrice)` で変換（`as number` 禁止）
- **Prisma JSON フィールド（`imageUrls`, `facilities`）は `unknown` で受け取る** — `Array.isArray()` + type guard filter でランタイムパース。`as string[]` 禁止
- **Three.js / PixiJS はパッケージのみ利用可能** — 旧 `effects/` インフラ（Provider/Canvas 29ファイル）は削除済みだが、パッケージは再インストール済み。使用時はページコンポーネントから直接 `import { Canvas } from "@react-three/fiber"` 等で import する。旧の `ExperienceShell` → `VisualEffectsProvider` パターンは禁止

## Multiple Root Layouts

- **root `app/loading.tsx` を削除する場合、各 route group 内に `loading.tsx` が必要** — root `loading.tsx` は `app/layout.tsx` がなくても Suspense boundary として機能している。削除すると `(dashboard)/layout.tsx` 等の動的レイアウトで「Uncached data was accessed outside of \<Suspense\>」ビルドエラー。対処: `(admin)/admin/loading.tsx`（admin 全体）と `(admin)/admin/(auth)/loading.tsx`（認証画面）を個別に追加
- **root `not-found.tsx` は CSS import + `next/font/google` が使える（`global-error.tsx` とは異なる）** — `not-found.tsx` は Server Component のため `public.css` をインポートして Tailwind クラスを使用可能。`global-error.tsx` は `"use client"` 必須のためインラインスタイル。両者を混同しない
- **ルーティング移行後の空ディレクトリ残骸に注意** — `[slug]` → `[...segments]` 等の移行で空ディレクトリが残る。`page.tsx` がなくても Next.js のルート解決に影響する可能性がある

## デプロイ

- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）
- **Docker ビルドは `SKIP_ENV_VALIDATION=true`** — `DATABASE_URL` / `BETTER_AUTH_SECRET` がビルド時に不在のため。`build:strict`（環境変数バリデーション有り）に移行するには Cloud Build の Secret Manager 連携で `DATABASE_URL` と `BETTER_AUTH_SECRET` をビルド時に注入する設定が必要
- **staging 環境にも `CRON_SECRET` を設定必須** — `proxy.ts` の cron 認証は `CRON_SECRET` が未設定の場合スキップされる。本番は起動時チェックで保護されるが、staging（Internet 公開の Cloud Run インスタンス等）は明示設定が必要

## TypeScript

- **非null アサーション (`!`) は `as` 同様に禁止** — 代替パターン3種: ① ガード句 `if (!x) throw`、② 変数抽出で narrowing（三項演算子内では narrowing が効かないため）、③ optional + early return（`noUncheckedIndexedAccess` 対応）→ `.claude/rules/type-safety.md`
- **`enum`・`namespace`・parameter properties 禁止**（`erasableSyntaxOnly: true`）— `const` + as const か union 型を使う → `.claude/rules/type-safety.md`
- **`import type` 必須**（`verbatimModuleSyntax: true`）— 値と型を同一インポートで混在させるとビルドエラー
- **`__tests__/` は type-check 対象に含まれている**（`tsconfig.test.json`）— `bun run type-check` が `tsc -p tsconfig.test.json` も実行し、テスト内型エラーを検出する

## Prisma マイグレーションスクリプト（`scripts/*.ts`）

- **`PrismaPg` adapter 必須** — `scripts/` は Next.js ランタイム外のため `new PrismaClient()` 単独で WASM エンジンが初期化できず `PrismaClientInitializationError`。`new PrismaPg({ connectionString: databaseUrl })` → `new PrismaClient({ adapter })` の順で初期化
- **`import type Prisma` はランタイムで使えない** — `Prisma.JsonNull` / `Prisma.InputJsonValue` 等の実値を使う場合は `import { PrismaClient, Prisma }` （`type` キーワードなし）
- **nullable JSON update は `Prisma.InputJsonValue`（`JsonValue` 禁止）** — `data: { field: content as Prisma.JsonValue }` は型エラー。`content as Prisma.InputJsonValue` を使う

## ビルド・検証

- **ローカル barrel の tree-shaking は信頼できない** — Next.js の `optimizePackageImports` は npm パッケージのみ対象。`index.ts` で re-export すると未使用コンポーネントもバンドルに含まれる可能性がある。バンドルサイズが問題になる場合は barrel 経由ではなく直接 import する（例: `section-parsers.ts` から直接 import して Zod をクライアントバンドルから除去）
- **`global-error.tsx` は Root Layout を完全に置換する** — `<html>` `<body>` を自身で定義するため、admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可。全スタイルをインラインで記述すること（Tailwind クラス禁止）
- **`bun run build` は env チェックなし**（`SKIP_ENV_VALIDATION=true`）— 本番デプロイ前は `bun run build:strict`
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **`verification` エージェントはコードを自動修正する** — `bun run validate && bun run build` 実行時に型エラーを検出するとコードを自動変更することがある。検証のみなら Bash で `bun run validate` を直接実行
- **レンダー中の `Object.assign` 禁止** — `@eslint-react/purity` 違反。`CSSProperties` 構築等で `Object.assign(target, source)` を使うとミュータブル操作とみなされる。`let styles = { ...base, ...conditional }` のスプレッドパターンを使用
- **Turbopack ビルドはルート別 JS サイズを表示しない** — `bun run build` 出力の「Total client JS」は全チャンク合計。1ルートの First Load JS は `.next/server/app/<route>.html` 内の `<script>` 参照チャンクを合計して計算する

## ファイル操作・Git

- **`rm -rf` は deny ルール** — 追跡ファイルは `git rm -r <path>`、未追跡ファイルは `python3 -c "import shutil; shutil.rmtree('path')"` で削除
- **PostToolUse フック後は再 Read が必要** — Edit/Write 後に Prettier/ESLint フックがファイルを変更する。続けて同ファイルを Edit する場合は事前に再 Read しないと "file modified since read" エラー
- **`git add` 後はコミット前に `git status` 再確認** — Prettier PostToolUse フックが `git add` で他のステージング済みファイルも変更することがある（` M` に変わる）
- **選択的コミット** — 多数のファイルがステージ済みの状態で特定ファイルのみコミットするには `git restore --staged . && git add <target-files>` で再ステージする

## Claude Code 設定

- **`revise-claude-md` はセッション終了直前に呼ぶ** — CLAUDE.md はプロジェクトレベルのプロンプトキャッシュ層。セッション中に変更するとそれ以降のターンのキャッシュがすべて破壊される
- **スキルは必ず Skill ツールで呼ぶ（Task ツール不可）** — `plugin:name` や `ns:name` 形式のスキルも同様。Task ツールの `subagent_type` に指定すると `Agent type not found` エラー。CLAUDE.md スキルテーブルで `（Task）` 注釈のないものは全て Skill ツール呼び出し
- **MCP ツールはセッション開始前に確定させる** — セッション途中で `.mcp.json` を変更したり MCP サーバーを追加・削除するとツール定義のプレフィックスが変わりキャッシュが破壊される
- **新規 hook スクリプトは `bash` 明示呼び出し** — MINGW64 で `chmod` が Bash deny されるため、`settings.json` の `command` は `bash "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/script.sh"` 形式で記述する
- **hook スクリプトの `grep` + `pipefail` 罠** — `set -euo pipefail` 下で `var=$(cmd | grep pattern | head -1)` は grep 不一致（exit 1）でスクリプトが無音終了・stderr なし。根本解決: `if ! cmd | grep -qE 'pattern'; then exit 0; fi`（`if` 条件式内は `set -e` 対象外が Bash 仕様）

## Worktree

- **worktree で Prisma 生成ファイルが欠落** — `src/shared/generated/` は worktree に自動コピーされない。`bun run type-check` で "cannot find module" エラーが出る場合は `robocopy src/shared/generated .worktrees/<branch>/src/shared/generated /E /XF nul` で手動コピー（`/XF nul` で Windows `nul` デバイスファイルを除外）
- **スキーマ変更 worktree を main にマージ後は `bun run db:generate` 必須** — `prisma migrate dev` を worktree 内で実行しても main の `src/shared/generated/` は更新されない。マージ後に main で `bun run db:generate` を実行しないと型エラーが発生する（例: `Module has no exported member 'XxxEnum'`）
- **worktree ブランチを main にローカルマージする際の注意（main に未コミット変更がある場合）**:
  1. `git stash -u` で untracked ファイルも含めてスタッシュ（`git stash` のみでは untracked が残りマージを阻む）
  2. `git stash pop` コンフリクト後 → 解決して `git add` → `git stash drop`（エントリは自動保持されたまま）
  3. worktree ディレクトリを削除済みでもブランチ参照が残る → `git worktree prune` → `git branch -d`
- **ESLint が `.worktrees/` 内ファイルを lint 対象にする** — `eslint.config.mjs` の `globalIgnores` に `.worktrees/**` 追加済み。worktree ディレクトリ名を変えた場合はパターン更新が必要
- **Windows で worktree 削除時の PermissionError** — bun/node プロセス起動中は native binary（`@tailwindcss/oxide-win32-x64-msvc.node` 等）がロックされる。`cmd /c rd /s /q ".worktrees/<name>"` で大部分は削除できるが binary は残る。git 参照だけなら `git worktree prune` + `git branch -d` で十分。完全削除は全プロセス終了後に `powershell.exe -Command "Remove-Item -Recurse -Force '...'"` で実施

## Lexical エディタ

- **`createDOM` → data-attribute 変換後は `theme.ts` の旧エントリを削除** — `config.theme.*` 参照除去後、`theme.ts` に残った CSS クラスエントリが dead code になる。変換時にセットで削除する
- **NodeState `parse` には `config/type-guards.ts` の `parseString` / `parseBoolean` を使う** — inline lambda の重複は禁止（`lexical-patterns.md` 参照）
- **`exportDOM` を定義したら `importDOM` も必須** — 片方のみで dev-mode に `exportDOM implemented without matching importDOM` 警告が出続ける。`static override importDOM(): DOMConversionMap | null` をセットで実装する（パターンは `lexical-patterns.md § HTML互換性` 参照）
- **`createEnumGuard` の型ガードは `string` を要求** — `createEnumGuard` が返す関数は `(value: string) => value is T` シグネチャ。`parse: (v: unknown)` から直接渡すと型エラー。AccentColor 等の parse パターン: `parse: (v: unknown): AccentColor => typeof v === "string" && isAccentColor(v) ? v : "default"`
- **`importDOM` で `getAttribute()` → AccentColor 変換に型ガード必須** — `element.getAttribute("data-color") ?? "default"` の型は `string`（`AccentColor` ではない）。必ず `isAccentColor(colorAttr) ? colorAttr : "default"` でガードする
- **コンポジットノード（`isShadowRoot()` あり）には `canInsertTextBefore/After` が必須** — 欠落するとキーボード操作でテキストがノード境界外に漏れる。`LayoutContainerNode`・`LayoutItemNode` 等の全コンポジットノードに `override canInsertTextBefore(): false { return false }` と `override canInsertTextAfter(): false { return false }` をセットで実装する（戻り型は `boolean` ではなくリテラル `false`）
- **`canBeEmpty()` の戻り型は `: false` リテラル必須** — `canInsertTextBefore/After` と同様、コンテナノードの `canBeEmpty()` も `override canBeEmpty(): false { return false }` とリテラル型で実装する。`: boolean` は TypeScript の narrowing が機能せず lexical-reviewer に検出される
- **Lexical 組み込みノード継承時は Node Replacement パターン必須** — `CustomTableNode extends TableNode` で独自型文字列 `"custom-table"` を使いつつ、`EDITOR_NODES` に `{ replace: TableNode, with: () => $createCustomTableNode(), withKlass: CustomTableNode }` をセット登録する。`withKlass` が `editor._nodes.get("table")` に `CustomTableNode` を割り当てるため `TablePlugin.hasNodes([TableNode])` が通過する。親の型文字列をそのまま使う手法（`this.config("table", ...)`）は公式パターン外なので禁止。既存 DB データの `"type": "table"` は `withKlass` により `CustomTableNode.importJSON()` が呼ばれ透過的に読み込まれる
- **テーブルセル内の `mb-4` が余分な縦幅を生む** — HTML 仕様でテーブルセル内はマージン相殺が起きず、`ParagraphNode` の `mb-4`（16px）がそのまま余白になる。`lexical-content.css` に `table :is(td, th) > :last-child { margin-bottom: 0; }` を追加（unlayered CSS は Tailwind utilities より優先）
- **`theme.ts` の `w-full` と `fixedLayout` state は競合する** — テーマクラスの `w-full` がインライン style による `fixedLayout` 制御を上書きする。テーマから `w-full` を削除し、幅制御は `CustomTableNode._applyAttributes()` の `fixedLayout` state に一本化すること

## errors モジュール（server-only 境界）

- **`@/shared/lib/errors` はクライアントセーフのみ** — `getErrorMessage`, `ErrorCategory`, `ErrorSeverity`, `normalizeError`, `ReservationOverlapError` のみ。Client Component から import 可能
- **`@/shared/lib/errors/server` はサーバー専用** — `logError`, `safeFetch`, `criticalFetch`, `createErrorLogger`。Client Component から import すると `server-only` ビルドエラー。上記クライアントセーフシンボルも全て re-export するので、サーバー側は `/server` に統一できる
- **バレルファイルに server-only と client-safe を混在させない** — `import "server-only"` を含むモジュールを re-export したバレルは丸ごと server-only 扱いになる（Client Component からは一切使用不可）

## React / コンポーネント

- **ダイアログを条件分岐の内側でレンダリング禁止** — early return や三項演算子の片側に `<Dialog>` / `<AlertDialog>` を置くと、他の状態から `open={true}` にしても表示されない。ダイアログはコンポーネント末尾のトップレベルで常にレンダリングする
- **sessionStorage / localStorage 読み取りに `useState` lazy initializer 禁止** — React 19 公式は `useSyncExternalStore` を推奨（`subscribe` = no-op、`getSnapshot` は `useRef` キャッシュ必須）→ `react-patterns.md §useSyncExternalStore`
- **Prisma オブジェクトを `{ ...prismaObj }` で Client Component に渡すと Symbol エラー** — `nodejs.util.inspect.custom` 等の Symbol プロパティが混入し `Only plain objects can be passed to Client Components` エラーが発生。`toPlainObject({ ...prismaObj, customFields })` でラップして返す（`@/shared/lib/serialize`）。`Date` フィールドは実行時 ISO 文字列になるため表示には `toISOString()` / `formatSerializedDate()` を使用
- **`toPlainObject` は `Serialized<T>` を返す** — ドメインクエリが `toPlainObject()` を通すと `Date` → `string` に変換される。クエリの戻り型は `Serialized<T>` で宣言し、Client Component の props も `Serialized<T>` で受け取る。`Date` 型のまま Client Component に渡すと実行時は `string` なのに型は `Date` になる不整合が発生する
- **`element.style.*` への色指定も CSS 変数を使う** — `el.style.backgroundColor = "oklch(...)"` 禁止。`color-mix(in oklch, var(--color-background) 90%, transparent)` や `var(--shadow-sm)` 等の CSS 変数参照で記述する。ScrollTrigger コールバック等の GSAP 内インラインスタイルも同様
- **管理者入力 HTML は `SanitizedHtml` 必須** — 生の HTML 直接レンダリング禁止。`import { SanitizedHtml } from "@/shared/components/SanitizedHtml"` を使う（isomorphic-dompurify, ADD_TAGS: ['iframe']）。例外: JSON-LD の `<script type="application/ld+json">` は JSON.stringify() 経由のため安全で変更不要
- **`useFormStatus` は react-hook-form の `onSubmit` パターンと非互換** — `useFormStatus` は `<form action={}>` でのみ動作する。`useFormAction` フック（react-hook-form + `useTransition`）を使うフォームでは `isPending` を prop で受け取る `SubmitButton` を使用する。`useFormStatus` への移行は不要
- **`DndContext`（@dnd-kit）には必ず `id` prop を付与** — 未指定だと内部カウンター（`DndDescribedBy-N`）が SSR/クライアントでずれ hydration mismatch が発生する。固定コンポーネントは文字列リテラル（`id="xxx-sortable"`）、汎用コンポーネントは `useId()` を使用

## 管理画面 UI

- **`PublishSwitch.onToggle` は `(id, checked: boolean)` 必須** — 既存の「DB を読んで反転」パターン（`data: { isActive: !current }`）は非互換。`executeAdminMutationResult` で boolean を直接受け取り `data: { isActive }` で set する形に変更する
- **tailwind-variants 複数スロット合成時の `text-*` 競合** — `${base()} ${variant()}` のように同一要素に2つの `text-*` が適用されると、CSS 生成順次第でどちらが勝つか不定（HTML クラス順は無関係）。動的に変わる色（アクティブ状態等）は継承に頼らず子要素に直接 `text-*` を明示する
- **Lucide アイコンの `currentColor`** — アイコンの色を動的に切り替えたい場合、アイコン定義側では制御できないため呼び出し元で `<span className={isActive ? "text-sidebar-text" : ""}>` でラップして色クラスを付与する
- **`bg-overlay` に opacity modifier 禁止** — `--color-overlay: oklch(0 0 0 / 0.6)` はアルファ値が CSS 変数値に組み込み済み。`bg-overlay/30` 等の Tailwind opacity modifier は期待通り機能しない。`bg-overlay` のみ使用する
- **`DialogContent` には必ず `DialogTitle` が必要** — Radix `DialogTitle`（または VisuallyHidden でラップ）がないと `role="dialog"` に `aria-labelledby` が接続されず WCAG 4.1.2 違反。`DialogContent` 追加時は必ずセットで記述する
- **Settings singleton にフィールド追加は4箇所同時更新** — ① `schema.prisma` + migrate ② `domain/settings/types.ts` の `SettingsData` 型 ③ `domain/settings/queries.ts` の get クエリ + `commands.ts` の update コマンド ④ `actions/settings/schemas.ts` の Zod スキーマ + `other.ts` の Server Action + `index.ts` barrel。`SettingsData` は `getOrCreateSettings()` が `select` なしで全カラムを返すため型追加のみで値は自動伝播

## フレームワーク固有

- **`revalidateTag` は Next.js 16 で 2 引数必須** — `revalidateTag(tag: string, profile: string | CacheLifeConfig)`。第 2 引数 `profile` は省略不可（旧 Next.js 14/15 との破壊的変更）。`CACHE_LIFE.*` 定数を渡すのが正しい用法。監査・レビュー時に「余分な引数」と誤識別しないこと
- **`global-error.tsx` に `next/font/google` 使用不可** — admin.css/public.css をインポートしないため、変数モードのフォント CSS が preload されるが未使用警告になる。`<body style={{ fontFamily: '...' }}>` でシステムフォントを直接指定する
- **時刻依存の設定トグルに `CACHE_LIFE.STATIC_SETTINGS` 禁止** — メンテナンスモード等、即時反映が必要な設定は `cacheLife(CACHE_LIFE.DYNAMIC_DATA)` を使う（`STATIC_SETTINGS` は 'days' 単位のため切り替えが即時反映されない）
- **管理画面ページに `connection()` 禁止** — `connection()` は公開ページ（`src/app/(public)/`）専用の PPR 動的 opt-in。管理画面（`src/app/(admin)/`）では使用しない。`new Date()` が必要なコンポーネントは Client Component にする
- **`generateViewport` は `"use cache"` クエリと組み合わせる** — `viewport` の static export から `generateViewport()` async 関数に変更すると動的レンダリングを引き起こすが、内部クエリが `"use cache"` ならキャッシュから読み取る。layout.tsx が既に動的（`getHeaderSettings` 等）なら影響なし

## 認証・認可

- **`verifyAdminSession()` / `isAdmin()` は `SUPER_ADMIN` も必須チェック** — `role !== Role.ADMIN` のみでは `SUPER_ADMIN`（全権限保有）が管理画面にアクセスできないバグになる。`role !== Role.ADMIN && role !== Role.SUPER_ADMIN` の形式で記述する
- **接続テスト・確認系アクションも `executeAdminMutationResult` 必須** — 独自の `checkXxxPermission()` ヘルパーは権限チェックが非標準になり欠落が生じる
- **Webhook トークン比較に `!==` 禁止** — `crypto.timingSafeEqual` を使用。`receivedToken !== settings.token` はタイミング攻撃に脆弱。Google Calendar webhook の `timingSafeTokenEqual()` が実装例

## HTTP セキュリティヘッダー

- **`X-XSS-Protection` ヘッダー追加禁止** — Chromium/Firefox削除済み、`mode=block` はXSS悪用リスクあり。`next.config.ts` headers に新規追加しないこと（削除済み）
- **`Permissions-Policy` に `interest-cohort=()` 追加禁止** — Google FLoC は2022年廃止済み。不要（削除済み）
- **セキュリティヘッダーは `proxy.ts` に一元化（`next.config.ts` への追加禁止）** — nonce のリクエスト毎生成が必須なため。Cache-Control のみ `next.config.ts` で管理。CSP nonce: `Buffer.from(crypto.randomUUID()).toString('base64')`
- **`proxy.ts` の rewrite パスは `createResponse()` と同一ヘッダーセット必須** — `NextResponse.rewrite()` を追加する際は requestHeaders に `x-nonce` / `x-pathname` / `Content-Security-Policy`、レスポンスに `response.headers.set("x-pathname", pathname)` + `applySecurityHeaders()` を必ず設定。欠落するとその URL パスでのみ nonce 伝播が壊れる
- **`style-src` は本番で nonce ベース（`'unsafe-inline'` に戻さない）** — `proxy.ts` で `'nonce-${nonce}'` を設定済み。Next.js が `<style>` タグに自動で nonce を付与。開発時のみ `'unsafe-inline'`（HMR 互換性のため）

## Rate Limiting

- **API レート制限は `checkRateLimit(pathname, clientIp)` に一元化** — `proxy.ts` で呼び出す。エンドポイント別: `/api/auth` → 10/15分（ブルートフォース対策）、`/api/admin/login-tokens` → 30/分、その他 → 100/分。個別の `apiRateLimiter.check()` 直接呼び出しは禁止
- **Webhook・Cron はレート制限対象外** — `/api/webhooks` と `/api/cron` は `checkRateLimit` の前に早期リターンする（`proxy.ts` の条件分岐で除外済み）

## 環境変数

- **`NEXT_PUBLIC_*` はサーバーコードでも `clientEnv` 経由で参照** — `process.env["NEXT_PUBLIC_APP_URL"]` 等の直接参照は型バリデーションを迂回する。`clientEnv.NEXT_PUBLIC_APP_URL` を使用すること（`@/shared/lib/env/client` から import）
- **Supabase 環境変数はオプション** — `env/client.ts` で `.optional()` 設定済み。`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を必須（`z.string()`）に変更しないこと

## 外部 API SDK

- **`better-auth` 1.5.x で Prisma アダプターが別パッケージに分離** — `@better-auth/prisma-adapter` を別途インストール必要（`bun add @better-auth/prisma-adapter`）。import パス `better-auth/adapters/prisma` は変わらずコード修正不要
- **Resend SDK v3+（v6 含む）は例外を投げない** — `resend.emails.send()` / `resend.domains.list()` 等はすべて `{ data, error }` を返す（ネットワークエラーも含む）。`try/catch` のみでは API エラーをキャッチできない。必ず `const { error } = await resend.xxx()` で `error` をチェックする。`catch` ブロックは React Email レンダリング例外の保険として保持する
- **Stripe API version `2026-02-25.clover`** — stripe SDK v20.4.0 のデフォルトバージョン（プレビューではない）。SDK アップグレード時は `bun run type-check` の型エラーで新バージョン文字列が判明 → `stripe.ts` の `apiVersion` を更新。監査時に「余分な `.clover` サフィックス」と誤識別しないこと

## ロガー（GCP 構造化ログ）

- **`ErrorSeverity` と `severity` は異なる値** — `logError` 出力 JSON の `severity` は GCP LogSeverity にマッピングされる（`HIGH` → `"ERROR"`, `MEDIUM` → `"WARNING"`, `LOW` → `"INFO"`）。テストで `parsed.severity` を検証する際は GCP LogSeverity を期待すること
- **`stack_trace` は ERROR 以上のみ** — `severity` が `"ERROR"` / `"CRITICAL"` の場合のみ `stack_trace` と `@type`（Cloud Error Reporting 用）が出力される。WARNING 以下ではスタックトレースなし
- **`K_SERVICE` / `K_REVISION`** — Cloud Run が自動設定する環境変数。`serviceContext.service` / `serviceContext.version` に使用。ローカルでは `"myrrh-rental-space"` / `"local"` にフォールバック
- **モジュールレベルで `process.env` をキャッシュしない** — `const isDev = process.env["NODE_ENV"] !== "production"` はテスト時に `process.env` を上書きしても反映されない。`process.env["NODE_ENV"]` をインライン評価すること

## API Routes

- **設定依存エラーは 503（500 禁止）** — Webhook トークン未設定・API キー未設定等の「依存関係が未設定」は `{ status: 503 }` を返す。500 にすると Google Calendar 等の外部サービスが自動リトライを繰り返す
- **OAuth コールバック: URL クエリパラメータに生エラーメッセージ禁止** — `?error=認証エラー: ${error.message}` はブラウザ履歴・ログに内部詳細が永続する。`logError()` で内部記録のみ行い、URL には固定の安全メッセージを返す（例: `"Instagram認証に失敗しました。再度お試しください。"`）
- **HTTP レスポンスボディに `error.message` 露出禁止** — DB ホスト名・スキーマ名等の内部情報を含む可能性がある。`logError()` でサーバー側記録のみ行い、外部レスポンスにはフィールドを含めないか固定メッセージにする（URL パラメータだけでなくレスポンスボディも対象）

## ESLint

- **`@eslint-react/eslint-plugin` v3 でルール名変更** — `@eslint-react/hooks-extra/no-direct-set-state-in-use-effect` → `@eslint-react/set-state-in-effect`。アップグレード時に全 eslint-disable コメントを一括置換する。`@eslint-react/purity` の `new Date()` 警告は Server Component で false positive（warn レベルのため放置可）
- **JSX 内の IIFE 禁止**（`@eslint-react/unsupported-syntax`）— `{(() => { ... })()}` パターンは React Compiler が最適化できないため error。JSX 前に変数抽出する
- **フック内コンポーネント定義禁止**（`@eslint-react/component-hook-factories`）— `useXxx` 内で `const Comp = () => <JSX />` を定義して返すパターンは禁止。`ReactNode` を返すか、モジュールレベルにコンポーネントを抽出する（`use-media-picker.tsx` が実装例）

## Recharts（SVG チャート）

- **Recharts の SVG props は CSS 変数を受け取れない** — `fill={CHART_COLORS.primary}` のように oklch 定数を定義して渡す。admin.css テーマトークンと同期する oklch 値をコンポーネント上部に `as const` で定義（`ReservationChart.tsx` が実装例）
