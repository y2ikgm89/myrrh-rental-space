---
paths: ["e2e/**", "playwright.config.ts", "playwright/**"]
---

# E2E（Playwright）

## project 構成と実行

- 14 project: setup-customer / setup-admin / chromium-smoke（e2e/smoke）/
  chromium（e2e/public + e2e/a11y）/ chromium-mobile / webkit-mobile /
  chromium-customer / chromium-customer-mobile / webkit-customer-mobile /
  chromium-admin / chromium-admin-viewer（e2e/authenticated/admin-viewer）/
  chromium-admin-mobile / webkit-admin-mobile /
  chromium-visual（e2e/visual）。mobile / webkit 系 6 project は opt-in。
- CI の毎 push required gate は chromium-smoke のみ（APP_SURFACE=public と admin の 2 回）。
  広域 E2E・visual・Lighthouse は opt-in。opt-in 条件は「`codex/full-ci/` prefix の PR
  branch」または workflow_dispatch だが、**prefix 経路の起動実績はゼロ**
  （2026-07-31 時点、PR #673〜#1679 を走査）。実質 manual dispatch 専用と考え、
  `gh workflow run ci.yml --ref <branch> -f run_full_ci=true` で明示的に回す。
  **PR を出すだけでは広域 E2E は走らない**
- webServer は migrate → seed →（ローカルのみ production build）→ next start を毎回実行し
  `reuseExistingServer: false`。ポート 3000 の dev サーバーとは共存不可・初回起動は長い
- playwright.config.ts は `__tests__/unit/architecture/playwright-e2e-webserver-env.test.ts`
  に文字列レベルで pin されている。config 変更時はこの unit テストも更新・実行する
  （SKIP_ENV_VALIDATION の追加はテストが禁止）
- **`e2e/**` は CommonJS として実行される**。Playwright は ESM/CJS を Node のセマンティクス
  （拡張子 + 最寄り package.json の `type`）で決め、tsconfig の `module` は無視する
  （解釈されるのは allowJs / baseUrl / paths / references / extends のみ）。
  本 repo の package.json に `"type"` は無いため、`e2e/**` に `import.meta` を持ち込むと
  `SyntaxError: Cannot use 'import.meta' outside a module` で **テストが 1 件も起動しない**。
  Prisma 生成 client はこのため `moduleFormat = "cjs"` で生成する
  （gate: `__tests__/unit/architecture/prisma-client-module-format.test.ts`）

## 書き方の規約（ESLint が機械強制）

- 禁止: `page.waitForTimeout` / `waitForLoadState("networkidle")` / `page.waitForURL` /
  `if ((await x.count()) > 0)` 条件アサーション
- 待機は web-first assertion で行う: `expect(locator).toBeVisible()`、
  ナビゲーション確定は `expect(page).toHaveURL()`（soft/hard 両対応）
- ロケーターは `getByRole` 優先（heading/tab/textbox/button/gridcell 等）
- 命名: `e2e/**/*.spec.ts`（smoke は `*.smoke.spec.ts`）。`*.test.ts` を e2e 配下に
  作らない（どのランナーにも拾われない/誤収集の原因）

## 認証・時刻・並列

- 認証は setup project + storageState（`playwright/.auth/*.json`）。
  admin は cookie ではなく IAP 模擬（ADMIN_TEST_IAP_EMAIL）で成立している
- **admin の role を切り替えたいときは専用 project を足す**。`chromium-admin-viewer`
  のように `extraHTTPHeaders: { "x-e2e-admin-identity": "<label>" }` を付けると
  専用ユーザーとして解決される（ラベル→email の SSoT は
  `src/shared/domain/admin-auth/e2e-identity.ts`、upsert は
  `scripts/e2e/ensure-admin-user.ts`、drift gate は
  `__tests__/unit/architecture/e2e-admin-identity-sync.test.ts`）。
  **共有 User 行の `role` を実行時に書き換えてはいけない** — `fullyParallel: true` +
  2 workers では他 spec に漏れ、`settings.spec.ts` の権限カードが消える /
  RBAC spec の拒否が出ない、という双方向の偽陽性になる（CI run 30577092619）
- ブラウザ時刻の凍結は `page.clock.install({ time })` を **page.goto より前**に呼び、
  サーバー側 `E2E_FIXED_NOW_ISO`（既定 2026-07-04T03:00:00.000Z）と同一時刻にする
- fullyParallel のため、Settings 等シングルトン行を mutate する describe は
  `test.describe.serial` で直列化する
- APP_SURFACE はローカル既定 admin。public surface 限定テストは `APP_SURFACE=public` を明示

## visual regression

- 実行に `PLAYWRIGHT_VISUAL=1` が必須（無しだと全テスト skip のまま緑になる）
- 外部由来の描画ゆらぎは spec 側で断つ。現状 abort しているのは
  **Cloudflare Turnstile のみ**（外部 iframe の読込タイミングで contact の高さが変動する）
- **画像を route で差し替えない**。seed の画像は全て `/images/seed/*.svg` のローカル SVG で、
  `dangerouslyAllowSVG` 未設定のため Next は SVG を optimizer に通さず素で配信する
  （`next/dist/shared/lib/get-img-props.js` の `unoptimized = true` 分岐）。
  対象ページは `/_next/image` を一度も叩かないので差し替えても効果ゼロ、
  実画像の回帰検出力を落とすだけになる
- full-page は hydration と lazy 画像の描画で収束が遅い。既定の expect timeout（5s）は
  短すぎて「ページは正常なのに fail」を生むため、`toHaveScreenshot` に
  `timeout` を明示する（現行 20s）
- **baseline は CI Ubuntu runner の `*-linux.png` のみ**を commit する。Windows /
  macOS ローカルで `--update-snapshots` した結果を commit しない（CI が必ず落ちる）
- 再生成は `workflow_dispatch` の `update_visual_baseline=true`。CI が
  `ci/visual-baseline-<run_id>` branch と auto-PR を作る
- **auto-PR には required checks が付かない**。`GITHUB_TOKEN` で作られた PR は
  GitHub の再帰防止により `pull_request` workflow を起動しないため、CodeQL 以外の
  checks が永久に未実行のまま BLOCKED になる。PR を close → reopen するか、
  同 branch の内容で人間名義の PR を作り直して checks を通すこと
  （恒久解は PAT / GitHub App token の導入だが secret 追加が必要）
- ローカルで CI と同じ描画を得たいときは Playwright 公式 Docker イメージ
  （`mcr.microsoft.com/playwright:v1.61.1-noble`）を使う

## seed 契約

spec は `prisma/seed.ts` の fixture（slug・予約ステータス等）と
`e2e/fixtures/test-data.ts` で二重定義結合している。seed 変更は fixture/spec の同時更新必須。
