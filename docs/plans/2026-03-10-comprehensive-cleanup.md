# プロジェクト包括的クリーンアップ Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** プロジェクト全体を公式ベストプラクティスに完全準拠させる破壊的クリーンアップ

**Architecture:** ActionResult/MutationResult 二重パターンを MutationResult に統一、Next.js 16 PPR 適合（connection() + NuqsAdapter）、CI/CD にテスト実行追加、設定ファイル明示化

**Tech Stack:** Next.js 16.1.6, React 19.2.4, TypeScript 6.0-beta, Zod 4.3.6, Prisma 7.4.2, Bun 1.3.10

---

## Phase 1: 破壊的アーキテクチャ変更（ActionResult → MutationResult 統一）

### Task 1: createValidationError を MutationError 返却に変更

**Files:**

- Modify: `src/shared/lib/action-helpers.ts:16-61`
- Modify: `src/shared/lib/mutation-result.ts`
- Test: `__tests__/unit/lib/mutation-result.test.ts`

**Step 1: テスト追加 — createValidationMutationError**

`__tests__/unit/lib/mutation-result.test.ts` に追加:

```typescript
import { createValidationMutationError } from "@/shared/lib/action-helpers";

describe("createValidationMutationError", () => {
  test("ZodError を MutationError に変換する", () => {
    const zodError = {
      issues: [
        { path: ["title"], message: "タイトルは必須です" },
        { path: ["slug"], message: "スラッグは必須です" },
      ],
    };
    const result = createValidationMutationError(zodError as ZodError);
    expect(result).toEqual({
      error: "入力内容に誤りがあります",
      fieldErrors: {
        title: ["タイトルは必須です"],
        slug: ["スラッグは必須です"],
      },
    });
    // success プロパティが存在しないことを確認
    expect("success" in result).toBe(false);
  });
});
```

**Step 2: テスト実行 → 失敗確認**

Run: `bun test __tests__/unit/lib/mutation-result.test.ts`
Expected: FAIL — `createValidationMutationError` is not defined

**Step 3: 実装 — createValidationMutationError を action-helpers.ts に追加**

`src/shared/lib/action-helpers.ts` に追加:

```typescript
import type { MutationError } from "@/shared/lib/mutation-result";

/**
 * ZodError を MutationError に変換（ActionFailure を経由しない直接変換）
 */
export function createValidationMutationError(
  error: ZodError,
  message = "入力内容に誤りがあります",
): MutationError {
  return {
    error: message,
    fieldErrors: extractFieldErrors(error),
  };
}
```

**Step 4: テスト実行 → 成功確認**

Run: `bun test __tests__/unit/lib/mutation-result.test.ts`
Expected: PASS

**Step 5: コミット**

```bash
git add src/shared/lib/action-helpers.ts __tests__/unit/lib/mutation-result.test.ts
git commit -m "feat: add createValidationMutationError for direct MutationError creation"
```

---

### Task 2: executeAdminMutation を廃止し旧パターン10ファイルを移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/media.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/post-comment.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/staff-invitation.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/user.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space-category.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`

**Step 1: 各ファイルの変更パターン（10ファイル共通）**

Before（旧パターン）:

```typescript
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { createSuccess } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";

export const createItem = async (input: ItemInput) => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);

  return executeAdminMutation({
    resource: "item",
    action: "create",
    execute: async () => createItemCommand(parsed.data),
    success: (result) => createSuccess("作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ITEMS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

After（新パターン）:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";

export async function createItem(
  input: ItemInput,
): Promise<MutationResult<CreatedItem>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "item",
    action: "create",
    execute: async () => createItemCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ITEMS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}
```

変更点:

1. `executeAdminMutation` → `executeAdminMutationResult`
2. `createSuccess` 削除（`executeAdminMutationResult` は `success` コールバック不要、直接 data を返す）
3. `createValidationError` → `createValidationMutationError`
4. 返り値型: `ActionResult<T>` → `MutationResult<T>`
5. アロー関数 → named function（一貫性）

