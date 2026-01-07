# テスト要件定義

> **Note**: このドキュメントには、レンタルスペース管理システムの包括的なテスト要件定義が記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。

## 実装方針

**後方互換性を考慮しないクリーンな実装**: このプロジェクトは、最新の公式ベストプラクティスに準拠したクリーンでモダンな実装を優先します。古いバージョンや非推奨APIとの後方互換性は維持しません。すべての実装は、フレームワークとライブラリの最新の安定版を使用し、レガシーな回避策なしに公式推奨事項に従う必要があります。

---

## 概要

このプロジェクトは**フルBunで実行可能**なテスト環境を採用しています。Bun 1.3.5の組み込みテストランナー（`bun test`）を使用し、追加のテストフレームワーク依存を最小限に抑えます。

**最新の公式推奨事項に準拠**:
- Bun test 1.3.5の最新機能（`mock.module()`, `spyOn()`, `vi`互換API等）
- Next.js 16 App Routerのテストベストプラクティス（Server ComponentsはE2Eテスト推奨）
- Prisma 7のテストベストプラクティス（トランザクションを使用したテスト分離）
- Playwrightの最新設定とベストプラクティス

### テスト戦略

- **Unit tests**: 個別の関数・コンポーネントのテスト（Client Components、ユーティリティ関数）
- **Integration tests**: コンポーネント間の相互作用、データベース操作、Server Actionsのテスト
- **E2E tests**: 完全なユーザーフローのテスト（Playwright、Server Componentsのテストに推奨）

**Next.js 16 App Router特有の考慮事項**:
- **Server Components**: E2Eテストでテスト（公式推奨）
- **Server Actions**: 統合テストで直接呼び出し、E2Eテストでフロー全体を検証
- **Client Components**: Unitテストでテスト可能

### テストカバレッジ目標

- **目標**: 80%以上
- **カバレッジレポート**: `bun run test:coverage`で生成
- **カバレッジ閾値**: 新規コードは80%以上、既存コードは段階的に改善

---

## テストフレームワークとツール

### Bun test（Bun 1.3.5組み込み）

このプロジェクトは**Bun test**を使用します。追加のテストフレームワーク（Jest、Vitest等）は不要です。

**重要**: この要件定義は**後方互換性を考慮しないクリーンな状態**で設計されています。最新の公式推奨事項のみに準拠し、古いパターンや非推奨の方法は含まれていません。

**理由**:
- プロジェクトがフルBunで実行される（パッケージマネージャー、ランタイム、ビルドツール、テストランナー）
- 追加依存なしで統一された開発環境
- 高速なテスト実行（Bunのパフォーマンス特性）
- 最新の公式推奨事項に準拠（2026-01-06時点の最新情報）

**注意**: Bun testはJest/Vitest互換APIを提供していますが、これらのパッケージ自体はインストール不要です。互換APIは移行時の利便性のためであり、新規プロジェクトではBun testのネイティブAPI（`mock()`, `mock.module()`, `spyOn()`等）を直接使用します。

**使用方法**:
```bash
# 全テスト実行
bun run test

# 特定のテストファイル実行
bun run test reservation-form.test.tsx

# テスト名でフィルタ
bun run test --test-name-pattern "reservation"

# ウォッチモード
bun run test:watch
# または
bun test --watch

# カバレッジレポート
bun run test:coverage
# または
bun test --coverage

# 並列実行
bun test --concurrent

# タイムアウト設定（ミリ秒）
bun test --timeout 10000
```

**Note**: `bun test`を直接使用することも可能ですが、プロジェクトでは`package.json`のスクリプト経由（`bun run test`）を使用します。これにより、プロジェクト全体でコマンドが統一されます。

**テストファイルの検出パターン**:
- `*.test.{js|jsx|ts|tsx}`
- `*_test.{js|jsx|ts|tsx}`
- `*.spec.{js|jsx|ts|tsx}`
- `*_spec.{js|jsx|ts|tsx}`

**設定ファイル** (`bunfig.toml`):
```toml
[test]
# カバレッジを常に有効化（オプション、デフォルト: false）
coverage = false

# テストファイルをカバレッジから除外（デフォルト: false）
coverageSkipTestFiles = true

# カバレッジ閾値（80%以上、未達の場合はテスト失敗）
coverageThreshold = 0.8

# 詳細なカバレッジ閾値（行、関数、ステートメント別）
# coverageThreshold = { lines = 0.8, functions = 0.8, statements = 0.8 }

# カバレッジレポーター（text: コンソール出力、lcov: LCOV形式）
coverageReporter = ["text", "lcov"]

# カバレッジディレクトリ（デフォルト: "coverage"）
coverageDir = "coverage"
```

**設定の適用**:
- `bunfig.toml`はプロジェクトルートに配置
- 設定はすべての`bun test`コマンドに自動適用
- CLIオプション（`--coverage`等）で上書き可能

**Bun testの主要機能**:
- **ネイティブAPI**: `describe`, `it`, `test`, `expect`, `mock()`, `mock.module()`, `spyOn()`等
- **Jest互換API**: `jest.fn()`等（移行時の利便性のため、新規プロジェクトでは使用しない）
- **Vitest互換API**: `vi`オブジェクト経由（移行時の利便性のため、新規プロジェクトでは使用しない）
- **モック機能**: `mock()`, `mock.module()`, `spyOn()`（ネイティブ、推奨）
- **スナップショットテスト**: 組み込みサポート
- **カバレッジレポート**: 組み込み（`--coverage`、`bunfig.toml`設定）
- **並列実行**: `--concurrent`フラグ
- **ウォッチモード**: `--watch`
- **タイムアウト設定**: デフォルト5000ms、`--timeout`で変更可能
- **リトライ機能**: `test.retry()`, `test.repeats()`

