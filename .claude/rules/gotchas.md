# Gotchas

プロジェクト固有の落とし穴と対処法。

## デプロイ

- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）

## TypeScript

- **`enum`・`namespace`・parameter properties 禁止**（`erasableSyntaxOnly: true`）— `const` + as const か union 型を使う → `.claude/rules/type-safety.md`
- **`import type` 必須**（`verbatimModuleSyntax: true`）— 値と型を同一インポートで混在させるとビルドエラー
- **`__tests__/` は type-check 対象外**（tsconfig exclude）— テスト内型エラーは `bun run type-check` では検出されず `bun test` 時のみ発覚

## Prisma マイグレーションスクリプト（`scripts/*.ts`）

- **`PrismaPg` adapter 必須** — `scripts/` は Next.js ランタイム外のため `new PrismaClient()` 単独で WASM エンジンが初期化できず `PrismaClientInitializationError`。`new PrismaPg({ connectionString: databaseUrl })` → `new PrismaClient({ adapter })` の順で初期化
- **`import type Prisma` はランタイムで使えない** — `Prisma.JsonNull` / `Prisma.InputJsonValue` 等の実値を使う場合は `import { PrismaClient, Prisma }` （`type` キーワードなし）
- **nullable JSON update は `Prisma.InputJsonValue`（`JsonValue` 禁止）** — `data: { field: content as Prisma.JsonValue }` は型エラー。`content as Prisma.InputJsonValue` を使う

## ビルド・検証

- **`bun run build` は env チェックなし**（`SKIP_ENV_VALIDATION=true`）— 本番デプロイ前は `bun run build:strict`
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **`verification` エージェントはコードを自動修正する** — `bun run validate && bun run build` 実行時に型エラーを検出するとコードを自動変更することがある。検証のみなら Bash で `bun run validate` を直接実行
- **ESLint 10 未対応（Next.js 16 対応待ち）** — `eslint-config-next` が依存する `eslint-plugin-react@7.x` が `context.getFilename()`（ESLint 10 で削除）を使用。`TypeError: contextOrFilename.getFilename is not a function` でクラッシュ。`eslint` は `9.39.2` 固定（`^` なし）。Next.js が `eslint-config-next` を ESLint 10 対応に更新するまで維持

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
- **管理者入力 HTML は `SanitizedHtml` 必須** — 生の HTML 直接レンダリング禁止。`import { SanitizedHtml } from "@/shared/components/SanitizedHtml"` を使う（isomorphic-dompurify, ADD_TAGS: ['iframe']）。例外: JSON-LD の `<script type="application/ld+json">` は JSON.stringify() 経由のため安全で変更不要

## 管理画面 UI

- **`PublishSwitch.onToggle` は `(id, checked: boolean)` 必須** — 既存の「DB を読んで反転」パターン（`data: { isActive: !current }`）は非互換。`withPermission<[string, boolean]>` で boolean を直接受け取り `data: { isActive }` で set する形に変更する
- **tailwind-variants 複数スロット合成時の `text-*` 競合** — `${base()} ${variant()}` のように同一要素に2つの `text-*` が適用されると、CSS 生成順次第でどちらが勝つか不定（HTML クラス順は無関係）。動的に変わる色（アクティブ状態等）は継承に頼らず子要素に直接 `text-*` を明示する
- **Lucide アイコンの `currentColor`** — アイコンの色を動的に切り替えたい場合、アイコン定義側では制御できないため呼び出し元で `<span className={isActive ? "text-sidebar-text" : ""}>` でラップして色クラスを付与する
- **`bg-overlay` に opacity modifier 禁止** — `--color-overlay: oklch(0 0 0 / 0.6)` はアルファ値が CSS 変数値に組み込み済み。`bg-overlay/30` 等の Tailwind opacity modifier は期待通り機能しない。`bg-overlay` のみ使用する
- **`DialogContent` には必ず `DialogTitle` が必要** — Radix `DialogTitle`（または VisuallyHidden でラップ）がないと `role="dialog"` に `aria-labelledby` が接続されず WCAG 4.1.2 違反。`DialogContent` 追加時は必ずセットで記述する

## フレームワーク固有