**Step 2: 10ファイルを順に変更**

ファイルごとに Read → Edit の順で変更する。各ファイルの `executeAdminMutation` 呼び出しを `executeAdminMutationResult` に置き換え、`success:` コールバックを削除。

**Step 3: 型チェック**

Run: `bun run type-check`
Expected: Client Component 側で型エラーが発生（Task 3 で対処）

**Step 4: コミット（型エラーは Task 3 で修正）**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/space.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/media.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/editor-comment.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/post-comment.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/staff-invitation.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/inquiry.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/user.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/location.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/space-category.ts
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/page-section.ts
git commit -m "refactor!: migrate 10 Server Actions from executeAdminMutation to executeAdminMutationResult"
```

---

### Task 3: useFormAction フックを MutationResult 対応に書き換え

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/hooks/useFormAction.ts`
- Test: `__tests__/unit/hooks/useFormAction.test.ts` (新規)

**Step 1: useFormAction の型を MutationResult に変更**

`src/app/(admin)/admin/(dashboard)/_shared/hooks/useFormAction.ts` を書き換え:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  useForm,
  type FieldValues,
  type UseFormReturn,
  type DefaultValues,
  type Path,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { toast } from "sonner";
import {
  isMutationError,
  type MutationResult,
  type MutationError,
} from "@/shared/lib/mutation-result";

type UseFormActionOptions<TOutput> = {
  defaultValues?: DefaultValues<FieldValues>;
  onSuccess?: (data: TOutput) => void;
  onError?: (error: string, fieldErrors?: Record<string, string[]>) => void;
  redirectTo?: string;
  refresh?: boolean;
  successMessage?: string;
  errorMessage?: string;
  disableToast?: boolean;
};

type UseFormActionReturn<TInput extends FieldValues, TOutput> = {
  form: UseFormReturn<TInput>;
  isPending: boolean;
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  execute: (data: TInput) => Promise<MutationResult<TOutput>>;
};

function hasTopLevelField<TInput extends FieldValues>(
  values: TInput,
  field: string,
): field is Path<TInput> {
  return field in values;
}

export function useFormAction<TInput extends FieldValues, TOutput = null>(
  schema: StandardSchemaV1<TInput, TInput>,
  action: (data: TInput) => Promise<MutationResult<TOutput>>,
  options?: UseFormActionOptions<TOutput>,
): UseFormActionReturn<TInput, TOutput> {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<TInput>({
    resolver: standardSchemaResolver(schema),
    defaultValues: options?.defaultValues,
  });

  const execute = async (data: TInput): Promise<MutationResult<TOutput>> => {
    const result = await action(data);

    if (isMutationError(result)) {
      // エラー時
      if (!options?.disableToast) {
        toast.error(
          options?.errorMessage || result.error || "エラーが発生しました",
        );
      }

      // フィールドエラーをフォームに設定
      if (result.fieldErrors) {
        const currentValues = form.getValues();
        for (const [field, errors] of Object.entries(result.fieldErrors)) {
          if (
            errors &&
            errors.length > 0 &&
            hasTopLevelField(currentValues, field)
          ) {
            const registeredField = form.register(field);
            form.setError(registeredField.name, {
              type: "server",
              message: errors[0],
            });
          }
        }
      }

      options?.onError?.(result.error, result.fieldErrors);
    } else {
      // 成功時
      if (!options?.disableToast) {
        toast.success(options?.successMessage || "保存しました");
      }

      options?.onSuccess?.(result);

      if (options?.redirectTo) {
        router.push(options.redirectTo);
      } else if (options?.refresh) {
        router.refresh();
      }
    }

    return result;
  };

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      await execute(data);
    });
  });

  return { form, isPending, onSubmit, execute };
}

