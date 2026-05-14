---
description: Playwright E2E の基本構造、認証ヘルパー、条件付きスキップ、path verify、待機、レスポンシブ、UI モード、Next.js App Router Gotchas
paths:
  - e2e/**
  - playwright.config.ts
---

# Playwright E2E テスト

> 基本構造 + 認証 + 条件付き skip + path verify + 待機パターン + レスポンシブ + UI モード + Next.js App Router 互換 Gotchas。

## Smoke vs 広域 E2E の責務分離（最重要）

業界標準（Stripe / Vercel / Linear / Shopify）に倣い、E2E spec を 2 層に分離する:

| 層            | 場所                               | trigger                                 | 目的                                                                             |
| ------------- | ---------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| **Smoke E2E** | `e2e/smoke/*.smoke.spec.ts`        | 毎 push（required）                     | critical path ゲート: 5xx / 404 / redirect loop / WCAG critical 違反のみ即時検出 |
| **広域 E2E**  | `e2e/{public,authenticated,a11y}/` | PR `e2e` label opt-in                   | 機能カバレッジ・回帰検出。seed 前提でユーザーストーリーを再現                    |
| **Visual**    | `e2e/visual/`                      | PR `visual-regression` label / dispatch | screenshot baseline 比較                                                         |

### Smoke spec の規律（厳格）

- **空 DB で 200 OK で描画される URL のみ対象** — 認証必須 / seed データ必須 page は smoke に含めない
- **test 数 ≤ 10、実行時間 < 3 分** — 超過した場合は smoke の意義（fast PR feedback）が崩壊
- **failure rate ~0% 目標** — flake / seed drift 由来の偽陽性禁止、smoke fail = 本質 regression のみ
- **assertion は smoke level に絞る** — `expect(response.status()).toBe(200)` + `expect(page.locator("main")).toBeVisible()` + メタ要素確認程度。複雑な機能フローは広域 E2E へ
- **seed dependency 禁止** — `test.skip(true, "データがありません")` パターン全面禁止、smoke で skip が出る spec は smoke 失格
- **Playwright project**: `chromium-smoke`（`playwright.config.ts`）、`testMatch: /e2e\/smoke\/.*\.smoke\.spec\.ts/`
- **CI**: workflow の `smoke-e2e` job が `bunx playwright test --project=chromium-smoke` を毎 push 実行、branch protection required status checks に含める

参照実装: `e2e/smoke/homepage.smoke.spec.ts` / `auth.smoke.spec.ts` / `spaces.smoke.spec.ts` / `reservation.smoke.spec.ts` / `a11y.smoke.spec.ts`

### 公開ページ UI 編集後の a11y 事前検証（broad E2E flake 予防）

公開ページ (`src/app/(public*)/**`) の hero / image overlay / archive list / 配色 token (`public.css` の `--color-*`) を編集した後は、commit 前に **`audit-a11y` skill** で Playwright MCP axe-core 実機検証を推奨。

**理由**: CI 広域 E2E は **opt-in** (`e2e` label、1h20m+) のため、a11y violation が main merge 後の別 PR でしか発覚しないリスクがある。`audit-a11y` は dev server に対し axe-core scan + incomplete 検出 (production violation 昇格リスク判定) + HMR fresh fetch 検証を 1 セッションで実行する canonical workflow。

**典型的な未然発見可能 flake**:

- `bgGradient` incomplete (hero gradient bg + 配下 text element) → production で violation 昇格
- `bgOverlap` incomplete (隣接 absolute button hit area 重なり)
- `bgImage` incomplete (image overlay text の alpha scrim / image load timing 偽陽性)
- token computed contrast の WCAG AA 不達 (`--color-muted-foreground` / `--color-accent` の oklch 値)

実例: 2026-05-15 PR #31/#32 で photo credit flake (1.06:1) / muted-foreground WCAG 不達 (3.32:1) / hero gradient bgGradient incomplete を編集セッション内で発見できず、main merge 後に別 PR で対応した反省から導入。詳細は `.claude/skills/audit-a11y/SKILL.md`、検出パターンの canonical fix は `.claude/rules/frontend/accessibility/images-text.md` §image overlay text の axe-definitive contrast / `frontend/design-config/foundations.md` §カラーパレット (WCAG AA 達成ライン)。

### 広域 E2E の defensive skip 禁止

```typescript
// NG: seed 状態依存の runtime skip — spec 機能不全の温床
const articles = page.locator("article");
if ((await articles.count()) === 0) {
  test.skip(true, "ブログ記事が存在しません"); // ← 禁止
  return;
}

// OK: seed.ts で固定の test fixture を用意し直接 URL で検証
import { urls } from "../fixtures";
test("ブログ記事詳細ページが描画される", async ({ page }) => {
  await page.goto(`${urls.posts}/test-published-post`); // seed で必ず存在
  await expect(page.locator("article h1")).toBeVisible();
});
```

**判定基準**:

- 「seed にデータがあれば検証する」spec は実テストとして機能していない（CI で skip だけ積み上がる）
- 必要 seed が存在しない場合は **`prisma/seed.ts` を拡張**（dev customer に固定 reservation を seed する等）、または **unit/integration test に降格**（Zod schema / Server Action テスト）
- 1 ファイルで 5 件以上の `test.skip(true, ...)` がある spec は削除候補
- 監査 grep: `grep -rcE 'test\.skip\(true' e2e/ | awk -F: '{ if ($2 > 5) print }'`

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
