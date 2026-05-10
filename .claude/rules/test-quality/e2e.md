---
description: Playwright E2E の基本構造、認証ヘルパー、条件付きスキップ、path verify、待機、レスポンシブ、UI モード、Next.js App Router Gotchas
paths:
  - e2e/**
  - playwright.config.ts
---

# Playwright E2E テスト

> 基本構造 + 認証 + 条件付き skip + path verify + 待機パターン + レスポンシブ + UI モード + Next.js App Router 互換 Gotchas。

## 基本構造

```typescript
import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

test.describe("機能名", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("ユーザーストーリーを説明", async ({ page }) => {
    await page.goto(urls.adminNews);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("ニュース");
  });
});
```

## 認証ヘルパー

```typescript
async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}
```

## 条件付きスキップ

```typescript
test("編集ページが表示される", async ({ page }) => {
  const editButton = page.locator('a:has-text("編集")').first();

  if ((await editButton.count()) === 0) {
    test.skip(true, "データが存在しません");
    return;
  }

  await editButton.click();
  // ...
});
```

## spec 作成時の path verify 必須

E2E spec 内の `page.goto("/admin/...")` 等の path は、推測ではなく **実 page.tsx を Glob で確認してから記述**する。

```typescript
// NG: 推測 path → /admin/login へ silent redirect → `[contenteditable="true"]` timeout
const NEW_POST_PATH = "/admin/blog/new"; // 実体は /admin/posts/new

// OK: Glob `src/app/(admin)/admin/(dashboard)/posts/new/**/*.tsx` で実 page.tsx 確認後に記述
const NEW_POST_PATH = "/admin/posts/new";
```

silent fail の症状: spec が generic locator (`[contenteditable="true"]` 等) を待つが、未認証 redirect 先 `/admin/login` に該当要素がなく timeout。setup-admin で auth state 適用済みでも、誤 path は admin gate / proxy.ts のリダイレクト rule で fallthrough する。

## 待機パターン

```typescript
// ネットワーク完了を待機
await page.waitForLoadState("networkidle");

// 特定要素の表示を待機
await expect(page.locator("text=保存しました")).toBeVisible({
  timeout: 10000,
});

// アニメーション待機
await page.waitForTimeout(300);

// URL変更を待機
await page.waitForURL(urls.adminNews, { timeout: 10000 });
```

## レスポンシブテスト

```typescript
test("モバイルでも表示される", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(urls.adminNews);

  await expect(page.locator("h1")).toContainText("ニュース");
});
```

## UI モード（デバッグ）

E2E テスト失敗時はまず UI モードで原因を特定する:

```bash
bun run e2e:ui                        # 対話的実行（ステップ実行・スクリーンショット確認）
PWDEBUG=1 bun run e2e                 # ブレークポイントで一時停止
```

- **ステップ実行**: 各アクションを 1 操作ずつ確認
- **スクリーンショット**: 失敗時の画面状態と DOM 確認
- **ネットワーク**: リクエスト/レスポンスの内容確認
- **Trace Viewer**: `playwright show-trace trace.zip` でオフライン再生可

## Playwright × Next.js App Router Gotchas

- **`page.waitForURL` は App Router soft navigation で `net::ERR_ABORTED`** — `router.push` は `load` event を発火しないため `waitForURL`（default `waitUntil: "load"`）が timeout / detach error。canonical: `await row.click(); await expect(page).toHaveURL(pattern, { timeout: 10000 })` の URL polling。`Promise.all([waitForURL, click])` も同問題で危険
- **`row.click()` の center が `stopRowClick` cell に落ちる** — `ClickableTableRow` を test で click する際、center 位置が CheckboxCell / Email / ActionDropdown 等の `stopRowClick` cell に当たると `e.stopPropagation()` で navigation 阻害。canonical: `row.locator("td").nth(2).click()` で name cell（非 stop）を明示ターゲット。列順前提を docstring に書く
- **`useEffect` + `router.replace` の URL cleanup 検証は `toHaveURL` 必須** — `await page.waitForTimeout(500); expect(page.url()).not.toContain("foo")` は React commit phase + async router.replace と race。canonical: `await expect(page).toHaveURL(/^(?!.*foo).*\/path/, { timeout: 5000 })` の polling + 否定 lookahead
- **`page.getByRole("dialog").getByText(literal)` の strict mode 違反** — DialogTitle (`<h2>`) と body / footer の placeholder 文言が同一 substring を含むと両マッチで `strict mode violation`。canonical: `dialog.getByRole("heading", { name: "..." })` で role narrow、または `{ exact: true }` で完全一致
