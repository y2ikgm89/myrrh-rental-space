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

### server-only のモック（テスト環境必須）

`import 'server-only'` を含むモジュール（`crypto.ts`, `logger.ts`, `prisma.ts` 等）をテストで直接 import する場合、
`__tests__/setup.ts` の `mock.module('server-only', () => ({}))` が必須（プリロード設定済み）。

```typescript
// __tests__/setup.ts（設定済み — 編集不要）
import { mock } from "bun:test";
mock.module("server-only", () => ({})); // server-only を no-op にする
```

**禁止**: `bun test --conditions=react-server` — React を `react.react-server.js`（`createContext`・`useRef` 未定義）に解決してしまう

### @t3-oss/env-nextjs のスナップショット問題

`serverEnv`（`@/shared/lib/env/server` の `createEnv()` 結果）はモジュールロード時点の `process.env` のスナップショット。
テストで `process.env["KEY"]` を変更しても `serverEnv.KEY` には反映されない。

```typescript
// NG: serverEnv を使ったコードはテストで env 変更が効かない
function getMasterKey() {
  const key = serverEnv.ENCRYPTION_KEY; // スナップショット — delete process.env["KEY"] が効かない
}

// OK: process.env を直接参照（遅延評価 — テストで変更が反映される）
function getMasterKey() {
  const key = process.env["ENCRYPTION_KEY"]; // 毎回評価
}
```

テストで変更を必要とする env 変数は `process.env` 直接参照で実装し、
デフォルト値は `__tests__/setup.ts` のプリロードで設定する（`ENCRYPTION_KEY` 参照）。

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
mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mockGetSession,
}));

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

### mock.module の追従更新（最重要）

Server Action が新しい domain query / external helper を呼び出すようになったら、
対応する integration test の `mock.module()` にも stub を追加する必要がある。

**未更新の兆候**:

- テスト実行時に `prisma.xxx.findMany() Authentication failed against the database server`
- テスト実行時に実 DB に接続しようとする（ネットワークエラー / 認証エラー）
- `cacheLife() is only available with the cacheComponents config` エラー → Route Handler が呼ぶ `'use cache'` 関数（`getIcalOrganizer` 等の設定クエリ）のモック漏れ。テスト環境には PPR dynamic scope がないため `cacheLife()` が throw する。`mock.module("@/shared/domain/settings/queries/<x>", () => ({ <fn>: mock(...) }))` を追加

**検出手順**:

1. `bun test <failing-file>` で実行 → エラーメッセージで「未モックの domain query」を特定
2. 該当 Server Action の import 文を確認し、モック漏れを洗い出す
3. `mock.module("@/shared/domain/<x>/queries", () => ({ <fn>: mock(...) }))` を追加

**参照実装**: `deleteAccountAction` が `getEventIdsByCustomerId` を呼び出すようになった時、
`mypage-account.test.ts` に以下を追加して解決:

```typescript
mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventIdsByCustomerId: mock(() => Promise.resolve([])),
}));
```

### toHaveBeenCalledWith 差分の読み方

`- Expected - 0 / + Received + N` = **「期待値より N 個多いプロパティがある」**

主な原因:

- Zod スキーマの `.default()` 値が実装で展開されてテスト期待値に未反映
  （例: `customerType: CustomerType.PERSONAL` が default で埋まる）
- Server Action に新規フィールドが追加されたがテスト期待値が未更新

対処: 実装の呼び出し引数をそのまま `toHaveBeenCalledWith` に反映する。
`expect.objectContaining({...})` でパーシャルマッチに緩和してもよいが、
破壊的変更検出の観点では厳密マッチ推奨。

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

### 5. `executeAdminMutationResult` の型推論

`executeAdminMutationResult` はジェネリクスで戻り値型を推論する。`execute` コールバックの戻り値型が複雑な場合、TypeScript が `unknown` に推論することがある。明示的な型引数で解決する。

```typescript
// NG: 戻り値型が unknown に推論される
const result = await executeAdminMutationResult({
  resource: "space",
  action: "create",
  execute: async () => {
    return { name }; // 型が推論されない場合あり
  },
});

// OK: 型引数を明示 (execute callback の戻り値 T が MutationResult<T> の success path)
const result = await executeAdminMutationResult<{ name: string }>({
  resource: "space",
  action: "create",
  execute: async () => {
    return { name }; // execute callback は T を直接返す (ラッパー不要)
  },
});
```

### 6. `MutationResult<T>` の型判定

`MutationResult<T> = T | MutationError` では `isMutationError()` で failure path を判定する。明示的な型引数が必要な場合は `isMutationError` を使用する。

