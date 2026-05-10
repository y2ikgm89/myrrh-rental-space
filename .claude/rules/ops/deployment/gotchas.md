---
description: デプロイ・ビルド・検証の Gotchas（Cloud Run / health endpoint / cron schedule / build env / Bash 出力 / Zod 4 移行 / Prisma client）
paths:
  - Dockerfile
  - cloudbuild.yaml
  - .github/workflows/**
  - src/app/api/health/**
  - src/app/api/live/**
  - src/app/api/cron/**
  - src/proxy.ts
  - src/instrumentation.ts
---

# デプロイ・ビルドの Gotchas

> Cloud Run / probe / cron / build 環境 / Bash pipe / Zod 4 移行ハマり所 / 周辺の test 干渉。

## デプロイ

- **`/api/health` で内部インフラ状態（DB 接続状態、バージョン等）を公開しない** — Cloud Run / LB のヘルスチェックには `status` + `timestamp` のみ返す。`database: "connected"/"disconnected"` のようなフィールドは攻撃者のインフラ偵察に利用される
- **デプロイ先は Google Cloud Run**（Vercel 不使用）— `Dockerfile` + `cloudbuild.yaml`。URL 環境変数は `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` を Cloud Run に明示設定（`VERCEL_URL` は存在しない）
- **Docker / 秘密未注入のビルドは `bun run build:skip-env`**（`SKIP_ENV_VALIDATION=true`）— `DATABASE_URL` / `BETTER_AUTH_SECRET` がビルド時に無い場合。本番相当は Secret Manager でビルド時に注入し **`bun run build`**（`@t3-oss/env-nextjs` 検証を通す）
- **staging 環境にも `CRON_SECRET` を設定必須** — `proxy.ts` の cron 認証は本番で `CRON_SECRET` 未設定時に 401 を返す。開発環境のみ認証スキップ。staging は明示設定が必要
- **新規 cron route 作成は `scripts/setup-cloud-scheduler.sh` 登録とセット** — route だけ作って Scheduler 登録を忘れると production で発火しない（CI で検出不可）。feature 完了前に `grep <route-name> scripts/setup-cloud-scheduler.sh` でジョブ存在を確認。staging / production デプロイ後に `gcloud scheduler jobs list` でも検証
- **Summary 通知を生成する cron は `hasRecentNotificationOfType` で重複抑制必須** — Cloud Scheduler retry / 手動再実行 / schedule 調整後の重なり走行で同 type の通知が量産される。`src/shared/domain/notifications/commands.ts` の `hasRecentNotificationOfType(type, withinDays)` を cron 冒頭で呼び、true なら `jsonSuccess({ skipped: true, reason: "recent_notification" })` で no-op。`withinDays` は schedule 間隔より 1 日短く（週次 → 6 日）。参照実装: `src/app/api/cron/faq-stale-check/route.ts`
- **Summary 通知は `resourceId` を指定しない** — 個別リソースに紐づかない集約通知（`FAQ_STALE` 等）で `createNotificationCommand` に `resourceType: "xxx"` だけ渡すと dangling になる。代わりに `getNotificationResourceHref(type, resourceType, resourceId)` が第 1 引数 `type` を見て `/admin/faq` 等の集約ビューへルーティングする。`resourceType`/`resourceId` は両方 null にすること
- **`DEFAULT_ROBOTS_TXT` のディレクティブに Tabler Icons プレフィックスが混入していた** — `IconUser-agent` → `User-agent` に修正済み。テンプレートリテラル内の平文テキストに IDE 自動補完でアイコン名が混入するパターン。robots.txt 変更後は `curl -s $URL/robots.txt | head -20` で確認

## ビルド・検証

- **bun:test 環境で `'use cache'` + `cacheLife()` が route handler テスト経由で 500** — `Error: cacheLife() is only available with the cacheComponents config.`（Next.js 16 `'use cache'` の dev 制約）。`next.config.ts` の `cacheComponents: true` が bunfig preload で反映されず、route handler 経由で `'use cache'` query を呼ぶ integration test（`calendar-reservation.test.ts` / `calendar-event.test.ts` の 3 件）が pre-existing failure。本体コード問題ではなく test 環境設定課題
- **`.next/dev/types/{validator.ts,routes.d.ts}` 途切れエラー（TS1434 / TS1128 / TS1005 / TS1011）** — `next typegen` が途中で中断した残骸で `tsc` が失敗する。dev server 稼働中の Stop hook で type-check が初めて走った時に頻発。復旧: `python3 -c "import shutil; shutil.rmtree('.next', ignore_errors=True)"` + `bunx --bun next typegen` → `bun run type-check`
- **Playwright MCP が navigate/close 両方タイムアウトする場合** — HMR 多発後にブラウザセッションがスタックする。dev サーバーを `cmd //c "taskkill /PID <pid> /F /T"` で強制終了→再起動すると Playwright も新セッションで回復する
- **MINGW64 で `bun run X 2>&1 | tail -N` が途中で切り詰められる** — Bash ツール経由のパイプで長い stdout が truncate されるケースがある。長い出力を確実に取得するには `cmd > /tmp/out 2>&1; echo "EXIT:$?"; tail -N /tmp/out` を使う
- **Bash pipeline の `$?` は最後のコマンドの終了コード** — `cmd 2>&1 | tail -N; echo $?` は tail の exit（常に 0）で元コマンドの失敗を見逃す。必ず `cmd > /tmp/out.log 2>&1; echo "EXIT=$?"; tail -N /tmp/out.log` の形式を使う
- **Zod 4: `.merge()` は deprecated** — `.extend(other.shape)` または `z.object({...A.shape, ...B.shape})` に移行する。プロジェクト全体で移行済み
- **Zod 4 `z.string().uuid()` は RFC 9562 version nibble を厳密検証** — `00000000-0000-0000-0000-000000000001` は invalid（3 番目グループ先頭が `[1-8]` 必須、variant bits も `[89abAB]` 要求）。nil UUID と max UUID のみ special case。ハンドクラフトのテストフィクスチャは `11111111-1111-4111-8111-111111111111` のような valid v4 を使う
- **Zod 4: object `.refine()` 後の `.omit()` / `.extend()` は不可** — `.refine()` 適用後は ZodEffects 化するため構造変更メソッドが使えない。対策: base ZodObject（`.refine()` 前）を export し、派生スキーマはそこから `.omit()` / `.extend()` → 最後に `.refine()`。参照実装: `spaceFormBaseSchema` + `spaceFormSchema`（`validations/space.ts`）
- **`z.enum(...).default(X)` + RHF `standardSchemaResolver` は input 型を optional 化** — `.default()` 有りで `z.input` 型が optional として推論されるため、RHF の form value 型が `T | undefined` となり Select/Input の `value` prop に undefined が流入。対処: schema から `.default()` を削除し UI の `defaultValues` で補う
- **Prettier/formatter が複数行化した箇所の Edit 失敗** — 単行 `foo(A, B)` の Write/Edit 後、PostToolUse hook が `foo(\n  A,\n  B,\n)` に整形する。次の `Edit old_string: "foo(A, B)"` は一致せず失敗。対処: 複数行のパターンで `old_string` を構成、または `Grep -n` で実形状を確認してから Edit
- **`global-error.tsx` は Root Layout を完全に置換する** — `<html>` `<body>` を自身で定義するため、admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可。全スタイルをインラインで記述すること（Tailwind クラス禁止）
- **`global-error.tsx` に `@/shared/lib/logger` を import しない** — Client-only バンドルで server-only 依存が混入するリスク。`console.error` を直接使用する
- **layout.tsx 内の `<Suspense fallback={null}>` で children をラップしない** — `loading.tsx` の Suspense boundary を無効化する。children は layout が直接レンダリングし、ページ遷移の loading 表示は `loading.tsx` に委ねる
- **`bun run build` は `@t3-oss/env-nextjs` の検証を有効化**（`SKIP_ENV_VALIDATION` 未設定）— ローカルで env が不足する場合は `bun run build:skip-env`
- **`@t3-oss/env-nextjs` は `process.env` のスナップショット** — `SKIP_ENV_VALIDATION=true` 時、`createEnv()` は `{ ...process.env }` の浅いコピーを返す。テストで `process.env["KEY"] = ...` しても `serverEnv.KEY` に反映されない。テスト可能にしたいコードは `process.env["KEY"]` を直接参照する
- **`git stash pop` 後の `bun run validate` で偽の型エラーが出る** — `validate` は `db:generate` を含むため初回実行で Prisma Client が再生成される。再生成前は `Cannot find module` や `Property does not exist` が大量に出るが、validate 完了後に消える
- **`MutationResult<T>` は `T | MutationError` で `{ data: T }` ラッパーではない** — `executeAdminMutationResult` の成功時戻り値は `T` そのもの。Integration test で `mock.module("@/admin/lib/admin-action", ...)` を書く際に `return { data }` とすると型エラー。mock は `return data;` を直接返す形にする
- **`bun run test:integration` は `&&` チェーンで最初の失敗バッチで停止** — 最初の失敗バッチ以降のテストは実行されない。複数 drift がある場合は「失敗バッチを特定 → 修正 → 再実行」の反復で順次潰す
- **`architecture-boundaries.test.ts` の regex は実装パターン変更時に同時更新必須** — `export { X }` 形式と `export const X = ...` 形式は regex `/export\s+\{\s*X\s*\}/u` vs `/export\s+const\s+X\s*=/u` で非互換
- **dev サーバーは `db:generate` 後も古い Prisma Client を保持** — `schema.prisma` 変更 → `bun run db:generate` しても、稼働中の `next dev` プロセスはメモリに旧 Prisma Client の型を持ったまま。新カラムを select すると `PrismaClientValidationError` で 500 → 公開ページは 404 フォールバック。`cmd //c "taskkill /PID <pid> /F /T"` で強制終了 → `bun dev` で再起動が必須
- **Turbopack チャンク重複は既知の制限** — Lexical core (275KB×3)、Prism.js (168KB×2) 等が admin 内の異なるルートグループ向けに独立チャンクとして生成される（合計 808KB 無駄）。Webpack の `splitChunks` 相当機能が未成熟なため。各ページの First Load JS には影響しない
- **Turbopack ビルドはルート別 JS サイズを表示しない** — `bun run build` 出力の「Total client JS」は全チャンク合計。1 ルートの First Load JS は `.next/server/app/<route>.html` 内の `<script>` 参照チャンクを合計して計算する
- **Turbopack が `¥`（U+00A5）を JSX 属性内でエスケープシーケンスと誤認識** — `placeholder="¥1,000"` 等はビルドエラー（`Invalid unicode escape`）。モジュールレベル定数に `"¥1,000"` で定義し `placeholder={CONST}` で参照する
- **Turbopack HMR がコンポーネント変更を反映しない場合がある** — Playwright MCP で確認する際に古いレンダリングが残る。`?_t=N` パラメータ付きナビゲーションでも解消しない場合は dev サーバー再起動（`bun dev`）が必要
- **Turbopack の server-rendered Client Component bundle が Fast Refresh 後も stale する** — Client Component の className / JSX 構造変更後、client bundle は HMR で更新されるのに server-side module cache が古いまま残り、SSR HTML と client hydrate 結果で差分が出る。対処: ① `netstat -ano | grep :3000` で PID 特定 ② `cmd //c "taskkill /PID <pid> /F /T"` ③ `python3 -c "import shutil; shutil.rmtree('.next', ignore_errors=True)"` ④ `bun dev` 再起動

## Tailwind v4 / Turbopack HMR

- **新規 arbitrary value / variant class が HMR で scan されず未反映になる** — `max-w-[90rem]` / `md:justify-self-end` / `w-max` / `justify-items-start` 等を source file に新規追加すると、Turbopack HMR では Tailwind JIT が再 scan せず、computed style が `auto` / `none` のまま。**解決**: dev server 再起動で全 source を再 scan する
- **複雑な arbitrary value の parse 失敗**: `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]` のような関数内カンマ + ネストは Tailwind JIT で CSS 生成されず `grid-template-columns: "1088px"` 単列にフォールバックするケースあり。**代替**: `grid-cols-3` (= 標準クラスで `repeat(3, minmax(0,1fr))` 展開) + `col-start-*` で明示配置すれば同等効果で HMR 安全
- **Grid item の default は `justify-self: stretch`** — 各 grid item は cell 全幅に stretch されるため、子 wrapper への `mx-auto` / `ms-auto` は wrapper 幅固定前提のため効果なし。**公式パターン**: container に `justify-items-start` で default を明示 + 中央・右端の item に個別 `md:justify-self-center` / `md:justify-self-end` で override