### Playwright（E2Eテスト）

E2Eテストには**Playwright**を使用します。

**インストール**:
```bash
bun add -d @playwright/test
bunx playwright install --with-deps
```

**依存関係**:
- `@playwright/test`: E2Eテストフレームワーク（唯一の追加依存）
- Bun test: 組み込み（追加依存なし）
- その他のテストフレームワーク（Jest、Vitest、@testing-library等）: **不要**（後方互換性なしのクリーンな状態）

**設定ファイル**: `playwright.config.ts`

**使用方法**:
```bash
# E2Eテスト実行
bun run test:e2e

# E2E UIモード
bun run test:e2e:ui
```

### テストカバレッジツール

Bun testの組み込みカバレッジ機能を使用します。追加のカバレッジツールは不要です。

**カバレッジレポート形式**:
- **text**: コンソール出力（デフォルト）
- **lcov**: LCOV形式（CI/CD、エディタ拡張機能対応）

**カバレッジ除外設定** (`bunfig.toml`):
```toml
[test]
# テストファイルをカバレッジから除外（デフォルト: false）
coverageSkipTestFiles = true
```

**除外されるファイル**:
- `tests/`ディレクトリ
- `*.test.ts`, `*.test.tsx`ファイル
- `*.spec.ts`, `*.spec.tsx`ファイル
- 設定ファイル（`next.config.js`, `tailwind.config.ts`等）
- 型定義ファイル（`*.d.ts`）

---

## テスト環境の設定

### テスト用データベース

#### オプション1: テスト用Supabaseプロジェクト（推奨）

**セットアップ手順**:
1. Supabaseダッシュボードでテスト用プロジェクトを作成
2. テスト用プロジェクトの接続URLを取得
3. `.env.test.local`に`DATABASE_URL`を設定

**メリット**:
- 本番環境と同一のデータベース環境
- 簡単なセットアップ
- 自動バックアップ・復旧

**デメリット**:
- コスト（Supabase無料プランで対応可能）
- テスト間のデータ分離に注意が必要

#### オプション2: ローカルPostgreSQL

**セットアップ手順**:
1. ローカルにPostgreSQLをインストール
2. テスト用データベースを作成
3. `.env.test.local`に`DATABASE_URL`を設定

**メリット**:
- 無料
- 完全な制御

**デメリット**:
- セットアップが複雑
- 開発環境に依存

#### テスト用マイグレーションの実行

```bash
# テスト用データベースにマイグレーション実行
DATABASE_URL="your-test-database-url" bunx prisma migrate deploy
```

### テスト用環境変数

`.env.test.local`ファイルを作成し、テスト用の環境変数を設定します。

**必須環境変数**:
```env
# データベース
DATABASE_URL="postgresql://user:password@localhost:5432/test_db"

# Auth.js
NEXTAUTH_SECRET="test-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Supabase（テスト用プロジェクトまたはモック）
SUPABASE_URL="https://test-project.supabase.co"
SUPABASE_ANON_KEY="test-anon-key"
SUPABASE_SERVICE_ROLE_KEY="test-service-role-key"

# メール送信（テスト用、Resendのテストモードまたはモック）
RESEND_API_KEY="test-resend-api-key"

# その他
NODE_ENV="test"
```

**テスト用設定値の例**:
- `NEXTAUTH_SECRET`: テスト専用のシークレットキー（本番とは別）
- `NEXTAUTH_URL`: `http://localhost:3000`（テストサーバー用）
- `SUPABASE_URL`: テスト用SupabaseプロジェクトのURL
- `RESEND_API_KEY`: ResendのテストモードAPIキー（実際のメール送信を回避）

### Dockerコンテナでのテスト実行

#### docker-compose.test.yml

```yaml
version: '3.8'

services:
  test-db:
    image: postgres:16
    container_name: myrrh-rental-space-test-db
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test_db
    ports:
      - "5433:5432"
    volumes:
      - test-db-data:/var/lib/postgresql/data

  test-app:
    image: oven/bun:1.3.5
    container_name: myrrh-rental-space-test
    working_dir: /app
    volumes:
      - .:/app
    env_file:
      - .env.test.local
    depends_on:
      - test-db
    command: bun run test

volumes:
  test-db-data:
```

**使用方法**:
```bash
# テスト環境の起動
docker-compose -f docker-compose.test.yml up -d test-db

# マイグレーション実行
docker-compose -f docker-compose.test.yml run --rm test-app bunx prisma migrate deploy

# テスト実行
docker-compose -f docker-compose.test.yml run --rm test-app bun run test

# テスト環境の停止
docker-compose -f docker-compose.test.yml down
```

### CI/CD環境でのテスト実行

CI/CD環境では、テスト用データベースを自動セットアップし、テストを実行します。

