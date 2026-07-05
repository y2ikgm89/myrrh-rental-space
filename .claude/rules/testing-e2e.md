---
paths: ["e2e/**", "playwright.config.ts", "playwright/**"]
---

# E2E（Playwright）

## project 構成と実行

- 7 project: setup-customer / setup-admin / chromium-smoke（e2e/smoke）/
  chromium（e2e/public + e2e/a11y）/ chromium-customer / chromium-admin /
  chromium-visual（e2e/visual）
- CI の毎 push required gate は chromium-smoke のみ（APP_SURFACE=public と admin の 2 回）。
  広域 E2E・visual・Lighthouse は opt-in（full CI dispatch）
- webServer は migrate → seed →（ローカルのみ production build）→ next start を毎回実行し
  `reuseExistingServer: false`。ポート 3000 の dev サーバーとは共存不可・初回起動は長い
- playwright.config.ts は `__tests__/unit/architecture/playwright-e2e-webserver-env.test.ts`
  に文字列レベルで pin されている。config 変更時はこの unit テストも更新・実行する
  （SKIP_ENV_VALIDATION の追加はテストが禁止）

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
- baseline 更新は意図した視覚変更のみ:
  `PLAYWRIGHT_VISUAL=1 bunx playwright test e2e/visual --update-snapshots`
- Windows ローカルは `*-win32.png` と比較され、CI canonical は `*-linux.png`

## seed 契約

spec は `prisma/seed.ts` の fixture（slug・予約ステータス等）と
`e2e/fixtures/test-data.ts` で二重定義結合している。seed 変更は fixture/spec の同時更新必須。