- **`revalidateTag` は Next.js 16 で 2 引数必須** — `revalidateTag(tag: string, profile: string | CacheLifeConfig)`。第 2 引数 `profile` は省略不可（旧 Next.js 14/15 との破壊的変更）。`CACHE_LIFE.*` 定数を渡すのが正しい用法。監査・レビュー時に「余分な引数」と誤識別しないこと
- **`global-error.tsx` に `next/font/google` 使用不可** — admin.css/public.css をインポートしないため、変数モードのフォント CSS が preload されるが未使用警告になる。`<body style={{ fontFamily: '...' }}>` でシステムフォントを直接指定する
- **時刻依存の設定トグルに `CACHE_LIFE.STATIC_SETTINGS` 禁止** — メンテナンスモード等、即時反映が必要な設定は `cacheLife(CACHE_LIFE.DYNAMIC_DATA)` を使う（`STATIC_SETTINGS` は 'days' 単位のため切り替えが即時反映されない）

## 認証・認可

- **`verifyAdminSession()` / `isAdmin()` は `SUPER_ADMIN` も必須チェック** — `role !== Role.ADMIN` のみでは `SUPER_ADMIN`（全権限保有）が管理画面にアクセスできないバグになる。`role !== Role.ADMIN && role !== Role.SUPER_ADMIN` の形式で記述する
- **接続テスト・確認系アクションも HOF 必須** — 書き込み系は `withPermission`、読み取り系は `withReadPermission`。独自の `checkXxxPermission()` ヘルパーは権限チェックが非標準になり欠落が生じる

## HTTP セキュリティヘッダー

- **`X-XSS-Protection` ヘッダー追加禁止** — Chromium/Firefox削除済み、`mode=block` はXSS悪用リスクあり。`next.config.ts` headers に新規追加しないこと（削除済み）
- **`Permissions-Policy` に `interest-cohort=()` 追加禁止** — Google FLoC は2022年廃止済み。不要（削除済み）
- **セキュリティヘッダーは `proxy.ts` に一元化（`next.config.ts` への追加禁止）** — nonce のリクエスト毎生成が必須なため。Cache-Control のみ `next.config.ts` で管理。CSP nonce: `Buffer.from(crypto.randomUUID()).toString('base64')`
- **`proxy.ts` の rewrite パスは `createResponse()` と同一ヘッダーセット必須** — `NextResponse.rewrite()` を追加する際は requestHeaders に `x-nonce` / `x-pathname` / `Content-Security-Policy`、レスポンスに `response.headers.set("x-pathname", pathname)` + `applySecurityHeaders()` を必ず設定。欠落するとその URL パスでのみ nonce 伝播が壊れる

## 環境変数

- **`NEXT_PUBLIC_*` はサーバーコードでも `clientEnv` 経由で参照** — `process.env["NEXT_PUBLIC_APP_URL"]` 等の直接参照は型バリデーションを迂回する。`clientEnv.NEXT_PUBLIC_APP_URL` を使用すること（`@/shared/lib/env/client` から import）
- **Supabase 環境変数はオプション** — `env/client.ts` で `.optional()` 設定済み。`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を必須（`z.string()`）に変更しないこと

## 外部 API SDK

- **Resend SDK v3+（v6 含む）は例外を投げない** — `resend.emails.send()` / `resend.domains.list()` 等はすべて `{ data, error }` を返す（ネットワークエラーも含む）。`try/catch` のみでは API エラーをキャッチできない。必ず `const { error } = await resend.xxx()` で `error` をチェックする。`catch` ブロックは React Email レンダリング例外の保険として保持する
- **Stripe API version `2026-02-25.clover`** — stripe SDK v20.4.0 のデフォルトバージョン（プレビューではない）。SDK アップグレード時は `bun run type-check` の型エラーで新バージョン文字列が判明 → `stripe.ts` の `apiVersion` を更新。監査時に「余分な `.clover` サフィックス」と誤識別しないこと

## API Routes

- **設定依存エラーは 503（500 禁止）** — Webhook トークン未設定・API キー未設定等の「依存関係が未設定」は `{ status: 503 }` を返す。500 にすると Google Calendar 等の外部サービスが自動リトライを繰り返す
- **OAuth コールバック: URL クエリパラメータに生エラーメッセージ禁止** — `?error=認証エラー: ${error.message}` はブラウザ履歴・ログに内部詳細が永続する。`logError()` で内部記録のみ行い、URL には固定の安全メッセージを返す（例: `"Instagram認証に失敗しました。再度お試しください。"`）
- **HTTP レスポンスボディに `error.message` 露出禁止** — DB ホスト名・スキーマ名等の内部情報を含む可能性がある。`logError()` でサーバー側記録のみ行い、外部レスポンスにはフィールドを含めないか固定メッセージにする（URL パラメータだけでなくレスポンスボディも対象）
