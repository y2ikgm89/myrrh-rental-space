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

> Phase 1 Task 4-7 で確立した React 19 `useActionState` + conform `useForm` + `executeConformMutation` 統合パターン (settings sections 17/17 + Dialog 内 form taxonomy managers 完了)。RHF + `useFormAction` は legacy (Task 8 で削除予定)、新規利用禁止。動的配列は `form.insert/remove` (DiscountSection PR #84 が canonical 参照実装)。

> 詳細サブルール（path-scoped auto-load）:
>
> - **詳細・編集・新規作成ページ標準構造** — `frontend/admin-ui/forms/page-structure.md`
> - **2 カラム + 参照表示 + Relation FK + 親子 FK カスケード** — `frontend/admin-ui/forms/two-column-and-relations.md`
> - **ToggleGroup / aria 注入 / FormDescription / Destructive / 画像 picker / fieldset / Input adornment** — `frontend/admin-ui/forms/widgets.md`
> - **設定セクション conform `useActionState` パターン** — `frontend/admin-ui/forms/settings-sections.md`

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
// NG: useFormAction + (input: ItemInput) signature (legacy、Task 8 で削除)
// NG: Server Action 内 parseWithZod 直接呼び出し（executeConformMutation 経由必須）
```

詳細は `auth-patterns/admin-actions.md` を参照。

## AdminDetailLayout vs InlineEditorShell の使い分け

| パターン                             | 適用場面                                         | ページ例                                                    |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| `AdminDetailLayout`                  | 標準の詳細・編集・新規作成ページ                 | customers/[id], spaces/[id]/edit, staff/new                 |
| `InlineEditorShell` + `EditorHeader` | フルスクリーンエディタ（Lexical/コンテンツ編集） | posts/[id], news/[id], terms/[id]/edit, faq/items/[id]/edit |

**禁止**: InlineEditorShell を使うページに AdminDetailLayout をラップすること（二重ヘッダーになる）

**禁止**: `[id]/page.tsx` に detail と edit form を同居させる hybrid pattern — 詳細は `[id]/page.tsx`（`AdminDetailLayout` + 編集ボタン → `/edit`）、編集は `[id]/edit/page.tsx`（`AdminDetailLayout backLabel="詳細に戻る"` + Form）に必ず分離。編集成功時のリダイレクトは詳細ページ（`/admin/<resource>/${id}`）。参照実装: customers / coupons
