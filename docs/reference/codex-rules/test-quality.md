# テスト品質ルール

> Bun Test / Playwright E2E対応

## テスト分類

| 種類 | フレームワーク | 場所 | 用途 |
|------|---------------|------|------|
| Unit | Bun Test | `__tests__/unit/` | 関数・ユーティリティ |
| Integration | Bun Test | `__tests__/integration/` | Server Actions・API |
| E2E | Playwright | `e2e/` | ユーザーフロー |

## Bunテスト（Unit/Integration）

### 基本構造

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

describe('機能名', () => {
  beforeAll(() => {
    // セットアップ
  })

  afterAll(() => {
    // クリーンアップ
  })

  test('期待する動作を説明', () => {
    const result = someFunction()
    expect(result).toBe(expected)
  })
})
```

### 環境変数のモック

```typescript
describe('crypto', () => {
  const originalKey = process.env.ENCRYPTION_KEY

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-key'
  })

  afterAll(() => {
    if (originalKey) {
      process.env.ENCRYPTION_KEY = originalKey
    } else {
      delete process.env.ENCRYPTION_KEY
    }
  })
})
```

### Server Actionsテスト

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mockSession } from '@/__tests__/mocks'

describe('createNews', () => {
  beforeEach(() => {
    mockSession({ role: 'ADMIN' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('管理者は作成できる', async () => {
    const result = await createNews(validData)
    expect(result.success).toBe(true)
  })

  test('未認証はエラー', async () => {
    mockSession(null)
    const result = await createNews(validData)
    expect(result.success).toBe(false)
  })
})
```

## Playwrightテスト（E2E）

### 基本構造

```typescript
import { test, expect, type Page } from '@playwright/test'
import { urls, testUsers } from '../fixtures'

test.describe('機能名', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('ユーザーストーリーを説明', async ({ page }) => {
    await page.goto(urls.adminNews)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1')).toContainText('ニュース')
  })
})
```

### 認証ヘルパー

```typescript
async function loginAsAdmin(page: Page) {
  await page.goto(urls.login)
  await page.fill('input[type="email"]', testUsers.admin.email)
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 })
}
```

### 条件付きスキップ

```typescript
test('編集ページが表示される', async ({ page }) => {
  const editButton = page.locator('a:has-text("編集")').first()

  if ((await editButton.count()) === 0) {
    test.skip(true, 'データが存在しません')
    return
  }

  await editButton.click()
  // ...
})
```

### 待機パターン

```typescript
// ネットワーク完了を待機
await page.waitForLoadState('networkidle')

// 特定要素の表示を待機
await expect(page.locator('text=保存しました')).toBeVisible({
  timeout: 10000,
})

// アニメーション待機
await page.waitForTimeout(300)

// URL変更を待機
await page.waitForURL(urls.adminNews, { timeout: 10000 })
```

### レスポンシブテスト

```typescript
test('モバイルでも表示される', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto(urls.adminNews)

  await expect(page.locator('h1')).toContainText('ニュース')
})
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

# E2Eテスト
bun run e2e

# E2E（UIモード）
bun run e2e:ui

# E2E（ヘッドレス）
bun run e2e:headless
```

## ファイル配置

| パス | 内容 |
|------|------|
| `__tests__/unit/` | 単体テスト |
| `__tests__/integration/` | 統合テスト |
| `__tests__/mocks/` | モック関数 |
| `e2e/` | E2Eテスト |
| `e2e/fixtures/` | テストデータ・URL定義 |
