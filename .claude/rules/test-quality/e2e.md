---
paths:
  - "e2e/**/*.ts"
  - "playwright.config.ts"
---

# E2E（Playwright）規約

Playwright 公式準拠の SSoT。後方互換性は持たせず、ここに反する書き方は ESLint で機械ブロックする。

## 設定の SSoT（`playwright.config.ts`）

- `fullyParallel: true` ＋ `workers > 1` を維持する。直列化（`workers: 1`）は禁止。
  - "DB 競合" は per-test の unique data 生成（`reservationFactory.build()` 等の factory が `Date.now()-N` で生成）と `test.describe.serial(...)` の局所適用で解決する。グローバル直列化で隠蔽しない。
  - DB 状態を共有してしまうごく一部の admin spec のみ、当該 describe を `test.describe.serial(...)` で隔離する。
- `baseURL` は `PLAYWRIGHT_BASE_URL` env を SSoT、ハードコード禁止。
- 認証は **storage state + setup project** パターンのみ（[公式](https://playwright.dev/docs/auth)）。`beforeEach` でログインし直す anti-pattern は使わない。
- spec 配置は **必ず下記の 5 ディレクトリ**いずれかに置く（ルート直下禁止）:
  - `e2e/smoke/*.smoke.spec.ts` — `chromium-smoke` project（必須 PR gate、< 3 分）
  - `e2e/public/*.spec.ts` — 未認証 / 公開ページ
  - `e2e/authenticated/customer/*.spec.ts` — 顧客認証済
  - `e2e/authenticated/admin/*.spec.ts` — 管理者認証済
  - `e2e/a11y/*.spec.ts` / `e2e/visual/*.spec.ts` — 専用 project
  - 補助: `e2e/auth/` setup, `e2e/fixtures/`, `e2e/helpers/`
- spec の `webServer` は `bun run start`（CI）/ `bun run dev`（local）を `process.env.CI` で分岐。

## 禁止パターン（ESLint で機械ブロック）

| パターン                                                            | 理由（公式）                                                                                                    | 代替                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `page.waitForTimeout(N)`                                            | 公式: **"discouraged for production use ... inherently flaky"**                                                 | `expect(locator).toBeVisible()` 等の web-first assertion（auto-retry）             |
| `page.waitForLoadState("networkidle")`                              | 公式: **"DISCOURAGED. Don't use this method for testing, rely on web assertions to assess readiness instead."** | 必要な要素に `expect(...).toBeVisible()` / `toHaveURL()` 等で待つ                  |
| `if ((await x.count()) > 0) await expect(x).toBeVisible()`          | 要素が無い場合 silent pass する偽 coverage                                                                      | DB seed を前提に決定論的 assertion、または `test.skip()` / spec 削除               |
| `page.waitForURL(url)`                                              | default `waitUntil: "load"` は App Router の soft navigation で load event 不発火＝silent timeout               | `await expect(page).toHaveURL(url)` 一択                                           |
| CSS / type selector (`input[type="email"]`, `input#email`, `text=`) | strict mode violation や i18n 変更脆性、可読性低                                                                | `getByLabel("メールアドレス")` / `getByRole("textbox", {name})` / `getByText(...)` |

## 推奨パターン（公式 user-facing locators）

```ts
// ✅ 公式推奨（user-facing locator ＋ web-first assertion）
await page.getByLabel("メールアドレス").fill(email);
await page.getByLabel("パスワード").fill(password);
await page.getByRole("button", { name: "ログイン", exact: true }).click();
await expect(page).toHaveURL(urls.adminDashboard, { timeout: 15000 });
await expect(page.getByText("予約を受け付けました")).toBeVisible();

// ❌ 禁止（CSS / type / id selector / 時間待ち）
await page.locator('input[type="email"]').fill(email);
await page.locator("input#password").fill(password);
await page.click('button[type="submit"]');
await page.waitForLoadState("networkidle");
await page.waitForURL(urls.adminDashboard);
await page.waitForTimeout(500);
```

`exact: true` は `<DevLoginButton>`（`NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` 時にレンダリングされる「SUPER_ADMIN でログイン」ボタン）と partial match で strict mode violation を起こすケースで必須。

## console error は positive allow-list で検査

```ts
// ✅ 観測したエラーをすべて事前定義した「許容パターン」と突合
const ALLOWED = [/Failed to load resource.*favicon/, /Cookie .* rejected/];
const errors: string[] = [];
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  if (ALLOWED.some((re) => re.test(msg.text()))) return;
  errors.push(msg.text());
});
await page.goto(urls.home);
expect(errors).toEqual([]);

// ❌ 除外リスト方式（真エラーまで silent pass）
const errors = consoleErrors.filter(
  (e) => !e.includes("hydration") && !e.includes("Warning"),
);
expect(errors.length).toBe(0);
```

## fixture / factory 規約

- **テストデータは `e2e/fixtures/factories.ts` の factory に一本化**。`testReservations` / `testSpaces` 等の静的フィクスチャは禁止（並列衝突を起こす）。
- 並列実行で衝突するフィールド（email / phone / slug）は factory 内の `uniqueEmail()` / `uniquePhone()` / `uniqueSlug()` で生成する。
- `testUsers.admin` と `urls` だけは静的フィクスチャ OK（seed が SSoT）。

## smoke と broad の責務分離

- `e2e/smoke/*.smoke.spec.ts` は「URL 到達性 + main 描画」のみ。1 file < 5 test。
- `e2e/public/*.spec.ts` は「機能（フォーム送信成功 / バリデーション / 主要 CTA）」を網羅。
- **perf / LCP / pageerror 観測は Lighthouse CI と Sentry に委譲**。E2E で計測しない（環境差で flake）。
- console.error の "ない" を assert する場合は、許容パターンを **正の許可リスト**で書く（除外リスト方式は真エラーまで silent pass する）。

## 認証セットアップの規約

- `e2e/auth/customer.setup.ts` / `admin.setup.ts` で 1 度だけ実行、`playwright/.auth/*.json` に永続化。
- helper は `e2e/helpers/` 配下のみ。spec から `prisma` を直 import しない。
- `x-forwarded-for` rotation 等の rate-limit 迂回 hack は最終手段。本来は E2E 専用 env / cookie で迂回設計するほうが production code と疎結合。

## 反例（過去発生した anti-pattern と SSoT）

| 発生箇所                                                  | アンチパターン                                                  | 修正                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `public/admin-auth-flow.spec.ts`（旧 `e2e/auth.spec.ts`） | `input[type="email"]` 連発                                      | `getByLabel("メールアドレス")` 化                                   |
| `e2e/reservation.spec.ts`（削除済）                       | `waitForTimeout(500)` を時間スロットの遷移待ちに使用            | `expect(timeSlot).toBeEnabled()` で auto-retry                      |
| `public/homepage.spec.ts`                                 | `if ((await spacesLink.count()) > 0) ...`                       | seed 前提で常に存在＝条件分岐削除                                   |
| `public/homepage.spec.ts`                                 | `consoleErrors.filter(e => !e.includes("hydration"))`           | 真エラーまで pass する除外方式禁止（上記 positive allow-list 参照） |
| `authenticated/admin/settings.spec.ts`                    | グローバル Setting シングルトンの mutation が並列 worker と衝突 | `test.describe.serial("...", () => { ... })` で局所直列化           |

## 関連

- 公式 docs: https://playwright.dev/docs/best-practices
- 認証 setup: https://playwright.dev/docs/auth
- web-first assertions: https://playwright.dev/docs/test-assertions
