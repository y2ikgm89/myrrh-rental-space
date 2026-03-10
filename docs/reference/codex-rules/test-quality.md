---
paths:
  - __tests__/**
  - e2e/**
---

# テスト品質ルール

> Bun Test / Playwright E2E対応

## テスト分類

| 種類        | フレームワーク | 場所                     | 用途                 |
| ----------- | -------------- | ------------------------ | -------------------- |
| Unit        | Bun Test       | `__tests__/unit/`        | 関数・ユーティリティ |
| Integration | Bun Test       | `__tests__/integration/` | Server Actions・API  |
| E2E         | Playwright     | `e2e/`                   | ユーザーフロー       |

## Bunテスト（Unit/Integration）

### 基本構造

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("機能名", () => {
  beforeAll(() => {
    // セットアップ
  });

  afterAll(() => {
    // クリーンアップ
  });

  test("期待する動作を説明", () => {
    const result = someFunction();
    expect(result).toBe(expected);
  });
});
```

### 環境変数のモック

```typescript
describe("crypto", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "test-key";
  });

  afterAll(() => {
    if (originalKey) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });
});
```

### Server Actionsテスト

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockGetSession = mock(() => null);
mock.module("@/shared/lib/auth", () => ({ getSession: mockGetSession }));

const { createNews } = await import("@/admin/actions/news");

describe("createNews", () => {
  beforeEach(() => {
    // Bun は mock.mockReset() を使用（vi.restoreAllMocks() は Vitest API で Bun では不可）
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ user: ADMIN_USER });
  });

  test("管理者は作成できる", async () => {
    const result = await createNews(validData);
    expect(result.success).toBe(true);
  });

  test("未認証はエラー", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await createNews(validData);
    expect(result.success).toBe(false);
  });
});
```

## Bun Test 型安全パターン

`noUncheckedIndexedAccess` / `strict` 有効環境での Bun テスト固有の型制約と対処法。

### 1. `mock()` の空配列型推論

Bun の `mock()` は引数から戻り値型を推論する。空配列 `[]` は `never[]` と推論されるため、後から `mockResolvedValue([{ id: 'x' }])` を呼ぶと TS2322 になる。

```typescript
// NG: never[] 推論 → mockResolvedValue([{ pageId: 'x' }]) がエラー
const mockFindMany = mock(() => Promise.resolve([]));

// OK: 型引数で明示
const mockFindMany = mock<() => Promise<{ pageId: string }[]>>(() =>
  Promise.resolve([]),
);
```

### 2. `toContain` の要素型制約

`expect(arr).toContain(value)` は `arr` の要素型と `value` の型が一致している必要がある。
`Object.values()` の戻り値（`SomeEnum[]`）に `string` を `toContain` すると型不一致になる。

```typescript
// NG: SectionType[] に string を toContain → TS2345
expect(Object.values(SectionType)).toContain("HERO");

// OK: string[] に変換してから
const sectionTypeValues: string[] = Object.values(SectionType);
expect(sectionTypeValues).toContain("HERO");
```

### 3. `toEqual` の型一致要件

`expect(a).toEqual(b)` も型が一致している必要がある。const 配列と型付き配列の比較では型注釈を付ける。

```typescript
// NG: string[] と CustomerStatus[] の比較 → TS2769
expect(CUSTOMER_STATUSES.sort()).toEqual(
  ["NEW", "REGULAR", "VIP", "INACTIVE", "BLACKLIST"].sort(),
);

// OK: 明示的な型注釈
const expectedStatuses: CustomerStatus[] = [
  "NEW",
  "REGULAR",
  "VIP",
  "INACTIVE",
  "BLACKLIST",
];
expect(CUSTOMER_STATUSES.sort()).toEqual(expectedStatuses.sort());
```

### 4. `toPlainObject<T>: T` の型 vs ランタイム不一致

`toPlainObject` の返り型は `T`（入力の型をそのまま保持）だが、ランタイムでは `Date → string` 変換・Symbol 除去・関数除去が行われる。型と実態が乖離するため `unknown` 経由でアクセス。

```typescript
// NG: result.createdAt の型は Date だが実行時は string → toBe('2024-...') で型エラー
const result = toPlainObject({
  createdAt: new Date("2024-01-15T10:30:00.000Z"),
});
expect(result.createdAt).toBe("2024-01-15T10:30:00.000Z");

// OK: unknown 経由でアクセス
const result = toPlainObject({
  createdAt: new Date("2024-01-15T10:30:00.000Z"),
});
const createdAt: unknown = result.createdAt;
expect(createdAt).toBe("2024-01-15T10:30:00.000Z");

// OK: Symbol プロパティ除去の検証
const plain: unknown = result;
expect(plain).toEqual({ id: 1 });
```

### 5. カリー化 HOF の型引数明示

`withPermission('space', 'create')` のように外側の呼び出しで型変数が固定されるカリー化 HOF では、TypeScript がハンドラ引数の型を `unknown[]` に推論してしまう。明示的な型引数で解決する。

```typescript
// NG: TArgs = unknown[] に推論され、ハンドラ引数の型が衝突
const action = withPermission(
  "space",
  "create",
)(async (user, name: string) => {
  return createSuccess({ name }); // TS2345
});

// OK: 外側の呼び出しで TArgs を明示
const action = withPermission<[string], { name: string }>(
  "space",
  "create",
)(async (user, name: string) => {
  return createSuccess({ name });
});
```

### 6. 条件型を含む型ガードの型引数

`ActionSuccess<T>` のような条件型では、TypeScript がジェネリック `T` を `unknown` に推論することがある。型ガード関数に明示的な型引数を渡す。

```typescript
// NG: T = unknown と推論され、data プロパティの型が合わない
const success = createSuccess(); // ActionSuccess<void>
expect(isActionSuccess(success)).toBe(true); // TS2345

// OK: 明示的な型引数
expect(isActionSuccess<void>(success)).toBe(true);
expect(isActionFailure<void>(failure)).toBe(true);
```

### 7. `unknown` な戻り値の検証には `toMatchObject`

カリー化パターン等で戻り値が `unknown` 型になる場合、プロパティアクセスは TS18046 になる。`toMatchObject` は `unknown` を受け入れる。

```typescript
// NG: result が unknown 型でプロパティアクセスできない
const result = await action("arg");
expect(result.success).toBe(false); // TS18046

// OK: toMatchObject は unknown を受け入れる
expect(result).toMatchObject({ success: false });
expect(result).toMatchObject({
  success: false,
  error: expect.stringContaining("権限"),
});
```

### 8. `import type` と `mock.module()` の共存

`mock.module()` でモジュールを差し替えても、`import type` で型のみを import することは可能。型は コンパイル時に消去されるため、ランタイムのモックと干渉しない。

```typescript
// OK: 型のみのインポートはモックと共存可能
import type { ActionResult } from "@/shared/types/server-actions";
mock.module("@/shared/lib/auth", () => ({ getSession: mockGetSession }));

// 型注釈に使用
const result: ActionResult<void> = await createPost(data);
```

## Playwrightテスト（E2E）

### 基本構造

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

### 認証ヘルパー

```typescript
async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}
```

### 条件付きスキップ

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

### 待機パターン

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

### レスポンシブテスト

```typescript
test("モバイルでも表示される", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(urls.adminNews);

  await expect(page.locator("h1")).toContainText("ニュース");
});
```

## 禁止事項

1. **テストの削除・無効化禁止**
   - 既存テストを削除しない
   - `skip()` や `only()` をコミットしない
   - エラーを握りつぶすテストを書かない

2. **形骸化テスト禁止**
   - 常に成功するテストを書かない
   - 実際の動作を検証しないテストを書かない

3. **ハードコード禁止**
   - URLは`fixtures`から取得
   - テストデータは`testUsers`等から取得

4. **待機なしのアサーション禁止**
   - `await expect(...).toBeVisible()` を使用
   - `networkidle` を適切に待機

5. **Vitest API の使用禁止**（`bun:test` と混同しない）
   - `vi.restoreAllMocks()` → `mockFn.mockReset()`
   - `vi.mock()` → `mock.module()`
   - `vi.fn()` → `mock()`

## 必須事項

1. **新機能にはテストを追加**
   - Server Actions のテスト
   - バリデーションのテスト
   - エッジケースのテスト

2. **テスト失敗時の対応**
   - 原因を調査して修正
   - テストを削除して逃げない

3. **E2Eテストの構造**
   - セクションごとに`test.describe`で分割
   - JSDocでテストシナリオを文書化

## コマンド

```bash
# 単体テスト
bun run test

# 特定ファイル
bun run test __tests__/unit/lib/crypto.test.ts

# 全テスト（unit + integration 並列）
bun run test:all

# E2Eテスト
bun run e2e

# E2E（UIモード）
bun run e2e:ui

# E2E（ヘッドレス）
bun run e2e:headless
```

## ファイル配置

| パス                     | 内容                                             |
| ------------------------ | ------------------------------------------------ |
| `__tests__/unit/`        | 単体テスト                                       |
| `__tests__/integration/` | 統合テスト                                       |
| `__tests__/mocks/`       | モック関数（auth, prisma, next, resend, stripe） |
| `__tests__/fixtures/`    | テストデータ（users, reservations）              |
| `__tests__/helpers/`     | テストヘルパー（session-mock, assertions）       |
| `__tests__/setup.ts`     | グローバルセットアップ（env 設定）               |
| `e2e/`                   | E2Eテスト                                        |
| `playwright.config.ts`   | Playwright 設定（workers: 1, chromium のみ）     |