**GitHub Actions例**:
```yaml
- name: Set up test database
  run: |
    docker run -d --name test-db \
      -e POSTGRES_USER=test \
      -e POSTGRES_PASSWORD=test \
      -e POSTGRES_DB=test_db \
      -p 5433:5432 \
      postgres:16

- name: Run database migrations
  run: |
    DATABASE_URL="postgresql://test:test@localhost:5433/test_db" \
    bunx prisma migrate deploy

- name: Run tests
  run: |
    DATABASE_URL="postgresql://test:test@localhost:5433/test_db" \
    bun run test
  env:
    NEXTAUTH_SECRET: ${{ secrets.TEST_NEXTAUTH_SECRET }}
    NEXTAUTH_URL: http://localhost:3000
```

---

## テスト構造の詳細

### Unit tests（`tests/unit/`）

**テスト対象**:
- 個別の関数（ユーティリティ関数、バリデーション関数等）
- Reactコンポーネント（単体、Client Components）
- Zodスキーマのバリデーション
- ビジネスロジック関数

**重要**: Next.js 16のServer Components（async Server Components）は、**E2Eテストでテストすることを公式推奨**。Unitテストでは、Client Componentsとユーティリティ関数に焦点を当てる。

**理由**:
- Server Componentsはサーバー側でのみ実行される
- 従来のクライアント側テストツールでは完全にテストできない
- E2Eテストにより、実際のレンダリングとデータフェッチングを検証できる

**ディレクトリ構造**:
```
tests/unit/
├── utils/
│   ├── format-date.test.ts
│   └── calculate-price.test.ts
├── components/
│   ├── reservation-form.test.tsx
│   └── space-card.test.tsx
├── schemas/
│   ├── reservation-schema.test.ts
│   └── space-schema.test.ts
└── lib/
    ├── auth.test.ts
    └── email.test.ts
```

**モック/スタブの使用方法**:
- **`mock()`**: 関数のモック作成
- **`mock.module()`**: モジュール全体のモック（ESM/CommonJS対応）
- **`spyOn()`**: 既存関数のスパイ（実装を変更せずに呼び出しを監視）
- **`vi`オブジェクト**: Vitest互換API（`vi.fn()`, `vi.spyOn()`, `vi.mock()`）
- **`jest.fn()`**: Jest互換API（`mock()`のエイリアス）
- 外部依存（データベース、API等）はモック化
- 可能な限り実装を使用（モックは最小限に）

**モックのベストプラクティス**:
- モックはシンプルに保つ
- 型安全なモックを使用
- モックの動作もテストする
- `mock.module()`は`--preload`スクリプトで使用（必要に応じて）

**テストデータの管理**:
- `tests/fixtures/`ディレクトリにテストデータを配置
- ファクトリーパターンを使用してテストデータを生成

**例**:
```typescript
import { describe, it, expect, mock, spyOn } from 'bun:test'
import { formatDate } from '@/lib/utils/format-date'

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2026-01-01')
    const formatted = formatDate(date)
    expect(formatted).toBe('2026-01-01')
  })
  
  it('should handle invalid dates', () => {
    const invalidDate = new Date('invalid')
    expect(() => formatDate(invalidDate)).toThrow()
  })
})
```

**モックの例**:
```typescript
import { describe, it, expect, mock, mock.module } from 'bun:test'

// 関数のモック
const mockFn = mock((x: number) => x * 2)
expect(mockFn(5)).toBe(10)
expect(mockFn).toHaveBeenCalledWith(5)

// モジュールのモック
mock.module('./api-client', () => ({
  fetchUser: mock(async (id: string) => ({ id, name: `User ${id}` })),
}))

// スパイの使用
const service = new UserService()
const getUserSpy = spyOn(service, 'getUser')
await service.getUser('123')
expect(getUserSpy).toHaveBeenCalledWith('123')
```

### Integration tests（`tests/integration/`）

**テスト対象**:
- コンポーネント間の相互作用
- データベース操作（Prisma経由）
- Server Actions（直接呼び出し）
- API routes（Route Handlers）
- フォーム送信フロー
- 画像アップロード

**Server Actionsのテスト**:
- Server Actionsを直接呼び出してテスト（統合テスト）
- データベース状態の変更を検証
- キャッシュ無効化（`revalidatePath`, `revalidateTag`）を検証
- 認証・認可チェックを検証
- エラーハンドリングを検証
- フォーム送信フロー全体をE2Eテストで検証（推奨）

**ディレクトリ構造**:
```
tests/integration/
├── actions/
│   ├── create-reservation.test.ts
│   └── update-space.test.ts
├── api/
│   ├── blog-posts.test.ts
│   └── spaces.test.ts
├── components/
│   ├── reservation-flow.test.tsx
│   └── admin-form.test.tsx
└── database/
    ├── prisma-operations.test.ts
    └── transactions.test.ts
```

**データベース操作のテスト方法**:
- **テスト用データベースを使用**（推奨）
- **トランザクションを使用してテストデータを分離**（推奨）
  - 各テストをトランザクション内で実行
  - テスト後にロールバックしてデータをクリーンアップ
  - 並列実行が可能
- **各テスト前にデータベースをクリーンアップ**（代替方法）
  - `beforeEach`で`deleteMany()`を実行
  - シンプルだが、並列実行時は注意が必要

**外部サービス（Supabase、Resend等）のモック方法**:
- Supabase: テスト用Supabaseプロジェクトを使用（推奨）またはモック
- Resend: テストモードAPIキーを使用（実際のメール送信を回避）
- その他: 必要に応じてモックライブラリを使用