export type { UseFormActionOptions, UseFormActionReturn };
```

変更点:

- `ActionResult<TOutput>` → `MutationResult<TOutput>`
- `result.success` → `isMutationError(result)` で判定
- `result.message` → `options?.successMessage || "保存しました"`（MutationResult に message なし）
- `onSuccess` コールバック引数: `ActionSuccess<TOutput>` → `TOutput`（直接データ）

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: 呼び出し元の Client Component で型エラーが発生する可能性あり

**Step 3: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/hooks/useFormAction.ts
git commit -m "refactor!: rewrite useFormAction hook for MutationResult pattern"
```

---

### Task 4: Client Component の ActionResult 参照を全て修正

**Files:**

- `useFormAction` を使う全 Client Component（型エラーで特定）
- `ActionResult` を直接参照する Client Component
- `PublishSwitch.tsx`, `DangerZone.tsx` 等の共有コンポーネント

**Step 1: 型チェックでエラー箇所を特定**

Run: `bun run type-check 2>&1 | head -100`

エラーパターン別に対応:

**パターン A: `result.success` → `!isMutationError(result)`**

```typescript
// Before
if (result.success) { ... } else { toast.error(result.error); }
// After
import { isMutationError } from "@/shared/lib/mutation-result";
if (!isMutationError(result)) { ... } else { toast.error(result.error); }
```

**パターン B: `result.data` → 直接 `result`**

```typescript
// Before (ActionResult)
if (result.success) {
  router.push(`/admin/spaces/${result.data.id}`);
}
// After (MutationResult — 成功時は data そのもの)
if (!isMutationError(result)) {
  router.push(`/admin/spaces/${result.id}`);
}
```

**パターン C: `onSuccess: (result) => result.data` → `onSuccess: (data) => data`**

```typescript
// Before
onSuccess: (result) => {
  console.log(result.data.id);
};
// After
onSuccess: (data) => {
  console.log(data.id);
};
```

**パターン D: `Promise<ActionResult<T>>` 型注釈**

```typescript
// Before
onToggle: (id: string, checked: boolean) => Promise<ActionResult<T>>;
// After
onToggle: (id: string, checked: boolean) => Promise<MutationResult<T>>;
```

**Step 2: 全エラーを修正**

`bun run type-check` を繰り返し実行しエラーゼロになるまで修正。

**Step 3: type-check + lint 通過確認**

Run: `bun run validate`
Expected: PASS

**Step 4: コミット**

```bash
git add -u
git commit -m "refactor!: update all Client Components from ActionResult to MutationResult"
```

---

### Task 5: 旧 ActionResult 型・関数・ファイルを完全削除

**Files:**

- Modify: `src/shared/types/server-actions.ts` — `ActionSuccess`, `ActionFailure`, `ActionResult`, `createSuccess`, `createFailure`, `isActionSuccess`, `isActionFailure`, `getActionError` を削除
- Modify: `src/shared/lib/action-helpers.ts` — `createValidationError` を削除（`createValidationMutationError` のみ残す）、`withTurnstile`, `withValidation`, `withTurnstileAndValidation` を削除（未使用）
- Modify: `src/shared/lib/mutation-result.ts` — `toMutationError` を削除（`ActionFailure` がなくなるため不要）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/types/server-actions.ts` — 旧型の re-export を削除
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts` — `executeAdminMutation` 関数を削除

**Step 1: 未使用チェック**

全ての旧シンボルが未参照であることを grep で確認:

```bash
# 各シンボルが src/ 内で import されていないことを確認
```

**Step 2: 削除実行**

各ファイルから旧コードを削除。

**Step 3: validate + test**

Run: `bun run validate && bun run test:all`
Expected: ALL PASS

**Step 4: コミット**

```bash
git add -u
git commit -m "refactor!: remove ActionResult type system and legacy executeAdminMutation"
```

---

### Task 6: 新パターン25ファイルの toMutationError(createValidationError()) を簡素化

**Files:**

- 25 Server Action ファイル（`executeAdminMutationResult` 使用）

