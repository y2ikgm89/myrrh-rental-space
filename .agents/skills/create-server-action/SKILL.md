---
name: create-server-action
description: >
  管理画面の Server Action ファイルをフルスキャフォールドで生成する。
  executeAdminMutationResult パターンに準拠した CRUD アクションと Zod スキーマを一括作成する。
  新しいリソース（モデル）を管理画面に追加する際に使用。
  引数ヒント: <resource-name>
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

executeAdminMutationResult CRUD のテンプレート:

```typescript
'use server'

import { updateTag } from 'next/cache'
import { executeAdminMutationResult } from '@/admin/lib/admin-action'
import { createValidationMutationError } from '@/shared/lib/action-helpers'
import type { MutationResult } from '@/shared/lib/mutation-result'
import { CACHE_TAGS } from '@/shared/lib/constants'
import {
  create<ResourcePascal>Command,
  update<ResourcePascal>Command,
  delete<ResourcePascal>Command,
} from '@/shared/domain/<name>/commands'
import {
  <name>FormSchema,
  type <ResourcePascal>FormInput,
} from '@/shared/lib/validations/<name>'

// =============================================================================
// Write Actions
// =============================================================================

export async function create<ResourcePascal>(
  input: <ResourcePascal>FormInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = <name>FormSchema.safeParse(input)
  if (!parsed.success) return createValidationMutationError(parsed.error)

  return executeAdminMutationResult({
    resource: '<name>',
    action: 'create',
    execute: async () => create<ResourcePascal>Command(parsed.data),
    afterSuccess: () => { updateTag(CACHE_TAGS.<NAME_UPPER>) },
    resolveAuditResourceId: (data) => data.id,
  })
}

export async function update<ResourcePascal>(
  id: string,
  input: <ResourcePascal>FormInput,
): Promise<MutationResult<null>> {
  const parsed = <name>FormSchema.safeParse(input)
  if (!parsed.success) return createValidationMutationError(parsed.error)

  return executeAdminMutationResult({
    resource: '<name>',
    action: 'update',
    resourceId: id,
    execute: async () => update<ResourcePascal>Command(id, parsed.data),
    afterSuccess: () => { updateTag(CACHE_TAGS.<NAME_UPPER>) },
  })
}

export async function delete<ResourcePascal>(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: '<name>',
    action: 'delete',
    resourceId: id,
    execute: async () => delete<ResourcePascal>Command(id),
    afterSuccess: () => { updateTag(CACHE_TAGS.<NAME_UPPER>) },
  })
}
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
- **`executeAdminMutationResult` の `resource` / `action` は `permissions.ts` の定義と一致させる**
- **`CACHE_TAGS.<NAME_UPPER>` が存在しない場合は `cache.ts` に追加してから `updateTag` を呼ぶ**