**例（トランザクション使用 - 推奨）**:
```typescript
import { describe, it, expect } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { createReservation } from '@/actions/reservations'

describe('createReservation', () => {
  it('should create reservation successfully', async () => {
    // トランザクション内でテストを実行（自動ロールバック）
    await prisma.$transaction(async (tx) => {
      // テストデータの作成
      const space = await tx.space.create({
        data: {
          name: 'Test Space',
          // ... other fields
        },
      })

      const result = await createReservation({
        spaceId: space.id,
        startTime: new Date('2026-01-01T10:00:00Z'),
        endTime: new Date('2026-01-01T12:00:00Z'),
        // ... other fields
      })

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      
      // トランザクションがロールバックされるため、データは残らない
    }, { timeout: 10000 })
  })
})
```

**例（クリーンアップ使用 - 代替方法）**:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { createReservation } from '@/actions/reservations'

describe('createReservation', () => {
  beforeEach(async () => {
    // テストデータのクリーンアップ
    await prisma.reservation.deleteMany()
    await prisma.space.deleteMany()
    await prisma.customer.deleteMany()
  })

  afterEach(async () => {
    // テスト後のクリーンアップ
    await prisma.reservation.deleteMany()
    await prisma.space.deleteMany()
    await prisma.customer.deleteMany()
  })

  it('should create reservation successfully', async () => {
    // テストデータの作成
    const space = await prisma.space.create({
      data: {
        name: 'Test Space',
        // ... other fields
      },
    })

    const result = await createReservation({
      spaceId: space.id,
      startTime: new Date('2026-01-01T10:00:00Z'),
      endTime: new Date('2026-01-01T12:00:00Z'),
      // ... other fields
    })

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })
})
```

### E2E tests（`tests/e2e/`）

**テスト対象**:
- 完全なユーザーフロー
- ページ遷移
- フォーム入力・送信
- 認証フロー
- 管理画面の操作

**ディレクトリ構造**:
```
tests/e2e/
├── public/
│   ├── home-page.spec.ts
│   ├── reservation-flow.spec.ts
│   └── blog.spec.ts
├── admin/
│   ├── login.spec.ts
│   ├── space-management.spec.ts
│   └── reservation-management.spec.ts
└── fixtures/
    └── test-data.ts
```

**Playwrightの設定**:

`playwright.config.ts`:
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // テストファイルのディレクトリ
  testDir: './tests/e2e',
  
  // すべてのテストを並列実行
  fullyParallel: true,
  
  // CI環境でtest.only()が残っている場合は失敗
  forbidOnly: !!process.env.CI,
  
  // CI環境でのみリトライ（2回）
  retries: process.env.CI ? 2 : 0,
  
  // CI環境では並列実行を無効化（workers: 1）
  workers: process.env.CI ? 1 : undefined,
  
  // レポーター設定
  reporter: [
    ['html'],
    ['list'],
    ...(process.env.CI ? [['junit', { outputFile: 'test-results/junit.xml' }]] : []),
  ],
  
  // 各テストのタイムアウト（30秒）
  timeout: 30000,
  
  // expect()のタイムアウト（5秒）
  expect: {
    timeout: 5000,
  },
  
  // グローバル設定
  use: {
    // ベースURL（相対パスでナビゲーション可能）
    baseURL: 'http://localhost:3000',
    
    // リトライ時にトレースを収集
    trace: 'on-first-retry',
    
    // スクリーンショット設定
    screenshot: 'only-on-failure',
    
    // 動画設定
    video: 'retain-on-failure',
  },
  
  // ブラウザプロジェクト設定
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 必要に応じて他のブラウザを追加
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  
  // 開発サーバーの自動起動
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
```

**テストシナリオの定義**:
- 各機能ごとにテストシナリオを定義
- ユーザーストーリーに基づいたテストケース
- エッジケースも含める

**テストデータのセットアップとクリーンアップ**:
- `beforeAll`: テストデータのセットアップ
- `afterAll`: テストデータのクリーンアップ
- 各テストは独立して実行可能

**例**:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Reservation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // テストデータのセットアップ
    // ...
  })

  test('should complete reservation flow', async ({ page }) => {
    await page.goto('/reservation')
    
    // カレンダーで日付を選択
    await page.click('[data-testid="date-2026-01-01"]')
    
    // 時間枠を選択
    await page.click('[data-testid="time-slot-10:00"]')
    
    // フォームに入力
    await page.fill('[name="firstName"]', 'Test')
    await page.fill('[name="lastName"]', 'User')
    await page.fill('[name="email"]', 'test@example.com')
    
    // 送信
    await page.click('[type="submit"]')
    
    // 確認ページに遷移
    await expect(page).toHaveURL(/\/reservation\/confirm/)
    await expect(page.locator('text=予約が完了しました')).toBeVisible()
  })
})
```

---

## テストカバレッジ要件

### カバレッジ目標

- **全体カバレッジ**: 80%以上
- **新規コード**: 80%以上（必須）
- **既存コード**: 段階的に改善（目標80%以上）

### カバレッジレポートの形式

**生成コマンド**:
```bash
bun run test:coverage
```

**レポート形式**:
- **text**: コンソール出力（デフォルト）
- **lcov**: LCOV形式（`coverage/lcov.info`に出力、CI/CD、エディタ拡張機能対応）

### カバレッジ閾値の設定

**必須カバレッジ**:
- 関数: 80%以上
- 行: 80%以上
- 分岐: 80%以上

**カバレッジ除外設定**:
- `tests/`ディレクトリ
- `*.test.ts`, `*.test.tsx`ファイル
- 設定ファイル（`next.config.js`, `tailwind.config.ts`等）
- 型定義ファイル（`*.d.ts`）

### カバレッジレポートの確認

**ローカル開発**:
```bash
bun run test:coverage
```

**CI/CD**:
- LCOVレポートを生成（`bun test --coverage --coverage-reporter=lcov`）
- カバレッジレポートをアーティファクトとして保存
- カバレッジ閾値未達の場合はビルドを失敗させる（`bunfig.toml`で`coverageThreshold`を設定）

**GitHub Actionsでのカバレッジ統合**:
```yaml
- name: Generate coverage report
  run: bun test --coverage --coverage-reporter=lcov

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