**Step 1: 置換**

全25ファイルで:

```typescript
// Before
import { createValidationError } from "@/shared/lib/action-helpers";
import {
  toMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
return toMutationError(createValidationError(parsed.error));

// After
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
return createValidationMutationError(parsed.error);
```

**Step 2: validate + test**

Run: `bun run validate && bun run test:all`
Expected: ALL PASS

**Step 3: コミット**

```bash
git add -u
git commit -m "refactor: simplify validation error creation in 25 Server Actions"
```

---

### Task 7: uuid パッケージ削除

**Files:**

- Modify: `src/shared/lib/storage.ts:22`
- Modify: `package.json`

**Step 1: storage.ts の import 変更**

```typescript
// Before
import { v4 as uuid } from "uuid";
const uniqueId = uuid();

// After（import 削除、直接使用）
const uniqueId = crypto.randomUUID();
```

**Step 2: パッケージ削除**

Run: `bun remove uuid @types/uuid`

**Step 3: validate**

Run: `bun run validate`
Expected: PASS

**Step 4: コミット**

```bash
git add src/shared/lib/storage.ts package.json bun.lock
git commit -m "refactor: replace uuid package with crypto.randomUUID()"
```

---

## Phase 2: Next.js 16 ベストプラクティス適合

### Task 8: 公開ページ Root Layout に NuqsAdapter 追加

**Files:**

- Modify: `src/app/(public)/layout.tsx`

**Step 1: NuqsAdapter を追加**

`src/app/(public)/layout.tsx` に以下を追加:

```typescript
import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

// body 内の children をラップ:
<Suspense fallback={null}>
  <NuqsAdapter>{children}</NuqsAdapter>
</Suspense>
```

**Step 2: build 確認**

Run: `bun run validate`
Expected: PASS

**Step 3: コミット**

```bash
git add src/app/'(public)'/layout.tsx
git commit -m "fix: add NuqsAdapter to public root layout for nuqs compatibility"
```

---

### Task 9: 公開ページに connection() 追加

**Files:**

- 全 `src/app/(public)/**/page.tsx` ファイル（約16ページ）
- 全 `src/app/(public)/**/page.tsx` 内の `generateMetadata` 関数

**Step 1: 公開ページの page.tsx を列挙**

```bash
# src/app/(public)/ 配下の page.tsx を全て検索
```

**Step 2: 各ファイルの先頭に connection() を追加**

パターン:

```typescript
import { connection } from "next/server";

export async function generateMetadata(...) {
  await connection();
  // ... 既存コード
}

export default async function Page(...) {
  await connection();
  // ... 既存コード
}
```

注意:

- `connection()` は async Server Component 関数の先頭（`await params` の後、データアクセスの前）
- 既に `connection()` がある場合はスキップ
- Client Component のみのページ（`'use client'`）はスキップ

**Step 3: build 確認**

Run: `bun run validate && bun run build`
Expected: PASS（PPR ビルドエラーなし）

**Step 4: コミット**

```bash
git add src/app/'(public)'/
git commit -m "fix: add connection() to all public pages for PPR compatibility"
```

---

## Phase 3: テスト・CI/CD 改善

### Task 10: tsconfig の **tests** include 化

**Files:**

- Modify: `tsconfig.json`
- Create: `__tests__/tsconfig.json` (テスト用の追加設定)

**Step 1: tsconfig.json の exclude から **tests** を削除**

```json
{
  "exclude": ["node_modules", "generated"]
}
```

**Step 2: type-check 実行**

Run: `bun run type-check`
Expected: テスト内の型エラーが検出される可能性あり

**Step 3: 型エラーを修正**

検出された型エラーを修正。主に:

- `bun:test` の型定義（`bun-types` が含まれていれば OK）
- テスト内の `as` アサーション → 型安全な代替に

**Step 4: validate 確認**

Run: `bun run validate`
Expected: PASS

**Step 5: コミット**

