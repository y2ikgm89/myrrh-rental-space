---
name: create-server-action
description: >
  管理画面の Server Action ファイルをフルスキャフォールドで生成する。
  withPermission パターンに準拠した CRUD アクションと Zod スキーマを一括作成する。
  新しいリソース（モデル）を管理画面に追加する際に使用。
argument-hint: "<resource-name>"
---

# Server Action スキャフォールダー

引数として受け取ったリソース名（例: `location`, `announcement`）から:

1. `src/app/(admin)/admin/(dashboard)/_shared/actions/<name>.ts`
2. `src/shared/lib/validations/<name>.ts`

の2ファイルを生成する。

## Step 1: リソース名の確認

引数からリソース名を特定する:

- `kebab-case` を `camelCase`・`PascalCase` に変換（例: `api-key` → `apiKey`・`ApiKey`）
- 複数形のラベルを決定（例: `location` → `Locations`）

引数が提供されていない場合はユーザーに聞く。

## Step 2: 既存ファイルのチェック

```bash
# 既存ファイルがあれば上書きしない
ls "$CLAUDE_PROJECT_DIR/src/app/(admin)/admin/(dashboard)/_shared/actions/<name>.ts" 2>/dev/null && echo "ALREADY_EXISTS"
ls "$CLAUDE_PROJECT_DIR/src/shared/lib/validations/<name>.ts" 2>/dev/null && echo "ALREADY_EXISTS"
```

既存ファイルがある場合はユーザーに確認してから続行。

## Step 3: CACHE_TAGS 確認

```bash
grep "CACHE_TAGS\." "$CLAUDE_PROJECT_DIR/src/shared/lib/constants/cache.ts" | grep -i "<NAME_UPPER>"
```

対応する `CACHE_TAGS.<NAME_UPPER>` が存在しない場合は、生成後に `src/shared/lib/constants/cache.ts` への追加が必要な旨を案内する。

## Step 4: ファイル生成

### `src/shared/lib/validations/<name>.ts`

Zod 4 スキーマのテンプレート:

```typescript
/**
 * <ResourceLabel> バリデーションスキーマ
 */

import { z } from 'zod'

// =============================================================================
// <ResourcePascal> Form Schema (Admin)
// =============================================================================

export const <name>FormSchema = z.object({
  name: z
    .string()
    .min(1, { error: '名称を入力してください' })
    .max(100, { error: '名称は100文字以内で入力してください' }),
  // TODO: フィールドを追加する
})

export type <ResourcePascal>FormInput = z.input<typeof <name>FormSchema>
export type <ResourcePascal>FormOutput = z.output<typeof <name>FormSchema>
```

### `src/app/(admin)/admin/(dashboard)/_shared/actions/<name>.ts`

withPermission CRUD のテンプレート:

```typescript
'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import {
  <name>FormSchema,
  type <ResourcePascal>FormInput,
} from '@/shared/lib/validations/<name>'
import { logError, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

// =============================================================================
// Types
// =============================================================================

export type <ResourcePascal>Data = {
  id: string
  name: string
  createdAt: string  // toISOString() 済み（Server→Client 境界）
  updatedAt: string
}

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('<name>')

// =============================================================================
// Read Actions
// =============================================================================

export async function getAdmin<ResourcePascals>(): Promise<<ResourcePascal>Data[]> {
  if (!(await checkReadPermission())) return []

  try {
    const items = await prisma.<name>.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }))
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getAdmin<ResourcePascals>' },
    })
    return []
  }
}

// =============================================================================
// Write Actions
// =============================================================================

export const create<ResourcePascal> = withPermission<[<ResourcePascal>FormInput], { id: string }>(
  '<name>',
  'create',
)(async (_user, input) => {
  const parsed = <name>FormSchema.safeParse(input)
  if (!parsed.success) return createValidationError(parsed.error)

  try {
    const item = await prisma.<name>.create({ data: parsed.data })
    updateTag(CACHE_TAGS.<NAME_UPPER>)
    return createSuccess('<ResourceLabel>を作成しました', { id: item.id })
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'create<ResourcePascal>' },
    })
    return createFailure('<ResourceLabel>の作成に失敗しました')
  }
})

export const update<ResourcePascal> = withPermission<[string, <ResourcePascal>FormInput]>(
  '<name>',
  'update',
)(async (_user, id, input) => {
  const parsed = <name>FormSchema.safeParse(input)
  if (!parsed.success) return createValidationError(parsed.error)

  const existing = await prisma.<name>.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return createFailure('<ResourceLabel>が見つかりません')

  try {
    await prisma.<name>.update({ where: { id }, data: parsed.data })
    updateTag(CACHE_TAGS.<NAME_UPPER>)
    return createSuccess('<ResourceLabel>を更新しました')
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'update<ResourcePascal>', id },
    })
    return createFailure('<ResourceLabel>の更新に失敗しました')
  }
})

export const delete<ResourcePascal> = withPermission<[string]>(
  '<name>',
  'delete',
)(async (_user, id) => {
  const existing = await prisma.<name>.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return createFailure('<ResourceLabel>が見つかりません')

  try {
    await prisma.<name>.delete({ where: { id } })
    updateTag(CACHE_TAGS.<NAME_UPPER>)
    return createSuccess('<ResourceLabel>を削除しました')
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'delete<ResourcePascal>', id },
    })
    return createFailure('<ResourceLabel>の削除に失敗しました')
  }
})
```

## Step 5: テンプレート変数の置換

| プレースホルダー    | 変換規則                               | 例（`location`） |
| ------------------- | -------------------------------------- | ---------------- |
| `<name>`            | そのまま                               | `location`       |
| `<ResourcePascal>`  | PascalCase                             | `Location`       |
| `<ResourcePascals>` | PascalCase 複数形                      | `Locations`      |
| `<ResourceLabel>`   | 日本語ラベル（ユーザーに確認 or 推測） | `ロケーション`   |
| `<NAME_UPPER>`      | UPPER_SNAKE_CASE                       | `LOCATIONS`      |

## Step 6: 生成後のチェックリスト

生成したファイルについて以下を案内する:

```
## 生成完了チェックリスト

- [ ] `src/shared/lib/constants/cache.ts` に `CACHE_TAGS.<NAME_UPPER>` を追加
- [ ] `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts` に権限を追加
      （`'<name>'` リソースの `create` / `update` / `delete` / `read`）
- [ ] Prisma スキーマにモデルが存在するか確認
      （なければ `/prisma-migration` スキルで追加）
- [ ] `<name>FormSchema` のフィールドを実際のモデルに合わせて更新
- [ ] `<ResourcePascal>Data` 型のフィールドを実際のモデルに合わせて更新
- [ ] Date フィールドが複数ある場合は全て `.toISOString()` を適用
- [ ] `bun run type-check` で型エラーがないことを確認
```

## 注意事項

- **`'use server'` ファイルは `import 'server-only'` 不要** — `'use server'` ディレクティブで境界制御済み
- **Date フィールドは `string` 型で宣言** — Server→Client 境界シリアライゼーション（`prisma-patterns.md` 参照）
- **`withPermission` の第1引数はリソース名、第2引数は操作名** — `permissions.ts` の定義と一致させる
- **`CACHE_TAGS.<NAME_UPPER>` が存在しない場合は `cache.ts` に追加してから `updateTag` を呼ぶ**