---

## CI/CDでのテスト実行

### GitHub Actions

**テスト実行ステップ**:

`.github/workflows/test.yml`:
```yaml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v6
      
      - name: Install Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.5
      
      - name: Install dependencies
        run: bun install --frozen-lockfile
      
      - name: Set up test database
        run: |
          DATABASE_URL="postgresql://test:test@localhost:5432/test_db" \
          bunx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
      
      - name: Run linter
        run: bun run lint
      
      - name: Run type check
        run: bun run type-check
      
      - name: Run unit and integration tests
        run: bun run test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          NEXTAUTH_SECRET: ${{ secrets.TEST_NEXTAUTH_SECRET }}
          NEXTAUTH_URL: http://localhost:3000
          SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
      
      - name: Generate LCOV coverage report
        run: bun test --coverage --coverage-reporter=lcov
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          NEXTAUTH_SECRET: ${{ secrets.TEST_NEXTAUTH_SECRET }}
          NEXTAUTH_URL: http://localhost:3000
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v5
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella
      
      - name: Install Playwright browsers
        run: bunx playwright install --with-deps
      
      - name: Run E2E tests
        run: bun run test:e2e
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          NEXTAUTH_SECRET: ${{ secrets.TEST_NEXTAUTH_SECRET }}
          NEXTAUTH_URL: http://localhost:3000
      
      - name: Upload Playwright report
        uses: actions/upload-artifact@v6
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

**デプロイワークフローへの統合**:

`.github/workflows/deploy.yml`にテストステップを追加:
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    # ... テストステップ（上記参照）
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    # ... デプロイステップ
```

### Google Cloud Build

**テスト実行ステップ**:

`cloudbuild.yaml`:
```yaml
steps:
  # テスト実行
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['install', '--frozen-lockfile']
  
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['run', 'lint']
  
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['run', 'type-check']
  
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['run', 'test']
    env:
      - 'DATABASE_URL=${_TEST_DATABASE_URL}'
      - 'NEXTAUTH_SECRET=${_TEST_NEXTAUTH_SECRET}'
      - 'NEXTAUTH_URL=http://localhost:3000'
  
  # ビルド（テスト通過後）
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/myrrh-rental-space/app:$SHORT_SHA', '.']
  
  # ... その他のステップ

options:
  machineType: 'E2_HIGHCPU_8'
```

### テスト失敗時の動作

- **テスト失敗時**: ビルドを失敗させ、デプロイを停止
- **カバレッジ閾値未達**: 警告を表示（ビルドは継続、将来的には失敗させる）
- **E2Eテスト失敗**: ビルドを失敗させ、デプロイを停止

### テスト結果のレポート

- **Unit/Integration tests**: コンソール出力、カバレッジレポート
- **E2E tests**: Playwright HTMLレポート、スクリーンショット、トレース
- **CI/CD**: テスト結果をアーティファクトとして保存

---

## モック/スタブの使用方法

### 外部サービス（Supabase、Resend等）のモック方法

#### Supabase

**オプション1: テスト用Supabaseプロジェクト（推奨）**
- テスト用Supabaseプロジェクトを作成
- `.env.test.local`にテスト用プロジェクトのURLとキーを設定
- 実際のSupabase APIを使用（テスト環境）

**オプション2: モック（`mock.module()`を使用）**
```typescript
import { mock, mock.module } from 'bun:test'

// モジュール全体をモック
mock.module('./lib/supabase', () => ({
  createClient: mock(() => ({
    from: mock(() => ({
      select: mock(() => ({
        eq: mock(() => ({
          single: mock(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  })),
}))

// テストで使用（モックされたモジュールが自動的に使用される）
```

#### Resend

**テストモードAPIキーを使用**:
- ResendのテストモードAPIキーを使用
- 実際のメール送信を回避
- `.env.test.local`にテスト用APIキーを設定

**モック例**:
```typescript
import { mock } from 'bun:test'

const mockResend = {
  emails: {
    send: mock(() => Promise.resolve({ id: 'test-email-id' })),
  },
}
```

### データベースのモック/テストダブル

**推奨**: テスト用データベースを使用（モックは使用しない）

**理由**:
- 実際のデータベース操作をテストできる
- Prismaの動作を正確にテストできる
- 統合テストとしての価値が高い

