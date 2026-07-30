---
paths: ["e2e/**", "playwright.config.ts", "playwright/**"]
---

# E2E（Playwright）

## project 構成と実行

- 13 project: setup-customer / setup-admin / chromium-smoke（e2e/smoke）/
  chromium（e2e/public + e2e/a11y）/ chromium-mobile / webkit-mobile /
  chromium-customer / chromium-customer-mobile / webkit-customer-mobile /
  chromium-admin / chromium-admin-mobile / webkit-admin-mobile /
  chromium-visual（e2e/visual）。mobile / webkit 系 6 project は opt-in。
- CI の毎 push required gate は chromium-smoke のみ（APP_SURFACE=public と admin の 2 回）。
  広域 E2E・visual・Lighthouse は opt-in（full CI dispatch）
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
- ブラウザ時刻の凍結は `page.clock.install({ time })` を **page.goto より前**に呼び、
  サーバー側 `E2E_FIXED_NOW_ISO`（既定 2026-07-04T03:00:00.000Z）と同一時刻にする
- fullyParallel のため、Settings 等シングルトン行を mutate する describe は
  `test.describe.serial` で直列化する
- APP_SURFACE はローカル既定 admin。public surface 限定テストは `APP_SURFACE=public` を明示

## visual regression

- 実行に `PLAYWRIGHT_VISUAL=1` が必須（無しだと全テスト skip のまま緑になる）
- **hermetic が前提**。spec は `/_next/image` を固定 PNG に差し替え、Turnstile の
  外部読込を abort する。CI の `R2_PUBLIC_URL` はダミー（`https://example.com`）で、
  Next image optimizer が実際に外部取得しに行くため、これが無いと full-page の高さが
  実行ごとに揺れて baseline を更新しても収束しない
- **baseline は CI Ubuntu runner の `*-linux.png` のみ**を commit する。Windows /
  macOS ローカルで `--update-snapshots` した結果を commit しない（CI が必ず落ちる）
- 再生成は `workflow_dispatch` の `update_visual_baseline=true`。CI が別 branch +
  auto-PR を作るので、required checks を通してから merge する
- ローカルで CI と同じ描画を得たいときは Playwright 公式 Docker イメージ
  （`mcr.microsoft.com/playwright:v1.61.1-noble`）を使う

## seed 契約

spec は `prisma/seed.ts` の fixture（slug・予約ステータス等）と
`e2e/fixtures/test-data.ts` で二重定義結合している。seed 変更は fixture/spec の同時更新必須。