```bash
git add tsconfig.json __tests__/
git commit -m "feat: include __tests__ in type-check for compile-time error detection"
```

---

### Task 11: cloudbuild.yaml にテスト実行追加

**Files:**

- Modify: `cloudbuild.yaml`

**Step 1: Docker ビルド前にテストステップを追加**

cloudbuild.yaml の `build-image` ステップの前に追加:

```yaml
# Step 2: Run tests
- name: "oven/bun:1.3.10"
  id: "test"
  entrypoint: "sh"
  args:
    - "-c"
    - |
      bun install --frozen-lockfile
      bun run db:generate
      bun run test:all
```

**Step 2: コミット**

```bash
git add cloudbuild.yaml
git commit -m "ci: add test execution step before Docker build"
```

---

### Task 12: Docker ビルドタイムアウト短縮

**Files:**

- Modify: `cloudbuild.yaml`

**Step 1: timeout を 1800s → 600s に変更**

**Step 2: コミット**

```bash
git add cloudbuild.yaml
git commit -m "ci: reduce build timeout from 1800s to 600s"
```

---

## Phase 4: 設定・ツールチェーン改善

### Task 13: Prettier 設定の明示化

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`

**Step 1: .prettierrc.json 作成**

```json
{
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

注: Prettier デフォルトの値を明示化（現行のフォーマットと一致させる）。

**Step 2: .prettierignore 作成**

```
generated/
.next/
out/
build/
node_modules/
bun.lock
.worktrees/
```

**Step 3: format:check で差分なし確認**

Run: `bun run format:check`
Expected: 差分なし（既存フォーマットと一致）

**Step 4: コミット**

```bash
git add .prettierrc.json .prettierignore
git commit -m "chore: add explicit Prettier configuration"
```

---

### Task 14: console.log 禁止 ESLint ルール追加

**Files:**

- Modify: `eslint.config.mjs`
- Modify: 該当する3ファイル（console.log → logError 等に置換）

**Step 1: eslint.config.mjs に no-console ルール追加**

`base` ブロック内の `rules` に追加:

```javascript
"no-console": ["warn", { allow: ["warn", "error"] }],
```

**Step 2: 既存の console.log を置換**

3ファイル5箇所を確認し、適切なロガーに置換:

- `src/shared/lib/env/index.ts` — console.log → 削除 or logError
- `src/shared/lib/reservation/constants.ts` — console.log → logError
- `src/shared/lib/form-data.ts` — console.log → 削除 or logError

**Step 3: lint 通過確認**

Run: `bun run lint`
Expected: PASS（no-console 違反ゼロ）

**Step 4: コミット**

```bash
git add eslint.config.mjs src/shared/lib/env/index.ts src/shared/lib/reservation/constants.ts src/shared/lib/form-data.ts
git commit -m "chore: add no-console ESLint rule and replace console.log with structured logging"
```

---

### Task 15: minor パッケージアップグレード

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`

**Step 1: アップグレード実行**

```bash
bun update isomorphic-dompurify
```

**Step 2: validate + test**

Run: `bun run validate && bun run test:all`
Expected: ALL PASS

**Step 3: コミット**

```bash
git add package.json bun.lock
git commit -m "chore: upgrade isomorphic-dompurify to latest patch"
```

---

## Phase 5: 最終検証

### Task 16: 全体検証

**Step 1: 全検証コマンド実行**

```bash
bun run validate && bun run test:all && bun run build
```

Expected: ALL PASS

**Step 2: docs/plans/README.md 更新**

進行中タスクに本計画を追記:

```markdown
- 🔄 [2026-03-10] プロジェクト包括的クリーンアップ（ActionResult統一・PPR適合・CI/CD改善）
  - 計画書: `docs/plans/2026-03-10-comprehensive-cleanup.md`
```

**Step 3: コミット**

```bash
git add docs/plans/
git commit -m "docs: add comprehensive cleanup plan and update README"
```
