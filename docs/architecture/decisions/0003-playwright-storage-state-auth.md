# 0003. Playwright E2E 認証を storage state + setup project に移行

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: testing, e2e, performance

## Context and Problem Statement

Playwright E2E の初期実装は各テストで `loginAsAdmin()` / `devLoginAction()` を個別に呼び出していた:

```ts
test.beforeEach(async ({ page }) => {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard);
});
```

このパターンは以下の問題があった:

- 各テストでログインを繰り返し、600+ tests での累積オーバーヘッドが大きい
- Customer Social Auth（Google / LINE OAuth）の E2E 認証が困難
- Playwright 公式推奨の `storageState` パターンを活用していない
- テスト種別（未認証 / customer 認証済み / admin 認証済み）の project 分離がない

## Decision Drivers

- Playwright 公式推奨の setup project + storageState 再利用パターン
- 認証オーバーヘッドの削減（ログイン 1 回 / 全テスト で再利用）
- Customer / Admin / 未認証の 3 種類のテスト隔離
- 既存 600+ tests を破壊せず段階的移行

## Considered Options

1. **Option A: 現状維持（per-test ログイン）**
2. **Option B: Playwright global setup で storage state を 1 回だけ作成**
3. **Option C: setup project + dependencies + storageState**

## Decision Outcome

**Chosen option**: "Option C — setup project + dependencies + storageState"

Playwright 公式ベストプラクティスに完全準拠した実装:

### 1. `e2e/auth/customer.setup.ts` / `admin.setup.ts`

認証を 1 度だけ実行し、`playwright/.auth/{customer,admin}.json` に storage state を永続化:

```ts
// customer.setup.ts
setup("authenticate as customer", async ({ page }) => {
  await page.goto(urls.customerLogin);
  await page.getByRole("button", { name: /テスト顧客でログイン/i }).click();
  await page.waitForURL("**/mypage");
  await page.context().storageState({ path: customerAuthFile });
});
```

Admin 側は `/admin/login` に admin gate があるため、setup project では gate 自体を再検証しない。Playwright helper で `admin-gate` cookie を事前投入し、E2E 用 admin credential user を自動 upsert したうえで UI ログインして storage state を作る。gate 本体の正否は unit test (`proxy-admin-gate.test.ts`) を正本とする。

### 2. `playwright.config.ts` の 6 project 構成

```ts
projects: [
  { name: "setup-customer", testMatch: /e2e\/auth\/customer\.setup\.ts/ },
  { name: "setup-admin", testMatch: /e2e\/auth\/admin\.setup\.ts/ },
  {
    name: "chromium", // 未認証
    testIgnore: [/auth\/.*\.setup\.ts/, /authenticated\/.*/, /visual\/.*/],
  },
  {
    name: "chromium-customer", // 顧客認証済み
    use: { storageState: "playwright/.auth/customer.json" },
    dependencies: ["setup-customer"],
    testMatch: /e2e\/authenticated\/customer\/.*\.spec\.ts/,
  },
  {
    name: "chromium-admin", // 管理者認証済み
    use: { storageState: "playwright/.auth/admin.json" },
    dependencies: ["setup-admin"],
    testMatch: /e2e\/authenticated\/admin\/.*\.spec\.ts/,
  },
  {
    name: "chromium-visual", // Visual regression (opt-in)
    testMatch: /e2e\/visual\/.*\.spec\.ts/,
  },
];
```

### 3. `e2e/authenticated/{customer,admin}/` ディレクトリ構造

認証済み state で実行する新規テストは `e2e/authenticated/` 配下に配置。既存 `e2e/admin/*` / `e2e/public/*` は破壊しない。

### 4. `.gitignore` に `playwright/.auth/` 追加

認証 token の漏洩防止。

### Consequences

**良い点**:

- Playwright 公式パターンに完全準拠
- 認証オーバーヘッド削減: 1 度のログインで全 test が再利用
- 3 種類の test project 隔離で意図が明確化
- 既存 600+ tests は `chromium` project で継続動作
- 新規認証済み test（30+ 件）を簡潔に記述可能
- Customer Social Auth E2E が dev login button 経由で現実的になった

**悪い点 / トレードオフ**:

- `setup-customer` / `setup-admin` が失敗すると全 dependent test が実行不可
- `playwright/.auth/*.json` の管理が必要（.gitignore 必須）
- project 構成の複雑化（テスト設計者が 6 project を理解する必要）

### Compliance / Validation

- `playwright.config.ts` の project 構成で強制
- `chromium-customer` / `chromium-admin` は `setup-customer` / `setup-admin` への `dependencies` で順序保証
- `.gitignore` の `playwright/.auth/` エントリで誤コミット防止
- `ADR-0003`（本 ADR）でパターン恒久化

## Pros and Cons of the Options

### Option A: 現状維持（per-test ログイン）

- ✅ 追加作業なし
- ❌ 実行時間の累積オーバーヘッド
- ❌ Customer Social Auth E2E が困難

### Option B: Global setup で storage state 1 回作成

- ✅ シンプル
- ❌ setup 失敗時のエラーハンドリングが弱い
- ❌ 複数種類の認証（customer / admin）を扱いづらい

### Option C: setup project + dependencies ✅ 採用

- ✅ Playwright 公式推奨、複数 state 対応
- ✅ dependencies で依存順序明示
- ⚠️ 構成の複雑化は受容

## Links / README

- [Playwright Authentication 公式ドキュメント](https://playwright.dev/docs/auth)
- [Playwright Test Projects 公式ドキュメント](https://playwright.dev/docs/test-projects)
- 実装: `playwright.config.ts`, `e2e/auth/*.setup.ts`, `e2e/authenticated/**`
- 関連: `CLAUDE.md`, `CONTRIBUTING.md`