**テスト用データベースの使用**:
```typescript
import { prisma } from '@/lib/prisma'

// テスト用データベースを使用（トランザクション推奨）
it('should create reservation', async () => {
  await prisma.$transaction(async (tx) => {
    const space = await tx.space.create({ data: spaceData })
    const reservation = await tx.reservation.create({ data: reservationData })
    // テスト実行
    // トランザクションがロールバックされるため、データは残らない
  }, { timeout: 10000 })
})
```

### モックライブラリの推奨事項

**推奨（新規プロジェクト）**:
- **Bun testのネイティブモック機能**: `mock()`, `mock.module()`, `spyOn()`を使用（推奨）
- **外部ライブラリ**: 必要に応じて`@sinonjs/fake-timers`等を使用（時刻のモック等）

**移行時の互換API**（新規プロジェクトでは使用しない）:
- **Vitest互換API**: `vi`オブジェクト（Vitestからの移行時のみ）
- **Jest互換API**: `jest.fn()`（Jestからの移行時のみ）

**モックのベストプラクティス**（Bun公式推奨）:
- モックはシンプルに保つ
- 型安全なモックを使用
- モックの動作もテストする
- `mock.module()`は`--preload`スクリプトで使用（必要に応じて）
- 可能な限り実装を使用（モックは最小限に）
- モジュールのモックは`mock.module()`を使用（ESM/CommonJS対応）

---

## テストデータ管理

### テストデータの作成方法（fixtures、factories）

#### Fixtures（`tests/fixtures/`）

**ディレクトリ構造**:
```
tests/fixtures/
├── spaces.ts
├── reservations.ts
├── customers.ts
└── users.ts
```

**例**:
```typescript
// tests/fixtures/spaces.ts
export const createSpaceFixture = (overrides = {}) => ({
  name: 'Test Space',
  description: 'Test Description',
  address: 'Test Address',
  capacity: 10,
  hourlyPrice: 1000,
  ...overrides,
})
```

#### Factories（`tests/factories/`）

**ディレクトリ構造**:
```
tests/factories/
├── space-factory.ts
├── reservation-factory.ts
└── customer-factory.ts
```

**例**:
```typescript
// tests/factories/space-factory.ts
import { prisma } from '@/lib/prisma'
import { createSpaceFixture } from '../fixtures/spaces'

export const createSpace = async (overrides = {}) => {
  const data = createSpaceFixture(overrides)
  return await prisma.space.create({ data })
}
```

### テスト間のデータ分離方法

**方法1: 各テスト前にクリーンアップ（代替方法）**
```typescript
beforeEach(async () => {
  await prisma.reservation.deleteMany()
  await prisma.space.deleteMany()
  await prisma.customer.deleteMany()
})
```

**注意**: この方法はシンプルですが、並列実行時は注意が必要です。トランザクションを使用する方法（方法2）を推奨します。

**方法2: トランザクションを使用（推奨）**
```typescript
it('should create reservation', async () => {
  await prisma.$transaction(async (tx) => {
    const space = await tx.space.create({ data: spaceData })
    const reservation = await tx.reservation.create({ data: reservationData })
    // テスト実行
    // トランザクションがロールバックされるため、データは残らない
  }, { timeout: 10000 })
})
```

**トランザクションのベストプラクティス**（Prisma 7公式推奨）:
- 各テストをトランザクション内で実行（`prisma.$transaction()`）
- タイムアウトを適切に設定（デフォルト5秒、必要に応じて延長）
- ネストされたトランザクションにはセーブポイントを使用
- 並列実行が可能（各テストが独立したトランザクション）
- インタラクティブトランザクションを使用（`prisma.$transaction(async (tx) => { ... })`）
- すべてのクエリが同じ接続を共有することを保証（トランザクション整合性）

**セーブポイントの使用例**（ネストされたトランザクション）:
```typescript
it('should handle nested transactions', async () => {
  await prisma.$transaction(async (tx) => {
    // セーブポイントを作成
    await tx.$executeRaw`SAVEPOINT sp1`
    
    try {
      // アプリケーションコードがトランザクションを開始する場合
      await tx.space.create({ data: spaceData })
      // ...
    } catch (error) {
      // セーブポイントにロールバック
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT sp1`
      throw error
    }
  }, { timeout: 10000 })
})
```

**方法3: テスト用データベースを分離**
- 各テストスイートで別のデータベースを使用
- CI/CD環境で有効

### テストデータのクリーンアップ方法

**afterEach/afterAllでクリーンアップ**:
```typescript
afterEach(async () => {
  await prisma.reservation.deleteMany()
  await prisma.space.deleteMany()
  await prisma.customer.deleteMany()
})
```

**テスト用データベースのリセット**:
```bash
# テスト用データベースをリセット
DATABASE_URL="your-test-database-url" bunx prisma migrate reset --force
```

### シードデータの管理

**テスト用シードデータ**:
- `prisma/seed-test.ts`: テスト用シードスクリプト
- テスト実行前にシードデータを投入

**使用方法**:
```bash
# テスト用シードデータを投入
DATABASE_URL="your-test-database-url" bunx prisma db seed --script prisma/seed-test.ts
```

---

## パフォーマンステスト

### パフォーマンステストの要件

**対象**:
- Server Actionsのレスポンス時間
- データベースクエリの実行時間
- ページのレンダリング時間

**測定指標**:
- レスポンス時間: 200ms以下（目標）
- データベースクエリ: 100ms以下（目標）
- ページレンダリング: 1s以下（目標）

**実装方法**:
```typescript
import { describe, it, expect } from 'bun:test'

