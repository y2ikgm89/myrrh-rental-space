# Prisma 7 ガイド

> **最終更新**: 2026-01-07（prisma.config.ts 公式推奨パターンに更新）
> **Prisma バージョン**: 7.2.0

## 概要

このドキュメントには、Prisma 7でのインポート方法、移行手順、ベストプラクティスが記載されています。

---

## Prisma 7での重要な変更点

### 1. カスタム出力パスの指定が必須

**Prisma 7では、カスタム出力パスの指定が必須になりました。**

- **Prisma 6.6.0以前**: デフォルトで`node_modules/.prisma/client`に生成
- **Prisma 6.6.0**: カスタム出力パス未指定で警告
- **Prisma 7.0.0以降**: カスタム出力パスの指定が**必須**

### 2. インポート方法の変更

カスタム出力パスを指定した場合、`@prisma/client`からのインポートは**動作しません**。

---

## 推奨されるインポート方法（Prisma 7）

### ✅ 推奨パターン: カスタム出力パスを使用

**スキーマファイルの設定:**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma/client"
}
```

> **注意**: `output` は `prisma/schema.prisma` からの相対パスです。
> `../src/generated/prisma/client` → `src/generated/prisma/client` に出力されます。

**インポート方法:**

```typescript
// ✅ Prisma 7の推奨: カスタム出力パスからインポート
import { PrismaClient, Prisma } from '@/generated/prisma/client'
import type { StockStatus } from '@/generated/prisma/client'

// PrismaClientのインスタンス化
const prisma = new PrismaClient()

// 型の使用
const where: Prisma.CustomerWhereInput = {}
```

**利点:**
- Prisma 7の最新推奨に準拠
- プロジェクト構造が明確
- バンドルサイズの最適化
- ESMとの互換性が向上

### ❌ 非推奨パターン: @prisma/clientからのインポート

```typescript
// ❌ Prisma 7では非推奨（カスタム出力パス指定時は動作しない）
import { PrismaClient, Prisma } from '@prisma/client'
```

**問題点:**
- カスタム出力パスを指定した場合、動作しない
- Prisma 7の推奨に反する
- 将来のバージョンで完全に削除される可能性

---

## プロジェクトでの実装方針

### 現在の状況

**✅ 更新完了**: すべてのドキュメントを`@/generated/prisma/client`に統一しました。

### 推奨される対応

1. **スキーマファイルの確認と設定**
   ```prisma
   // prisma/schema.prisma
   generator client {
     provider = "prisma-client"
     output   = "../src/generated/prisma/client"
   }

   datasource db {
     provider = "postgresql"
   }
   ```

2. **prisma.config.ts の設定（マイグレーション用）**
   Prisma 7 ではマイグレーション用の接続URLを `prisma.config.ts` で設定します:
   ```typescript
   // prisma/prisma.config.ts
   import 'dotenv/config'
   import { defineConfig, env } from 'prisma/config'

   export default defineConfig({
     schema: 'schema.prisma',
     datasource: {
       url: env('DATABASE_URL'),
     },
   })
   ```

   **重要なポイント:**
   - `import 'dotenv/config'`: 環境変数を自動読み込み（`bun add dotenv` が必要）
   - `env()` ヘルパー: 型安全な環境変数アクセス（必須の場合はエラーをスロー）
   - `schema`: 相対パス（`prisma.config.ts` からの相対）
   - `earlyAccess: true` は**不要**（正式版では削除）

3. **インポートパスの解決（2つのアプローチ）**
   Prisma 7 は `client.ts` を生成します。TypeScript でインポートするには2つの方法があります:

   **方法A: `/client/client` を直接指定（推奨・メンテナンスフリー）**
   ```typescript
   // ✅ prisma generate 後も安定
   import { PrismaClient } from '@/generated/prisma/client/client'
   ```

   **方法B: index.ts を作成**
   ```typescript
   // src/generated/prisma/client/index.ts（手動作成）
   export * from './client'
   ```
   ```typescript
   // これで @/generated/prisma/client でインポート可能
   import { PrismaClient } from '@/generated/prisma/client'
   ```

   > **注意**: 方法Bの index.ts は `prisma generate` で上書きされません。
   > ただし、将来の Prisma バージョンで自動生成される可能性があります。

4. **すべてのインポートを統一**
   ```typescript
   // ✅ 統一されたインポートパターン
   import { PrismaClient, Prisma } from '@/generated/prisma/client'
   import type { StockStatus } from '@/generated/prisma/client'
   ```

5. **ドキュメントの更新**
   - すべてのドキュメントで`@prisma/client`を`@/generated/prisma/client`に更新

---

## 具体的なインポートパターン

### パターン1: PrismaClientとPrisma型の両方を使用

```typescript
// src/lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '@/generated/prisma/client'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**注意**: Prisma 7では、データベース接続にドライバーアダプターが必要です。PostgreSQLの場合は`@prisma/adapter-pg`を使用します。詳細は[`TYPE_SAFETY_REQUIREMENTS.md`](../requirements/TYPE_SAFETY_REQUIREMENTS.md)を参照してください。

