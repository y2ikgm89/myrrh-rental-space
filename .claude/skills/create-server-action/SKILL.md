---
name: create-server-action
description: >
  管理画面の Server Action ファイルをフルスキャフォールドで生成する。
  Phase 1 Task 4-8 で全完了した conform 1.19 + Zod 4 + executeAdminMutationResult
  統合パターン (`(prev, formData) => SubmissionResult`) で CRUD 一括作成する。
when_to_use: 新規モデルの管理画面 CRUD 用 Server Action ファイル一式を conform `useActionState` + executeAdminMutationResult パターンで一括生成するとき。
argument-hint: <resource-name>
---

# Server Action スキャフォールダー (conform canonical)

引数として受け取ったリソース名（例: `location`, `announcement`）から:

1. `src/app/(admin)/admin/(dashboard)/_shared/actions/<name>.ts`
2. `src/shared/lib/validations/<name>.ts`

の 2 ファイルを生成する。**Phase 1 Task 6 で確立した conform pattern が canonical**。RHF + `useFormAction` への scaffold 復活は禁止（Task 8 で `react-hook-form` / `@hookform/resolvers` を `package.json` から削除予定）。

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

Zod 4 スキーマのテンプレート（FormData coercion 前提）:

```typescript
/**
 * <ResourceLabel> バリデーションスキーマ
 *
 * conform `parseWithZod` が FormData から coerce するため:
 * - 数値は `z.coerce.number()`
 * - boolean Switch は "on" / "" を `z.boolean()` で受ける（公式 HTML checkbox 慣習）
 * - datetime-local は `z.string().datetime({ local: true })`
 */

import { z } from "zod";

// =============================================================================
// <ResourcePascal> Form Schema (Admin)
// =============================================================================

export const <name>FormSchema = z.object({
  name: z
    .string()
    .min(1, { error: "名称を入力してください" })
    .max(100, { error: "名称は100文字以内で入力してください" }),
  // TODO: フィールドを追加する
});

export type <ResourcePascal>FormInput = z.input<typeof <name>FormSchema>;
export type <ResourcePascal>FormOutput = z.output<typeof <name>FormSchema>;
```

### `src/app/(admin)/admin/(dashboard)/_shared/actions/<name>.ts`

conform `(prev, formData) => SubmissionResult` + `executeAdminMutationResult` 統合 CRUD のテンプレート:

```typescript
"use server";

/**
 * <ResourceLabel> Server Actions
 *
 * conform `useActionState` 統合経路。`create<ResourcePascal>` は
 * `(prev, formData)`、`update<ResourcePascal>` は `(id, prev, formData)`
 * の signature で、client 側は `update<ResourcePascal>.bind(null, entity.id)`
 * で部分適用してから `useActionState` に渡す。
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  create<ResourcePascal>Command,
  update<ResourcePascal>Command,
  delete<ResourcePascal>Command,
} from "@/shared/domain/<name>/commands";
import { <name>FormSchema } from "@/shared/lib/validations/<name>";

const idSchema = z.string().uuid({ error: "<ResourceLabel> ID が不正です" });

// =============================================================================
// Conform-integrated Write Actions
// =============================================================================

export async function create<ResourcePascal>(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, <name>FormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "<name>",
      action: "create",
      execute: async () => create<ResourcePascal>Command(data),
      afterSuccess: () => {
        updateTag(CACHE_TAGS.<NAME_UPPER>);
      },
      resolveAuditResourceId: (data) => data.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function update<ResourcePascal>(
  <name>Id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, <name>FormSchema, async (data) => {
    const idValid = idSchema.safeParse(<name>Id);
    if (!idValid.success) {
      return { ok: false, error: "<ResourceLabel> ID が不正です" };
    }
    const result = await executeAdminMutationResult({
      resource: "<name>",
      action: "update",
      resourceId: idValid.data,
      execute: async () => {
        await update<ResourcePascal>Command(idValid.data, data);
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.<NAME_UPPER>);
        updateTag(getCacheTag.<name>s.detail(idValid.data));
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

// =============================================================================
// Non-form Mutation (delete) — 入力ベースのまま維持
// =============================================================================

export async function delete<ResourcePascal>(
  id: string,
): Promise<MutationResult<null>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return { error: "<ResourceLabel> ID が不正です" };
  }

  return executeAdminMutationResult({
    resource: "<name>",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await delete<ResourcePascal>Command(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.<NAME_UPPER>);
    },
  });
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
      （なければ migration を `bunx --bun prisma migrate dev --name <topic>` で作成）
- [ ] `<name>FormSchema` のフィールドを実際のモデルに合わせて更新
      - 数値: `z.coerce.number()` / boolean Switch: `z.boolean()` / datetime-local: `z.string().datetime({ local: true })`
- [ ] `<ResourcePascal>Data` 型のフィールドを実際のモデルに合わせて更新
- [ ] Date フィールドが複数ある場合は全て `.toISOString()` を適用
- [ ] form 実装は conform `useActionState` + `useForm` (`@conform-to/react` + `@conform-to/zod/v4`)
      参照実装: `CustomerForm` (create) / `CustomerEditForm` (edit、bind 部分適用) / `CouponForm` (statusbased mode 切替)
- [ ] `bun run validate` で型エラーがないことを確認
```

## 注意事項

- **`'use server'` ファイルは `import 'server-only'` 不要** — `'use server'` ディレクティブで境界制御済み
- **`'use server'` ファイルは async 関数のみ export 可** — `type` / `interface` / 非 async const の export 禁止（Next.js 16 公式仕様、Turbopack server-actions bundler の制約）。型は `<file>-types.ts` に退避
- **Date フィールドは `string` 型で宣言** — Server→Client 境界シリアライゼーション（`prisma-patterns.md` 参照）
- **`executeAdminMutationResult` の `resource` / `action` は `permissions.ts` の定義と一致させる**
- **`CACHE_TAGS.<NAME_UPPER>` が存在しない場合は `cache.ts` に追加してから `updateTag` を呼ぶ**
- **conform Zod 4 専用 subpath**: `@conform-to/zod/v4` から `parseWithZod` を import する（`@conform-to/zod` ルートは Zod v3 用で Zod 4 と非互換）
- **RHF (`react-hook-form` / `@hookform/resolvers`) は Phase 1 Task 8 完了、別 phase で削除予定** — 新規 Server Action では絶対に scaffold しない
- **`useFormAction` hook は legacy** — 既存利用箇所のみ残存（inline editor side-panel / auto-section-form のみ）、新規利用禁止（別 phase で削除予定）
- **conform helper SSoT**: `executeConformMutation` は `@/shared/lib/forms/conform-action` のみ。Server Action 内 `parseWithZod` 直接呼び出し禁止（認証・権限・監査ログを `executeAdminMutationResult` で一括処理する flow と整合）
- **参照実装** (Phase 1 PR #59-#62 で確立した form 移行 16 件):
  - **simple (PR #61)**: 9 settings sections (`MaintenanceSection` / `CookieConsentSection` / `NotificationSection` / `HeaderSection` / `PermalinkSection` / `ReservationSection` / `EmailSection` / `FooterSection` / `TaxSection`)
  - **medium (PR #62)**: `CustomerForm` (create) / `CustomerEditForm` (edit + email blur + bind) / `CouponForm` (create/edit 統合 + conditional UI) / `PageSeoForm` + `ListPageSeoForm` (MediaPicker bridge) / `UserForm` (schema mode 切替) / `InviteForm` (derived success state + delayed redirect)