```typescript
// NG: MutationResult に success プロパティは存在しない
const result = await action();
expect(result.success).toBe(false); // TS18046 / プロパティなし

// OK: isMutationError で failure path 判定
const result = await action();
expect(isMutationError(result)).toBe(true);

// OK: void success path: MutationResult<null> = null | MutationError
return null; // null が success sentinel
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
import type { MutationResult } from "@/shared/lib/mutation-result";
mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mockGetSession,
}));

// 型注釈に使用
const result: MutationResult<void> = await createPost(data);
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

### UI モード（デバッグ）

E2E テスト失敗時はまず UI モードで原因を特定する:

```bash
bun run e2e:ui                        # 対話的実行（ステップ実行・スクリーンショット確認）
PWDEBUG=1 bun run e2e                 # ブレークポイントで一時停止
```

- **ステップ実行**: 各アクションを1操作ずつ確認
- **スクリーンショット**: 失敗時の画面状態とDOM確認
- **ネットワーク**: リクエスト/レスポンスの内容確認
- **Trace Viewer**: `playwright show-trace trace.zip` でオフライン再生可

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

## ドメインコマンドテスト（`__tests__/unit/domain/<domain>/commands.test.ts`）

全27ドメインのコマンドテストが `__tests__/unit/domain/` に存在。新規ドメイン追加時は同パターンでテスト作成必須。

```typescript
// 標準構造
mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: { model: { method: mockFn } },
}));
// @/shared/lib/constants はモック不要
import { command } from "@/shared/domain/<domain>/commands";

describe("commandName", () => {
  describe("正常系", () => {
    /* ... */
  });
  describe("異常系", () => {
    /* DomainError テスト */
  });
});
```

**新規テスト追加後は `package.json` の `test` スクリプトにバッチ追加を確認**

## 統合テストのインライン Zod スキーマは手動保守

`__tests__/integration/actions/admin/*.test.ts` は Server Actions 内の Zod スキーマを**再現**したインライン定義を持つ（import ではない）。実ソースのスキーマ分割・リネーム時は、このインラインコピーも並行更新する。更新漏れはテスト通過のまま非整合を残すサイレントバグになる。

## Section schema test contract（`safeParse({})` 成立 + default assert）

`field.text()` 等のヘルパーが `.default("")` を必ず適用するため、section schema は
architectural contract として `safeParse({})` 常に success。**test で required-field
validation を期待しない**（schema 層は permissive、UI 層 = admin form の
`useFormAction` + zod resolver が必須バリデーション責務）。

```typescript
// OK: 空 config で default 適用を assert
test("空 config でも default 値で safeParse 成功する", () => {
  const result = ctaConfigSchema.safeParse({});
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.title).toBe(""); // .default("") 適用
    expect(result.data.variant).toBe("default"); // field.select の default
  }
});

// OK: 型違反のみ reject（値違反ではない）
test("title が string 以外（型違反）はバリデーション失敗", () => {
  expect(ctaConfigSchema.safeParse({ title: 123 }).success).toBe(false);
});

// NG: schema 層に required 期待（commit 94e19608 で修正）
test("タイトル必須バリデーション", () => {
  expect(ctaConfigSchema.safeParse({}).success).toBe(false); // ← 失敗する
});
```

`isXxxConfig` 型ガード test も同方針: 空 config / `title: ""` は valid（default 適用）、
type 違反のみ false を返す。`createTypedConfigGetterFromSchema` の fallback chain
(`safeParse({})` 成立必須）に寄り添う設計（→ `ssot-singletons.md` §Section schema 重複）。

## 必須事項

1. **新機能にはテストを追加**
   - Server Actions のテスト
   - ドメインコマンドのテスト
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
# 単一ファイル実行（日常の開発はこれで十分）
bun test __tests__/unit/lib/crypto.test.ts
bun test --watch __tests__/unit/lib/crypto.test.ts    # TDD watch（単一ファイルのみ）
bun test --bail=1 __tests__/unit/lib/crypto.test.ts   # fail fast
bun test --test-name-pattern "encryption"             # 名前フィルター

# per-directory batch（フル実行時のみ）
bun run test:unit          # 全 unit（package.json の && チェーン）
bun run test:integration   # 全 integration
bun run test:all           # unit + integration

# E2E
bun run e2e                # Playwright（全件）
bun run e2e:ui             # UI モード
bunx playwright test e2e/<file>                    # 単一ファイル
bunx playwright test --grep "<test title>"         # 名前フィルター
```

- **`bun test __tests__/unit`（親ディレクトリ指定）は `mock.module` 干渉のため禁止** — 必ず単一ファイル指定 or `test:unit` / `test:integration` script を使う
- **`bun run test` / `bun run test:watch` / `bun run test:coverage` は廃止** — 冗長・coverage は per-directory batch と非互換
- **`createImageGroupSchema()` / `sectionLayoutSchema` 等 `z.object(...).prefault({}).register(...)` パターンは省略時に inner default を生成する** — `expect(result.success).toBe(false)` の「image / layout 省略時 fail」期待は新仕様で必ず pass になり silent break。section schema を使う test は `prefault` で展開された default を `toMatchObject({ url: "", alt: "" })` 等で部分一致させる（field によって caption の default 有無が異なるため `toEqual` では flake する）
- **`prisma/migrations/<timestamp>_<name>/` の存在確認は Glob ではなく `ls prisma/migrations/`** — Glob `prisma/migrations/2026*` はディレクトリにマッチしない（Glob ツールはファイルのみ）ため「migration 不在」と誤判定する silent bug。`prisma/migrations/2026*/migration.sql` のような末尾ファイル指定なら Glob 可

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
