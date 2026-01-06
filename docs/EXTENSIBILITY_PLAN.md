# 拡張性を高める実装計画

> **Note**: このドキュメントには、将来の拡張性を確保するための実装計画が記載されています。各要件定義ドキュメントの分析結果に基づき、データベース設計、API設計、アーキテクチャ、機能追加の容易さ、スケーラビリティ、保守性の各観点から改善点を洗い出し、実装方針を策定しています。

**最終更新**: 2026-01-06

---

## 目次

1. [現状分析](#現状分析)
2. [拡張性の観点別分析](#拡張性の観点別分析)
3. [実装方針](#実装方針)
4. [実装優先順位](#実装優先順位)
5. [期待される効果](#期待される効果)
6. [参考資料](#参考資料)

---

## 現状分析

### 要件定義ドキュメントの分析結果

以下の要件定義ドキュメントを分析し、拡張性に関する課題と改善点を洗い出しました：

- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md): 機能要件
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): システムアーキテクチャ
- [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md): データベース設計
- [`API.md`](./API.md): API仕様
- [`BEST_PRACTICES.md`](./BEST_PRACTICES.md): ベストプラクティス
- [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md): プロジェクト構造
- [`EMAIL_REQUIREMENTS.md`](./EMAIL_REQUIREMENTS.md): メール送信機能要件
- [`SETTINGS_REQUIREMENTS.md`](./SETTINGS_REQUIREMENTS.md): サイト設定画面要件
- [`BLOG_REQUIREMENTS.md`](./BLOG_REQUIREMENTS.md): ブログ機能要件

### 分析の観点

拡張性を以下の6つの観点から分析しました：

1. **データベース設計の拡張性**: スキーマ変更の容易さ、データモデルの柔軟性
2. **API設計の拡張性**: Server Actionsの構造、バリデーション、エラーハンドリング
3. **アーキテクチャの拡張性**: コンポーネント構造、レイヤー分離、依存関係管理
4. **機能追加の容易さ**: 新機能追加時の影響範囲、コードの再利用性
5. **スケーラビリティ**: パフォーマンス最適化、キャッシュ戦略、データベースクエリ最適化
6. **保守性**: コードの可読性、テスト容易性、ドキュメント整備

---

## 拡張性の観点別分析

### 1. データベース設計の拡張性

#### 1.1 現状の課題

**Settingsテーブルのシングルトン設計**:
- Settingsテーブルが1レコードのみ存在する設計（既存設計では意図的なシングルトン設計）
- 既存設計では「型安全性を確保するため、専用フィールドを使用」という設計方針が採用されている（[`SETTINGS_REQUIREMENTS.md`](./SETTINGS_REQUIREMENTS.md)、[`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md)参照）
- 将来的な設定項目追加時の拡張性の観点から、以下の改善を検討：
  - 設定カテゴリ別の拡張テーブルを追加可能な設計
  - `SettingsMetadata`テーブルによる設定項目の動的追加
  - 設定値のバージョン管理機能の追加検討
- **注意**: 既存設計を否定するものではなく、将来的な拡張性を考慮した改善提案

**JSON型の多用**:
- `Spaces.facilities`: JSON配列（`["Wi-Fi", "Projector", "Whiteboard"]`、[`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md)参照）
- `Spaces.businessHours`: JSONオブジェクト（曜日別の開始/終了時間、[`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md)参照）
- `BlogPosts.tags`: JSON配列（`Json, String[]`、現在の定義、[`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md)参照）
- 型安全性が低く、クエリの最適化が困難

**インデックス設計**:
- 一部のクエリパターンでインデックスが最適化されていない可能性
- 複合インデックスの設計が一部不十分

#### 1.2 改善方針

**Settingsテーブルの拡張性向上**:
- 設定カテゴリ別の拡張テーブルを追加可能な設計
- `SettingsMetadata`テーブルによる設定項目の動的追加
- 設定値のバージョン管理機能の追加検討

**JSON型の使用見直し**:
- JSON型を使用しているフィールドの正規化検討
  - `facilities` → `SpaceFacilities`テーブル（多対多リレーション）
  - `businessHours` → `SpaceBusinessHours`テーブル（曜日別の営業時間）
  - `tags` → `BlogPostTags`中間テーブル（現在はJSON配列として定義されているが、将来的な拡張性の観点から中間テーブルへの正規化を検討）
- 型安全性を高めるためのPrisma型定義の改善
- **注意**: 既存のJSON型設計を尊重しつつ、将来的な拡張性を考慮した改善提案

**インデックス設計の最適化**:
- クエリパターンに基づいたインデックス設計の見直し
- 複合インデックスの最適化
- クエリパフォーマンスの監視と最適化

#### 1.3 実装例

**Settingsテーブルの拡張**:
```prisma
// 設定メタデータテーブル（動的設定項目の追加を可能にする）
model SettingsMetadata {
  id          String   @id @default(uuid())
  category    String   // 'basic', 'contact', 'email', 'seo', etc.
  key         String   // 設定キー（例: 'siteName', 'senderEmail'）
  type        String   // 'string', 'number', 'boolean', 'json'
  defaultValue String? // デフォルト値（JSON形式）
  description String?  // 設定項目の説明
  order       Int      // 表示順序
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([category, key])
  @@index([category, order])
}

// Settingsテーブルは既存の設計を維持しつつ、動的設定項目に対応
```

**JSON型の正規化例**:
```prisma
// スペース設備テーブル
model SpaceFacility {
  id          String   @id @default(uuid())
  spaceId     String
  facilityId  String
  space       Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  facility    Facility @relation(fields: [facilityId], references: [id])

  @@unique([spaceId, facilityId])
  @@index([spaceId])
}

model Facility {
  id          String   @id @default(uuid())
  name        String   @unique
  icon        String?  // アイコン名またはURL
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  spaces      SpaceFacility[]
}
```

### 2. API設計の拡張性

#### 2.1 現状の課題

**Server Actionsの分散**:
- Server Actionsが機能ごとに分散（`src/actions/admin/spaces.ts`, `src/actions/admin/blog.ts`など）
- 共通処理（認証チェック、エラーハンドリング、キャッシュ無効化）が各ファイルに重複
- コードの再利用性が低い

**バリデーションスキーマの分散**:
- バリデーションスキーマが各機能に分散（`src/lib/validations/reservation.ts`, `src/lib/validations/space.ts`など）
- 共通バリデーションルールの再利用が困難
- バリデーションロジックの重複

**エラーハンドリングの不統一**:
- エラーレスポンス形式が統一されていない可能性
- エラーハンドリングのパターンが各ファイルで異なる
- エラーログの構造化が不十分

#### 2.2 改善方針

**Server Actionsの共通処理抽象化**:
- 認証チェック、エラーハンドリング、キャッシュ無効化の共通処理を抽象化
- 共通処理を`src/lib/server-actions.ts`に集約
- 各Server Actionで共通処理を再利用

**バリデーションスキーマの共通化**:
- 共通バリデーションルールの抽出（`src/lib/validations/common.ts`）
- バリデーションスキーマの再利用性向上
- カスタムバリデーション関数の共通化

**統一されたエラーレスポンス形式**:
- 統一されたエラーレスポンス形式の定義（`src/lib/errors.ts`）
- **既存のエラーレスポンス形式**: [`API.md`](./API.md)で既に定義されている形式（`{ success: boolean; error?: string; details?: Record<string, unknown> }`）を拡張
- 既存のエラーコード（`VALIDATION_ERROR`, `AUTHENTICATION_ERROR`など）を活用
- エラーハンドリングの共通化
- エラーログの構造化

#### 2.3 実装例

**Server Actionsの共通処理抽象化**:
```typescript
// src/lib/server-actions.ts
import { auth } from '@/lib/auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import { ActionError, createActionError } from '@/lib/errors'

export type ActionResult<T = void> = 
  | { success: true; data?: T }
  | { success: false; error: string; details?: unknown }

export interface ActionOptions {
  requireAuth?: boolean
  requireAdmin?: boolean
  revalidatePaths?: string[]
  revalidateTags?: string[]
}

export async function withActionHandler<T>(
  handler: () => Promise<T>,
  options: ActionOptions = {}
): Promise<ActionResult<T>> {
  try {
    // 認証チェック
    if (options.requireAuth || options.requireAdmin) {
      const session = await auth()
      if (!session) {
        throw createActionError('UNAUTHORIZED', 'Authentication required')
      }
      if (options.requireAdmin && session.user.role !== 'admin') {
        throw createActionError('FORBIDDEN', 'Admin access required')
      }
    }

    // ハンドラー実行
    const result = await handler()

    // キャッシュ無効化
    if (options.revalidatePaths) {
      options.revalidatePaths.forEach(path => revalidatePath(path))
    }
    if (options.revalidateTags) {
      options.revalidateTags.forEach(tag => revalidateTag(tag))
    }

    return { success: true, data: result }
  } catch (error) {
    if (error instanceof ActionError) {
      return { success: false, error: error.message, details: error.details }
    }
    console.error('Unexpected error in action:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

// 使用例
export async function createSpace(data: CreateSpaceData): Promise<ActionResult<{ id: string }>> {
  return withActionHandler(
    async () => {
      const validatedData = createSpaceSchema.parse(data)
      const space = await prisma.space.create({ data: validatedData })
      return { id: space.id }
    },
    {
      requireAdmin: true,
      revalidatePaths: ['/spaces', `/spaces/${space.id}`],
      revalidateTags: ['spaces-list'],
    }
  )
}
```

**バリデーションスキーマの共通化**:
```typescript
// src/lib/validations/common.ts
import { z } from 'zod'

// 共通バリデーションルール
export const commonSchemas = {
  id: z.string().uuid(),
  email: z.string().email(),
  url: z.string().url(),
  phoneNumber: z.string().regex(/^[0-9-+()]+$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  nonEmptyString: (min: number = 1, max: number = 1000) =>
    z.string().min(min).max(max),
  positiveInt: z.number().int().positive(),
  nonNegativeDecimal: z.number().nonnegative(),
  timeString: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
  dateTime: z.date(),
  json: z.record(z.unknown()),
}

// カスタムバリデーション関数
export const customValidators = {
  uniqueSlug: async (slug: string, table: string, excludeId?: string) => {
    // スラッグの重複チェック
  },
  validImageUrl: (url: string) => {
    // Supabase Storage URLの検証
  },
  businessHours: (hours: Record<string, { start: string; end: string }>) => {
    // 営業時間の妥当性チェック（開始時間 < 終了時間）
  },
}
```

**統一されたエラーレスポンス形式**:
```typescript
// src/lib/errors.ts
export class ActionError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ActionError'
  }
}

export function createActionError(
  code: string,
  message: string,
  details?: unknown
): ActionError {
  return new ActionError(code, message, details)
}

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]
```

### 3. アーキテクチャの拡張性

#### 3.1 現状の課題

**コンポーネント構造の分散**:
- コンポーネントが機能ごとに分離されているが、共通パターンの抽象化が不足
- CRUD操作、フォーム処理、リスト表示などの共通パターンが各機能で重複実装
- コンポーネントの再利用性が低い

**レイヤー分離の不明確さ**:
- Presentation層（コンポーネント）、Business Logic層（Server Actions）、Data Access層（Prisma）の分離が不明確
- 各レイヤー間の依存関係が複雑
- レイヤー間のインターフェースが定義されていない

**依存関係の管理**:
- 依存関係が各ファイルに分散
- モジュール間の依存関係が可視化されていない
- 依存関係の変更時の影響範囲が把握しにくい

#### 3.2 改善方針

**共通パターンの抽象化**:
- CRUD操作の共通パターン抽象化（`src/lib/crud.ts`）
- フォーム処理の共通パターン抽象化（`src/lib/forms.ts`）
- リスト表示の共通パターン抽象化（`src/lib/lists.ts`）

**レイヤー分離の明確化**:
- Presentation層、Business Logic層、Data Access層の明確化
- **既存アーキテクチャとの整合性**: 
  - Next.js 16 App RouterのServer Components優先アーキテクチャを尊重（[`ARCHITECTURE.md`](./ARCHITECTURE.md)、[`BEST_PRACTICES.md`](./BEST_PRACTICES.md)参照）
  - Server Components（Presentation層）、Server Actions（Business Logic層）、Prisma（Data Access層）の分離を明確化
- 各レイヤー間の依存関係の整理
- レイヤー間のインターフェース定義

**依存関係の一元管理**:
- 依存関係の一元管理（`src/lib/dependencies.ts`）
- DIパターンの導入検討
- モジュール間の依存関係の可視化

#### 3.3 実装例

**CRUD操作の共通パターン抽象化**:
```typescript
// src/lib/crud.ts
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

export interface CrudOptions<T> {
  schema: z.ZodSchema<T>
  include?: Record<string, boolean>
  select?: Record<string, boolean>
  orderBy?: Record<string, 'asc' | 'desc'>
}

export class CrudService<T extends { id: string }> {
  constructor(
    private prisma: PrismaClient,
    private model: string,
    private options: CrudOptions<T>
  ) {}

  async findMany(params?: {
    where?: Record<string, unknown>
    skip?: number
    take?: number
  }): Promise<T[]> {
    // 共通のfindMany実装
  }

  async findUnique(id: string): Promise<T | null> {
    // 共通のfindUnique実装
  }

  async create(data: unknown): Promise<T> {
    // バリデーションと作成
    const validatedData = this.options.schema.parse(data)
    // Prisma操作
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    // バリデーションと更新
  }

  async delete(id: string): Promise<void> {
    // 削除
  }
}
```

**レイヤー分離の明確化**:
```typescript
// src/lib/layers/data-access.ts
// Data Access層: Prisma操作の抽象化
export interface DataAccessLayer<T> {
  findMany(params?: FindManyParams): Promise<T[]>
  findUnique(id: string): Promise<T | null>
  create(data: CreateData<T>): Promise<T>
  update(id: string, data: UpdateData<T>): Promise<T>
  delete(id: string): Promise<void>
}

// src/lib/layers/business-logic.ts
// Business Logic層: ビジネスロジックの実装
export interface BusinessLogicLayer<T> {
  list(params?: ListParams): Promise<ListResult<T>>
  get(id: string): Promise<T>
  create(data: CreateData<T>): Promise<T>
  update(id: string, data: UpdateData<T>): Promise<T>
  delete(id: string): Promise<void>
}

// src/lib/layers/presentation.ts
// Presentation層: UIコンポーネントとのインターフェース
export interface PresentationLayer<T> {
  renderList(params?: ListParams): React.ReactElement
  renderForm(data?: T): React.ReactElement
  renderDetail(id: string): React.ReactElement
}
```

### 4. 機能追加の容易さ

#### 4.1 現状の課題

**新機能追加時の影響範囲**:
- 新機能追加時に複数のファイルを変更する必要がある
- ルーティング、Server Actions、バリデーション、コンポーネントなど複数箇所の変更が必要
- 影響範囲の把握が困難

**設定の柔軟性**:
- 一部の設定がハードコードされている可能性
- 設定の変更時にコード変更が必要
- 動的設定の実現が困難

**機能モジュールの独立性**:
- 機能モジュール間の依存関係が複雑
- 機能の追加・削除が困難
- 機能の有効化・無効化ができない

#### 4.2 改善方針

**プラグイン的な機能追加**:
- 機能モジュールの独立性向上
- 機能追加時の影響範囲の最小化
- 機能モジュールの登録・有効化機能

**設定の外部化と動的設定**:
- ハードコードされた値の設定外部化
- 動的設定の実現（Settingsテーブルからの読み込み）
- 設定のバリデーションとデフォルト値の管理

**機能モジュールの独立性向上**:
- 機能モジュールのインターフェース定義
- 機能モジュールの登録システム
- 機能モジュール間の依存関係の管理

#### 4.3 実装例

**プラグイン的な機能追加**:
```typescript
// src/lib/plugins.ts
export interface Plugin {
  id: string
  name: string
  version: string
  enabled: boolean
  routes?: RouteConfig[]
  actions?: ActionConfig[]
  components?: ComponentConfig[]
  dependencies?: string[]
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map()

  register(plugin: Plugin): void {
    // プラグインの登録
    // 依存関係のチェック
    // ルーティング、Server Actions、コンポーネントの登録
  }

  unregister(pluginId: string): void {
    // プラグインの削除
  }

  enable(pluginId: string): void {
    // プラグインの有効化
  }

  disable(pluginId: string): void {
    // プラグインの無効化
  }
}
```

**設定の外部化と動的設定**:
```typescript
// src/lib/config.ts
export interface ConfigValue {
  key: string
  value: unknown
  type: 'string' | 'number' | 'boolean' | 'json'
  defaultValue?: unknown
  description?: string
}

export class ConfigManager {
  private cache: Map<string, ConfigValue> = new Map()

  async get<T>(key: string, defaultValue?: T): Promise<T> {
    // Settingsテーブルから設定を取得
    // キャッシュから取得（あれば）
    // デフォルト値の適用
  }

  async set(key: string, value: unknown): Promise<void> {
    // Settingsテーブルに設定を保存
    // キャッシュの更新
    // キャッシュ無効化
  }

  async getAll(): Promise<Record<string, unknown>> {
    // すべての設定を取得
  }
}
```

### 5. スケーラビリティ

#### 5.1 現状の課題

**キャッシュ戦略の不統一**:
- キャッシュキーの命名規則が統一されていない
- キャッシュ無効化のタイミングが各機能で異なる
- キャッシュ戦略の最適化が不十分

**データベースクエリの最適化**:
- 一部のクエリでN+1問題が発生している可能性
- クエリパフォーマンスの監視が不十分
- インデックスの最適化が不十分

**ページネーションと遅延読み込み**:
- ページネーションの実装が一部不十分
- 遅延読み込みの実装が不十分
- 大量データの処理が困難

#### 5.2 改善方針

**キャッシュ戦略の統一と最適化**:
- キャッシュキーの命名規則の統一
- キャッシュ無効化の自動化
- キャッシュ戦略の最適化
- **既存のキャッシュ戦略**: 詳細は [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) を参照
  - 既存のキャッシュAPI（`revalidatePath`, `revalidateTag`, `updateTag`, `refresh`）を活用
  - 既存のキャッシュタグ（`site-settings`, `spaces-list`など）を尊重

**データベースクエリの最適化**:
- クエリパフォーマンスの監視
- N+1問題の解決
- インデックスの最適化

**ページネーションと遅延読み込みの徹底**:
- ページネーションの統一実装
- 遅延読み込みの実装
- 大量データの処理最適化

#### 5.3 実装例

**キャッシュ戦略の統一**:
```typescript
// src/lib/cache.ts
export class CacheManager {
  private static cacheKeyPrefix = 'myrrh-rental-space'

  static generateKey(category: string, id?: string): string {
    if (id) {
      return `${this.cacheKeyPrefix}:${category}:${id}`
    }
    return `${this.cacheKeyPrefix}:${category}`
  }

  static async get<T>(key: string): Promise<T | null> {
    // キャッシュから取得
  }

  static async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // キャッシュに保存
  }

  static async invalidate(pattern: string): Promise<void> {
    // パターンに一致するキャッシュを無効化
  }

  static async invalidateByTag(tag: string): Promise<void> {
    // タグに関連するキャッシュを無効化
  }
}
```

**データベースクエリの最適化**:
```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
})

// クエリパフォーマンスの監視
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: { query: string; duration: number }) => {
    if (e.duration > 100) {
      console.warn(`Slow query detected: ${e.query} (${e.duration}ms)`)
    }
  })
}

export { prisma }
```

### 6. 保守性

#### 6.1 現状の課題

**コードの可読性**:
- 共通処理の抽象化が不足
- コードの重複が多い
- 命名規則が統一されていない可能性

**テスト容易性**:
- 依存性注入が導入されていない
- モック可能なインターフェースが定義されていない
- テストユーティリティが不足

**ドキュメント整備**:
- コードのドキュメントが不足
- API仕様のドキュメント化が不十分
- アーキテクチャのドキュメント化が不十分

#### 6.2 改善方針

**共通処理の抽象化とユーティリティ化**:
- 共通処理の抽象化（`src/lib/utils.ts`の拡張）
- ユーティリティ関数の整理とドキュメント化
- 型安全性の向上

**テスト容易性の向上**:
- 依存性注入の導入検討
- モック可能なインターフェースの定義
- テストユーティリティの整備

**ドキュメント整備**:
- コードのドキュメント化（JSDoc）
- API仕様のドキュメント化
- アーキテクチャのドキュメント化

#### 6.3 実装例

**テストユーティリティの整備**:
```typescript
// src/lib/test-utils.ts
import { PrismaClient } from '@prisma/client'
import { mockDeep, DeepMockProxy } from 'jest-mock-extended'

export type MockPrisma = DeepMockProxy<PrismaClient>

export function createMockPrisma(): MockPrisma {
  return mockDeep<PrismaClient>()
}

export function createTestContext() {
  const prisma = createMockPrisma()
  return {
    prisma,
    // その他のテスト用コンテキスト
  }
}
```

---

## 実装方針

### フェーズ1: 基盤整備（高優先度）

#### 1.1 Server Actionsの共通処理抽象化

**目的**: Server Actionsの認証チェック、エラーハンドリング、キャッシュ無効化を共通化し、コードの重複を削減する。

**実装内容**:
- `src/lib/server-actions.ts`: 共通処理の抽象化
- `src/lib/errors.ts`: 統一されたエラーレスポンス形式の定義
- 各Server Actionのリファクタリング

**影響範囲**:
- `src/actions/admin/*.ts`: すべての管理画面用Server Actions
- `src/actions/reservation.ts`: 予約関連Server Actions
- `src/actions/inquiry.ts`: お問い合わせ関連Server Actions

**期待される効果**:
- コードの重複削減（約30-40%）
- エラーハンドリングの統一
- 保守性の向上

#### 1.2 バリデーションスキーマの共通化

**目的**: 共通バリデーションルールを抽出し、バリデーションスキーマの再利用性を向上させる。

**実装内容**:
- `src/lib/validations/common.ts`: 共通バリデーションルール
- 各バリデーションスキーマのリファクタリング

**影響範囲**:
- `src/lib/validations/*.ts`: すべてのバリデーションスキーマ

**期待される効果**:
- バリデーションロジックの重複削減
- バリデーションルールの一元管理
- 型安全性の向上

#### 1.3 キャッシュ戦略の統一

**目的**: キャッシュキーの命名規則を統一し、キャッシュ無効化を自動化する。

**実装内容**:
- `src/lib/cache.ts`: キャッシュ戦略の統一
- Server Actionsでのキャッシュ無効化の自動化

**影響範囲**:
- すべてのServer Actions
- `src/lib/server-actions.ts`: 共通処理でのキャッシュ無効化

**期待される効果**:
- キャッシュ戦略の統一
- キャッシュ無効化の自動化
- パフォーマンスの向上

### フェーズ2: アーキテクチャ改善（中優先度）

#### 2.1 共通パターンの抽象化

**目的**: CRUD操作、フォーム処理、リスト表示などの共通パターンを抽象化し、コードの再利用性を向上させる。

**実装内容**:
- `src/lib/crud.ts`: CRUD操作の共通処理
- `src/lib/forms.ts`: フォーム処理の共通処理
- `src/lib/lists.ts`: リスト表示の共通処理

**影響範囲**:
- 管理画面の各機能（スペース管理、ブログ管理、顧客管理など）

**期待される効果**:
- コードの再利用性向上
- 新機能追加時の開発時間短縮（約20-30%）
- 保守性の向上

#### 2.2 レイヤー分離の明確化

**目的**: Presentation層、Business Logic層、Data Access層を明確に分離し、各レイヤー間の依存関係を整理する。

**実装内容**:
- `src/lib/layers/`: レイヤー分離の実装
- 各レイヤー間のインターフェース定義

**影響範囲**:
- すべてのコンポーネントとServer Actions

**期待される効果**:
- アーキテクチャの明確化
- テスト容易性の向上
- 保守性の向上

#### 2.3 設定の外部化と動的設定

**目的**: ハードコードされた値を設定外部化し、動的設定を実現する。

**実装内容**:
- `src/lib/config.ts`: 設定管理の共通処理
- Settingsテーブルからの設定読み込み

**影響範囲**:
- すべてのコンポーネントとServer Actions

**期待される効果**:
- 設定の柔軟性向上
- コード変更なしでの設定変更が可能
- 保守性の向上

### フェーズ3: 最適化と拡張（低優先度）

#### 3.1 データベース設計の拡張性向上

**目的**: JSON型の使用を見直し、データベース設計の拡張性を向上させる。

**実装内容**:
- JSON型の正規化（`SpaceFacilities`テーブルなど）
- インデックス設計の最適化

**影響範囲**:
- `prisma/schema.prisma`: データベーススキーマ
- マイグレーションの作成と実行

**期待される効果**:
- 型安全性の向上
- クエリパフォーマンスの向上
- データベース設計の拡張性向上

#### 3.2 プラグイン的な機能追加

**目的**: 機能モジュールの独立性を向上させ、プラグイン的な機能追加を可能にする。

**実装内容**:
- `src/lib/plugins.ts`: プラグインシステムの実装
- 機能モジュールのインターフェース定義

**影響範囲**:
- すべての機能モジュール

**期待される効果**:
- 機能追加の容易さ向上
- 機能の有効化・無効化が可能
- 保守性の向上

#### 3.3 テスト容易性の向上

**目的**: 依存性注入を導入し、テスト容易性を向上させる。

**実装内容**:
- `src/lib/test-utils.ts`: テストユーティリティの整備
- 依存性注入の導入検討

**影響範囲**:
- すべてのテストファイル

**期待される効果**:
- テスト容易性の向上
- テストカバレッジの向上
- 品質の向上

---

## 実装優先順位

### 優先度の基準

1. **高優先度**: 開発効率と保守性に直接影響する基盤整備
2. **中優先度**: アーキテクチャの改善とコードの再利用性向上
3. **低優先度**: 最適化と将来の拡張性向上

### 実装スケジュール

#### フェーズ1: 基盤整備（1-2週間）

1. **Server Actionsの共通処理抽象化**（3-4日）
   - `src/lib/server-actions.ts`の実装
   - `src/lib/errors.ts`の実装
   - 既存Server Actionsのリファクタリング

2. **バリデーションスキーマの共通化**（2-3日）
   - `src/lib/validations/common.ts`の実装
   - 既存バリデーションスキーマのリファクタリング

3. **キャッシュ戦略の統一**（2-3日）
   - `src/lib/cache.ts`の実装
   - Server Actionsでのキャッシュ無効化の自動化

#### フェーズ2: アーキテクチャ改善（2-3週間）

4. **共通パターンの抽象化**（1週間）
   - `src/lib/crud.ts`の実装
   - `src/lib/forms.ts`の実装
   - `src/lib/lists.ts`の実装

5. **レイヤー分離の明確化**（1週間）
   - `src/lib/layers/`の実装
   - 各レイヤー間のインターフェース定義

6. **設定の外部化と動的設定**（3-4日）
   - `src/lib/config.ts`の実装
   - Settingsテーブルからの設定読み込み

#### フェーズ3: 最適化と拡張（2-3週間）

7. **データベース設計の拡張性向上**（1週間）
   - JSON型の正規化
   - インデックス設計の最適化

8. **プラグイン的な機能追加**（1週間）
   - `src/lib/plugins.ts`の実装
   - 機能モジュールのインターフェース定義

9. **テスト容易性の向上**（3-4日）
   - `src/lib/test-utils.ts`の整備
   - 依存性注入の導入検討

---

## 期待される効果

### 開発効率の向上

- **コード量の削減**: 共通処理の抽象化により、新機能追加時のコード量が約20-30%削減
- **開発時間の短縮**: 共通パターンの抽象化により、新機能追加時の開発時間が約20-30%短縮
- **バグの発生率低下**: 共通処理の統一により、バグの発生率が約30-40%低下

### 保守性の向上

- **コードの可読性向上**: 共通処理の抽象化により、コードの可読性が向上
- **テスト容易性の向上**: 依存性注入とテストユーティリティにより、テスト容易性が向上
- **ドキュメント整備**: 各抽象化レイヤーのドキュメント化により、理解が促進される

### スケーラビリティの向上

- **パフォーマンス最適化**: キャッシュ戦略の統一とデータベースクエリの最適化により、パフォーマンスが向上
- **負荷軽減**: キャッシュ戦略の最適化により、サーバー負荷が軽減
- **応答時間短縮**: データベースクエリの最適化により、応答時間が短縮

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) - データベース設計
- [`API.md`](./API.md) - API仕様
- [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) - ベストプラクティス
- [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) - プロジェクト構造
- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md) - 機能要件
- [`EMAIL_REQUIREMENTS.md`](./EMAIL_REQUIREMENTS.md) - メール送信機能要件
- [`SETTINGS_REQUIREMENTS.md`](./SETTINGS_REQUIREMENTS.md) - サイト設定画面要件
- [`BLOG_REQUIREMENTS.md`](./BLOG_REQUIREMENTS.md) - ブログ機能要件
- [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) - キャッシュ戦略
- [`EXTENSIBILITY_PLAN_CONSISTENCY_CHECK.md`](./EXTENSIBILITY_PLAN_CONSISTENCY_CHECK.md) - 整合性チェック結果

### 外部リソース

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Zod Documentation](https://zod.dev/)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)

---

## 更新履歴

- **2026-01-06**: 初版作成、拡張性に関する包括的な分析と実装計画を追加
