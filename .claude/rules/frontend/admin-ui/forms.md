---
paths:
  - src/app/(admin)/**/*Form.tsx
  - src/app/(admin)/**/*Fields.tsx
  - src/app/(admin)/**/new/page.tsx
  - src/app/(admin)/**/edit/page.tsx
  - src/app/(admin)/**/[id]/page.tsx
  - src/app/(admin)/**/settings/**/*.tsx
  - src/app/(admin)/**/_shared/actions/**
---

# 管理画面フォーム・ページ構造パターン (conform canonical)

> React 19 `useActionState` + conform `useForm` + `executeConformMutation` 統合パターンが canonical。React Hook Form (`react-hook-form` / `@hookform/resolvers`) は `package.json` から完全削除済、新規利用不可。動的配列は ① **`form.insert/remove/reorder` + `getFieldList()` + `getFieldset()`** (DiscountSection で確立、LocationForm canonical で dnd-kit + `form.reorder({ name, from, to })` 完成) または ② **`useState<{_key, ...}[]>` + 安定 key + hidden input append + schema preprocess** (SpaceEditForm canonical、MediaPicker / IconPickerField 等複雑 widget 連携時、`crypto.randomUUID()` key で React reconciliation + dnd-kit 整合) のいずれかを採用。**`_key?: string` フィールドは domain type に declare、Zod schema には宣言しない** — Zod 4 default `strip` mode で persistence layer に届く前に破棄される (`EventTicketInput._key` 参照実装)。新規動的配列実装時は ① 永続 ID (DB から復元) を `_key` に流用、② 新規 entry は `crypto.randomUUID()` で生成、③ index fallback (`new-${index}` / `idx-${index}`) は禁止 (`@eslint-react/no-array-index-key` violation)。Page 遷移 form の成功時遷移は **server-side `redirect(toAppRoute(...))`** (client `router.push` 不要)。canonical schema の **in-place preprocess** で FormData transit と object literal (test) を両対応 (LocationForm 確立、SpaceEditForm に水平展開)。**5+ tab の大型 form は monolithic 単一 file** (LocationForm / SpaceEditForm canonical、1100-1800 行規模、tab 分割 + prop drilling より maintainable、React Compiler が中規模 component のメモ化を自動処理)。詳細パターンは [`server-actions/implementation/forms-and-public.md`](../../server-actions/implementation/forms-and-public.md) §管理フォームの canonical (conform) 参照。

## Server Actions の認証パターン (conform canonical)

管理画面の書き込み系 Server Actions は **`(prev, formData) => SubmissionResult` signature** で `executeConformMutation` SSoT helper 経由で `executeAdminMutationResult` を呼ぶ（認証・権限チェック・監査ログ・DomainError ハンドリングを一括処理）:

```typescript
import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";

// OK: conform + executeAdminMutationResult パターン
export async function createItem(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, itemFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "item",
      action: "create",
      execute: async () => createItemCommand(data),
      afterSuccess: () => {
        updateTag(CACHE_TAGS.ITEMS);
      },
      resolveAuditResourceId: (data) => data.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

// OK: id 必要な update は bind で部分適用
export async function updateItem(
  itemId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, itemFormSchema, async (data) => {
    // ... executeAdminMutationResult ...
  });
}

// Client: const action = updateItem.bind(null, item.id);
// const [lastResult, formAction, isPending] = useActionState(action, undefined);

// NG: 直接 checkPermission（executeAdminMutationResult を使う）
// NG: 旧 RHF `useFormAction` signature (React Hook Form は削除済、新規利用不可)
// NG: Server Action 内 parseWithZod 直接呼び出し（executeConformMutation 経由必須）
```

詳細は `auth-patterns/admin-actions.md` を参照。

## AdminDetailLayout vs InlineEditorShell の使い分け

| パターン                             | 適用場面                                         | ページ例                                    |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------------- |
| `AdminDetailLayout`                  | 標準の詳細・編集・新規作成ページ                 | customers/[id], spaces/[id]/edit, staff/new |
| `InlineEditorShell` + `EditorHeader` | フルスクリーンエディタ（Lexical/コンテンツ編集） | posts/[id], news/[id], terms/[id]/edit      |

**禁止**: InlineEditorShell を使うページに AdminDetailLayout をラップすること（二重ヘッダーになる）

**禁止**: `[id]/page.tsx` に detail と edit form を同居させる hybrid pattern — 詳細は `[id]/page.tsx`（`AdminDetailLayout` + 編集ボタン → `/edit`）、編集は `[id]/edit/page.tsx`（`AdminDetailLayout backLabel="詳細に戻る"` + Form）に必ず分離。編集成功時のリダイレクトは詳細ページ（`/admin/<resource>/${id}`）。参照実装: customers / coupons
