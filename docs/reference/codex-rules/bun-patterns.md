---
paths:
  - __tests__/**
  - e2e/**
---

# Bun パターンルール

> Bun 1.3.x / Bun Test ランタイム対応

## テストフレームワーク（Bun Test）

### 基本インポート

Bun Test は `bun:test` からインポートする。

**Bun は Vitest 互換エイリアス（`vi.fn()` / `vi.spyOn()` / `vi.mock()` 等）を提供しているが、プロジェクトではネイティブ API を使用する**。理由: ネイティブ API を使うことで Bun 固有の機能（`mock.restore()` / `Symbol.dispose` 等）を明示的に利用でき、コードベースの一貫性が保たれるため。

```typescript
import { describe, test, expect, mock, spyOn, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
```

**注意**: `import { vi } from 'vitest'` や `import { vi } from 'bun:test'` は存在しない。`vi` は Vitest 専用 API。

### 基本テスト構造

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'

describe('モジュール名 or 機能名', () => {
  beforeAll(() => {
    // テストファイル全体で1回だけ実行（DB接続、環境変数設定）
  })

  afterAll(() => {
    // テストファイル全体で1回だけ実行（クリーンアップ）
  })

  beforeEach(() => {
    // 各テスト前に実行（モックリセット、状態初期化）
  })

  afterEach(() => {
    // 各テスト後に実行（副作用クリーンアップ）
  })

  describe('正常系', () => {
    test('期待する動作を日本語で記述', () => {
      const result = someFunction()
      expect(result).toBe(expected)
    })

    test('非同期処理', async () => {
      const result = await asyncFunction()
      expect(result).toEqual({ id: '1', name: 'test' })
    })
  })

  describe('異常系', () => {
    test('エラーをスローする', () => {
      expect(() => invalidFunction()).toThrow('エラーメッセージ')
    })
  })
})
```

## モック

### 関数モック（mock()）

```typescript
import { mock } from 'bun:test'

// NG: Vitest
const fn = vi.fn()
const fn = vi.fn(() => 'value')

// OK: Bun — 型パラメータで引数・戻り値を明示
const fn = mock<() => string>()
const fn = mock<(id: string) => Promise<User | null>>()
const fn = mock(() => 'value')
const fn = mock(() => Promise.resolve({ id: '1' }))

// モック呼び出し後のアサーション
expect(fn).toHaveBeenCalled()
expect(fn).toHaveBeenCalledTimes(2)
expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
expect(fn.mock.calls).toEqual([['arg1'], ['arg2']])
expect(fn.mock.results[0]).toEqual({ type: 'return', value: 'result' })
```

### モジュールモック（mock.module()）

**重要**: `mock.module()` はモジュールの import 文より**前**に呼ぶ必要がある（TDZ 回避のためモック関数を先に定義）。

```typescript
import { mock } from 'bun:test'

// NG: Vitest
vi.mock('@/shared/db', () => ({ ... }))

// OK: Bun — 呼び出し順序が重要
// 1. モック関数を先に定義（TDZ 回避）
const mockFindUnique = mock<() => Promise<User | null>>(() => Promise.resolve(null))

// 2. mock.module() でモジュールを差し替え（import より前）
mock.module('@/shared/db', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}))

// 3. テスト対象を import（モック適用後）
import { getUser } from '@/admin/actions/user'
```

### スパイ（spyOn）

```typescript
import { spyOn } from 'bun:test'

// NG: Vitest
vi.spyOn(obj, 'method')

// OK: Bun
const spy = spyOn(console, 'error')
const spy = spyOn(obj, 'method')

// spy はオリジナルの動作を保持しつつ呼び出しを記録
expect(spy).toHaveBeenCalled()
expect(spy).toHaveBeenCalledWith('error message')
```

### モックリセット

```typescript
import { mock, beforeEach, afterEach } from 'bun:test'

// NG: Vitest
vi.restoreAllMocks()
vi.clearAllMocks()
vi.resetModules()

// OK: Bun

// 呼び出し記録をクリア（実装は保持）
fn.mockClear()

// 呼び出し記録 + 実装を完全リセット
fn.mockReset()

// mock.module() のモジュールキャッシュを復元
mock.restore()

// --- パターン例 ---

// mock.module() 使用時: afterEach で mock.restore()
afterEach(() => {
  mock.restore()
})

// モック関数の呼び出し記録だけ消したい場合: mockClear()
beforeEach(() => {
  mockFindUnique.mockClear()
})

// 前のテストの戻り値設定も含めてリセット: mockReset() + デフォルト値再設定
beforeEach(() => {
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(null)  // デフォルト値を再設定
})
```

## Vitest API 禁止一覧

| 禁止（Vitest） | 代替（Bun） | 備考 |
|---------------|------------|------|
| `vi.fn()` | `mock()` | `bun:test` からインポート |
| `vi.fn(() => value)` | `mock(() => value)` | |
| `vi.mock('module', factory)` | `mock.module('module', factory)` | import より前に呼ぶ |
| `vi.spyOn(obj, 'method')` | `spyOn(obj, 'method')` | `bun:test` からインポート |
| `vi.restoreAllMocks()` | `mock.restore()` | モジュールモック復元 |
| `vi.clearAllMocks()` | `mock.clearAllMocks()` | 全モック状態をリセット（実装は保持） |
| `vi.resetAllMocks()` | `mockFn.mockReset()` | 個別に呼ぶ |
| `vi.resetModules()` | 不要（`mock.restore()` で対応） | |
| `vi.mocked(fn)` | 型は `mock<T>()` で付与 | |
| `vi.importMock('module')` | 未サポート | `mock.module()` を使う |

### Symbol.dispose（`using` キーワードによる自動クリーンアップ）

Bun の `mock()` と `spyOn()` は `Symbol.dispose` を実装しており、`using` キーワードで自動的に `mockRestore()` が呼ばれる。`afterEach` でのクリーンアップが不要になる:

```typescript
import { test, expect, spyOn } from 'bun:test'

// OK: using キーワードでスコープ終了時に自動クリーンアップ
test('console.error をスパイ（自動復元）', () => {
  using spy = spyOn(console, 'error')  // スコープ終了時に mockRestore() が自動呼び出し
  doSomething()
  expect(spy).toHaveBeenCalledWith('expected error')
  // ← ここで spy.mockRestore() が自動実行
})

// OK: mock() でも同様
test('関数を一時的にモック', () => {
  using fn = mock(() => 'mocked')
  expect(fn()).toBe('mocked')
})

// 従来パターン（afterEach が必要 — 複数テストで共有するモックに使用）
const spy = spyOn(console, 'error')
afterEach(() => {
  spy.mockRestore()
})
```

**使い分け**: テストスコープに閉じるモックは `using` キーワード推奨。複数テストで共有・設定が必要なモックは従来パターン。

## 環境変数のモック

テストごとに環境変数を変更する場合は `beforeAll` / `afterAll` でオリジナルを保存・復元する。

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

describe('crypto', () => {
  const originalKey = process.env['ENCRYPTION_KEY']
  const testKey = 'a'.repeat(64)  // 64文字の16進数

  beforeAll(() => {
    process.env['ENCRYPTION_KEY'] = testKey
  })

  afterAll(() => {
    if (originalKey) {
      process.env['ENCRYPTION_KEY'] = originalKey
    } else {
      delete process.env['ENCRYPTION_KEY']
    }
  })

  test('暗号化できる', () => {
    const encrypted = encrypt('secret')
    expect(encrypted).toContain(':')
  })
})
```

**注意**: `process.env['KEY']` でアクセス（ブラケット記法）。`__tests__/setup.ts` でグローバルに `NODE_ENV` 等を設定済み。

## Server Actions テスト

Server Actions の直接テスト（認証・Prisma・Next.js API 依存）は統合テストとして行う。
`mock.module()` で依存モジュールを差し替え、アクション関数を直接呼び出す。

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test'

// 1. モック関数を先に定義
const mockGetSession = mock<() => Promise<MockSession | null>>()
const mockFindUnique = mock<() => Promise<Record<string, unknown> | null>>(() => Promise.resolve(null))
const mockCreate = mock<() => Promise<Record<string, unknown>>>()

// 2. 依存モジュールを差し替え（import より前）
mock.module('@/shared/lib/auth', () => ({
  getSession: () => mockGetSession(),
}))
mock.module('@/shared/db', () => ({
  prisma: {
    post: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}))
mock.module('next/cache', () => ({
  revalidateTag: mock(() => {}),
  updateTag: mock(() => {}),
}))
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
}))

// 3. テスト対象をインポート
import { createPost } from '@/admin/actions/post'
import { createMockSession } from '../../mocks/auth'

describe('createPost', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockCreate.mockReset()
  })

  test('ADMIN は作成できる', async () => {
    // Arrange
    mockGetSession.mockResolvedValueOnce(createMockSession({ role: Role.ADMIN }))
    mockCreate.mockResolvedValueOnce({ id: 'new-post-id', title: 'テスト' })

    // Act
    const result = await createPost(VALID_INPUT)

    // Assert
    expect(result.success).toBe(true)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test('未認証はエラーを返す', async () => {
    mockGetSession.mockResolvedValueOnce(null)

    const result = await createPost(VALID_INPUT)

    expect(result.success).toBe(false)
  })
})
```

> 追加の Bun Test API 詳細は [bun.sh/docs/test](https://bun.sh/docs/test) と `__tests__/mocks/` を参照。

---

## ファイル配置と命名規則

| パス | 内容 | ファイル形式 |
|------|------|------------|
| `__tests__/unit/` | 単体テスト（純粋関数・ユーティリティ） | `*.test.ts` |
| `__tests__/unit/lib/` | ライブラリ関数のテスト | `*.test.ts` |
| `__tests__/unit/components/` | コンポーネントのテスト | `*.test.ts` |
| `__tests__/unit/lib/validations/` | Zodスキーマバリデーションのテスト | `*.test.ts` |
| `__tests__/integration/` | 統合テスト（Server Actions・API） | `*.test.ts` |
| `__tests__/integration/actions/admin/` | 管理画面アクションの統合テスト | `*.test.ts` |
| `__tests__/integration/api/` | API Route Handler の統合テスト | `*.test.ts` |
| `__tests__/mocks/` | モック定義（共有） | `*.ts` |
| `__tests__/mocks/index.ts` | バレルエクスポート | |
| `__tests__/mocks/prisma.ts` | Prisma Client モック | |
| `__tests__/mocks/auth.ts` | Better Auth モック | |
| `__tests__/mocks/next.ts` | Next.js API モック | |
| `__tests__/mocks/resend.ts` | Resend メールモック | |
| `__tests__/setup.ts` | グローバルセットアップ（環境変数） | |

### テストファイル命名

- 対象ファイルパスに対応した名前をつける
- `src/shared/lib/crypto.ts` → `__tests__/unit/lib/crypto.test.ts`
- `src/app/(admin)/.../actions/space.ts` → `__tests__/integration/actions/admin/space.test.ts`

## コマンド

```bash
# 全テスト実行
bun run test

# ウォッチモード（開発中）
bun run test:watch

# カバレッジ計測
bun run test:coverage

# 単体テストのみ
bun run test:unit

# 統合テストのみ
bun run test:integration

# 並列実行（CI推奨）
bun run test:all

# 特定ファイルのみ
bun test __tests__/unit/lib/crypto.test.ts

# パターンマッチ
bun test --test-name-pattern "暗号化"
```

## 禁止事項

1. **`vi.*` API の使用禁止**
   - `vi.fn()`, `vi.mock()`, `vi.spyOn()`, `vi.restoreAllMocks()` は Vitest 専用
   - `bun:test` の `mock()`, `mock.module()`, `spyOn()` を使用

2. **`mock.module()` を import より後に呼ぶことを禁止**
   - TDZ（Temporal Dead Zone）の問題が発生する
   - モック関数定義 → `mock.module()` → `import` の順序を守る

3. **モックのリセット漏れ禁止**
   - テスト間でモック状態が漏れると偽陽性の原因になる
   - `beforeEach` で `mockReset()` または `mockClear()` を呼ぶ

4. **型なしモック関数の使用禁止**
   - `mock()` は型パラメータを明示する: `mock<() => Promise<User | null>>()`
   - 型なしは `never[]` 等の推論ミスを引き起こす

5. **テストの削除・無効化禁止**
   - `test.skip()` / `test.only()` をコミットしない
   - 失敗するテストは原因を調査して修正する

## 参考

- [Bun Test ドキュメント](https://bun.sh/docs/cli/test)
- [Bun mock.module()](https://bun.sh/docs/test/mocks#mock-module)
- `__tests__/setup.ts` — グローバルセットアップ
- `__tests__/mocks/` — プロジェクト共有モック