describe('Performance', () => {
  it('should complete reservation creation within 200ms', async () => {
    const start = Date.now()
    await createReservation(reservationData)
    const duration = Date.now() - start
    
    expect(duration).toBeLessThan(200)
  })
})
```

### 負荷テストの要件（オプション）

**ツール**: k6、Artillery等

**シナリオ**:
- 同時予約作成
- 大量データの取得
- 高トラフィック時の動作

**実行頻度**: リリース前、定期的な負荷テスト

### ベンチマークテストの要件（オプション）

**対象**:
- データベースクエリのパフォーマンス
- Server Actionsのパフォーマンス
- ページレンダリングのパフォーマンス

**実装方法**:
```typescript
import { bench } from 'bun:test'

bench('createReservation', async () => {
  await createReservation(reservationData)
}, { iterations: 1000 })
```

---

## アクセシビリティテスト

### アクセシビリティテストの要件

**対象**:
- キーボードナビゲーション
- スクリーンリーダー対応
- ARIA属性の適切な使用
- コントラスト比

**ツール**:
- Playwrightのアクセシビリティテスト機能
- axe-core（オプション）

**実装方法**:
```typescript
import { test, expect } from '@playwright/test'
import { injectAxe, checkA11y } from 'axe-playwright'

test('should be accessible', async ({ page }) => {
  await page.goto('/reservation')
  await injectAxe(page)
  await checkA11y(page)
})
```

### WCAG準拠チェックの要件（オプション）

**目標**: WCAG 2.1 Level AA準拠

**チェック項目**:
- キーボード操作可能
- スクリーンリーダー対応
- コントラスト比（4.5:1以上）
- フォーカス表示

---

## セキュリティテスト

### セキュリティテストの要件

**対象**:
- 認証・認可のテスト
- 入力検証のテスト
- SQLインジェクション対策のテスト
- XSS対策のテスト
- CSRF対策のテスト

**実装方法**:
```typescript
import { describe, it, expect } from 'bun:test'

describe('Security', () => {
  it('should reject invalid JWT token', async () => {
    const invalidToken = 'invalid-token'
    const result = await verifyToken(invalidToken)
    expect(result).toBeNull()
  })
  
  it('should sanitize user input', async () => {
    const maliciousInput = '<script>alert("XSS")</script>'
    const sanitized = sanitizeInput(maliciousInput)
    expect(sanitized).not.toContain('<script>')
  })
})
```

### 脆弱性スキャンの要件（オプション）

**ツール**: npm audit、Snyk等

**実行頻度**: 定期的（週次または月次）

**対応**: 検出された脆弱性は即座に対応

---

## テスト実行のベストプラクティス

### テスト実行の順序

1. **Lint**: `bun run lint`
2. **Type check**: `bun run type-check`
3. **Unit tests**: `bun run test tests/unit/`
4. **Integration tests**: `bun run test tests/integration/`
5. **E2E tests**: `bun run test:e2e`

### テストの命名規則

**推奨**: 明確で説明的なテスト名を使用

```typescript
// Good: 明確で説明的
test('should calculate total price including tax for multiple items', () => {
  // test implementation
})