### パターン2: 型のみを使用（PrismaClientは別途インポート）

```typescript
// src/app/(admin)/admin/customers/page.tsx
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

// 型安全なwhere条件の構築
const where: Prisma.CustomerWhereInput = {}
const customers = await prisma.customer.findMany({ where })
```

### パターン3: Enum型のインポート

```typescript
// ✅ Enum型のインポート
import type { StockStatus } from '@/generated/prisma/client'

const status: StockStatus = 'IN_STOCK'
```

---

## 移行レポート

### 実行内容

Prisma 7では、カスタム出力パスの指定が必須となり、`@prisma/client`からのインポートが非推奨になりました。プロジェクト全体のドキュメントを`@/generated/prisma/client`に統一しました。

### 更新したドキュメント一覧

#### ドキュメントファイル

1. ✅ **`docs/architecture/DATABASE_DESIGN.md`**
   - `import { PrismaClient } from '@prisma/client'` → `import { PrismaClient } from '@/generated/prisma/client'`

2. ✅ **`docs/development/BEST_PRACTICES.md`** (2箇所)
   - `import { Prisma } from '@prisma/client'` → `import type { Prisma } from '@/generated/prisma/client'`

3. ✅ **`docs/architecture/PROJECT_STRUCTURE.md`**
   - `import { PrismaClient } from '@prisma/client'` → `import { PrismaClient } from '@/generated/prisma/client'`

4. ✅ **`docs/development/BUN_RUNTIME.md`**
   - `import { PrismaClient } from '@prisma/client'` → `import { PrismaClient } from '@/generated/prisma/client'`

5. ✅ **`docs/architecture/DATABASE_DESIGN.md`** (Customersセクション)
   - `import type { Prisma } from '@prisma/client'` → `import type { Prisma } from '@/generated/prisma/client'`
   - 注: `CUSTOMER_NAME_DESIGN.md`の内容は`DATABASE_DESIGN.md`のCustomersセクションに統合されました

6. ✅ **`docs/deployment/DOCKER.md`**
   - Prismaクライアントのコピーコマンドを更新
   - `node_modules/.prisma`と`node_modules/@prisma`のコピーを削除
   - `generated/prisma/client`のコピーを追加

#### プロジェクトルールファイル

7. ✅ **`.cursor/rules/code-style/RULE.md`**
   - `import { Prisma } from '@prisma/client'` → `import type { Prisma } from '@/generated/prisma/client'`

8. ✅ **`.cursor/skills/typescript-strict/SKILL.md`**
   - `import { PrismaClient } from '@prisma/client'` → `import { PrismaClient } from '@/generated/prisma/client'`
   - 説明文も更新: "Import types from `@prisma/client`" → "Import types from `@/generated/prisma/client`"

9. ✅ **`.cursor/skills/prisma-7/SKILL.md`**
   - `import { Prisma } from '@prisma/client'` → `import type { Prisma } from '@/generated/prisma/client'`

### 整合性確認結果

#### ✅ 統一されたパターン

すべてのドキュメントで以下のパターンに統一されました：

```typescript
// PrismaClientのインポート
import { PrismaClient } from '@/generated/prisma/client'

// Prisma型のインポート（型のみ使用する場合）
import type { Prisma } from '@/generated/prisma/client'

// Enum型のインポート
import type { StockStatus } from '@/generated/prisma/client'
```

#### ✅ 整合性チェック

- **ドキュメント間の整合性**: ✅ すべて統一
- **プロジェクトルールとの整合性**: ✅ すべて統一
- **Docker設定との整合性**: ✅ カスタム出力パスに対応
- **README.mdとの整合性**: ✅ PRISMA_7.mdへの参照を追加

#### ✅ 破綻チェック

- **矛盾する記述**: なし
- **古いパターンの残存**: なし（説明文を除く）
- **参照の不整合**: なし

---

## 移行チェックリスト

- [x] `prisma/schema.prisma`でカスタム出力パスが設定されているか確認
- [x] すべての`@prisma/client`インポートを`@/generated/prisma/client`に変更
- [x] 実際のコードファイルのインポートを更新
- [x] `bunx prisma generate`を実行してクライアントを生成
- [x] `src/generated/prisma/client/index.ts` を作成（モジュール解決用）
- [x] 型エラーがないか確認（`bun run type-check`）
- [x] ドキュメント内のインポート例を更新

---

## 参考資料

- [Prisma Config Reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference) - `prisma.config.ts` の公式リファレンス
- [Upgrading to Prisma 7](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7) - 移行ガイド
- [Generating Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client)
- [Prisma Schema Reference: Generator](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#generator)

---

## 結論

**Prisma 7では、`@/generated/prisma/client`からのインポートが推奨されます。**

`import type { StockStatus } from "@/generated/prisma/client"`は、Prisma 7の最新推奨に完全に準拠しています。

プロジェクト全体でこのパターンに統一することを強く推奨します。