// Avoid: 曖昧な名前
test('price calculation', () => {
  // test implementation
})
```

### テストのグループ化

**推奨**: 関連するテストを`describe`ブロックでグループ化

```typescript
describe('User authentication', () => {
  describe('with valid credentials', () => {
    test('should return user data', () => {
      // test implementation
    })
    
    test('should set authentication token', () => {
      // test implementation
    })
  })
  
  describe('with invalid credentials', () => {
    // additional tests
  })
})
```

### テストの独立性

- 各テストは独立して実行可能であること
- テスト間で状態を共有しない
- テストの実行順序に依存しない

### テストの実行時間

- **Unit tests**: 数秒以内
- **Integration tests**: 数分以内（並列実行で高速化可能）
- **E2E tests**: 10分以内（全体）

### 並列実行

**Bun test**:
- `--concurrent`フラグで並列実行を有効化
- 各テストファイル内のテストを並列実行
- 独立したテストで有効

**Playwright**:
- `fullyParallel: true`で並列実行を有効化
- `workers`オプションで並列度を制御
- CI環境では`workers: 1`を推奨（安定性重視）

### テストのメンテナンス

- テストコードも本番コードと同様にメンテナンス
- テストのリファクタリングも定期的に実施
- 不要になったテストは削除

### テストの品質（Bun公式推奨）

**推奨**: カバレッジの数値だけでなく、テストの品質を重視

**Good**: 実際の機能をテストし、複数のシナリオとアサーションを含める
```typescript
test('should calculate total price including tax for multiple items', () => {
  expect(calculateTax(100, 0.08)).toBe(8)
  expect(calculateTax(100, 0.1)).toBe(10)
  expect(calculateTax(0, 0.08)).toBe(0)
  expect(calculateTax(100, 0)).toBe(0)
})
```

**Avoid**: カバレッジのためだけにコードを実行（アサーションなし）
```typescript
test('calculateTax exists', () => {
  calculateTax(100, 0.08) // アサーションなし！
})
```

**ベストプラクティス**:
- エッジケースをテストする
- エラー条件をテストする
- 複数のアサーションを使用して動作を検証する
- カバレッジで不足しているテストを見つける（カバレッジは品質指標の一つ）

### エラー条件のテスト

**推奨**: 正常系だけでなく、エラー条件もテスト

```typescript
describe('createReservation', () => {
  it('should create reservation successfully', async () => {
    // 正常系のテスト
  })
  
  it('should reject invalid time range', async () => {
    // エラー条件のテスト
    await expect(createReservation({
      startTime: new Date('2026-01-01T12:00:00Z'),
      endTime: new Date('2026-01-01T10:00:00Z'), // 終了時間が開始時間より前
    })).rejects.toThrow()
  })
})
```

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書（テスト手順）
- [`BLOG_REQUIREMENTS.md`](./BLOG_REQUIREMENTS.md) - ブログ機能のテスト要件（このドキュメントを参照）
- [`JWT_AUTH_REQUIREMENTS.md`](./JWT_AUTH_REQUIREMENTS.md) - JWT認証のテスト要件（このドキュメントを参照）
- [`BUN_RUNTIME.md`](./BUN_RUNTIME.md) - Bunランタイムガイド（テストランナー、このドキュメントを参照）
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - デプロイメント手順（CI/CDでのテスト実行、このドキュメントを参照）
- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md) - 機能要件（セキュリティテストの参照、このドキュメントを参照）

### 外部リソース

- [Bun Test Documentation](https://bun.sh/docs/test) - 公式テストドキュメント
- [Bun Test Writing Guide](https://bun.sh/docs/test/writing) - テストの書き方
- [Bun Test Mocks](https://bun.sh/docs/test/mocks) - モック機能
- [Bun Test Code Coverage](https://bun.sh/docs/test/code-coverage) - カバレッジ機能
- [Playwright Documentation](https://playwright.dev) - E2Eテストフレームワーク
- [Playwright Configuration](https://playwright.dev/docs/test-configuration) - 設定ガイド
- [Next.js Testing Documentation](https://nextjs.org/docs/app/building-your-application/testing) - Next.js 16テストガイド
- [Prisma Testing Best Practices](https://www.prisma.io/docs/guides/testing) - Prisma 7テストガイド
- [Prisma Integration Testing](https://www.prisma.io/docs/guides/testing/integration-testing) - 統合テストガイド

---

## Next.js 16 App Router特有のテスト要件

### Server Componentsのテスト

**公式推奨**: Next.js 16のasync Server Componentsは、E2Eテストでテストすることを推奨。

**理由**:
- Server Componentsはサーバー側でのみ実行される
- 従来のクライアント側テストツールでは完全にテストできない
- E2Eテストにより、実際のレンダリングとデータフェッチングを検証できる

**実装方法**:
- Playwrightを使用したE2Eテスト
- HTTPレベルでのテスト（Next.js内部をモックしない）
- 実際のServer Componentsのレンダリングを検証

### Server Actionsのテスト

**統合テストでの直接呼び出し**:
```typescript
import { describe, it, expect } from 'bun:test'
import { createReservation } from '@/actions/reservations'

describe('createReservation Server Action', () => {
  it('should create reservation and invalidate cache', async () => {
    const result = await createReservation({
      spaceId: 'space-id',
      startTime: new Date('2026-01-01T10:00:00Z'),
      endTime: new Date('2026-01-01T12:00:00Z'),
    })
    
    expect(result.success).toBe(true)
    // データベース状態を検証
    // キャッシュ無効化を検証
  })
})
```

**E2Eテストでの検証**:
- フォーム送信フロー全体をテスト
- ページ遷移とデータ更新を検証
- エラーハンドリングを検証

### キャッシュ無効化のテスト

**Server Actionsでのキャッシュ無効化を検証**:
```typescript
import { describe, it, expect } from 'bun:test'
import { createSpace } from '@/actions/admin/spaces'
import { getSpace } from '@/actions/spaces'

describe('Cache invalidation', () => {
  it('should invalidate cache after creating space', async () => {
    // キャッシュされたデータを取得
    const before = await getSpace('space-id')
    
    // Server Actionでデータを更新
    await createSpace({ /* ... */ })
    
    // キャッシュが無効化され、最新データが取得されることを検証
    const after = await getSpace('space-id')
    expect(after.updatedAt).not.toBe(before.updatedAt)
  })
})
```

---

## 更新履歴

- **2026-01-06**: テスト要件定義ドキュメント作成、包括的なテスト要件を定義
- **2026-01-06**: 最新の公式推奨事項を反映（Bun test、Playwright、Next.js 16、Prisma 7の最新ベストプラクティス）
  - Bun test 1.3.5の最新機能（`mock.module()`, `spyOn()`, `vi`互換API、カバレッジ設定、`bunfig.toml`設定）
  - Next.js 16 App Routerのテストベストプラクティス（Server ComponentsはE2Eテスト推奨、Server Actionsの統合テスト）
  - Prisma 7のテストベストプラクティス（トランザクションを使用したテスト分離、並列実行対応、セーブポイント）
  - Playwrightの最新設定（`fullyParallel`, `forbidOnly`, `retries`, `webServer`, `timeout`等）
  - GitHub Actionsの最新バージョン（`actions/checkout@v6`, `oven-sh/setup-bun@v2`, `codecov/codecov-action@v5`, `actions/upload-artifact@v6`）
  - テスト品質のベストプラクティス（カバレッジ数値だけでなく品質を重視、エッジケースのテスト）
