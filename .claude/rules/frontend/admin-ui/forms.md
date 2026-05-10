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

# 管理画面フォーム・ページ構造パターン

> Server Action 認証 + AdminDetailLayout / InlineEditorShell の使い分け + サブルール一覧。

> 詳細サブルール（path-scoped auto-load）:
>
> - **詳細・編集・新規作成ページ標準構造** — `frontend/admin-ui/forms/page-structure.md`
> - **2 カラム + 参照表示 + Relation FK + 親子 FK カスケード** — `frontend/admin-ui/forms/two-column-and-relations.md`
> - **ToggleGroup / aria 注入 / FormDescription / Destructive / 画像 picker / fieldset / Input adornment** — `frontend/admin-ui/forms/widgets.md`
> - **設定セクション useFormAction パターン** — `frontend/admin-ui/forms/settings-sections.md`

## Server Actions の認証パターン

管理画面の書き込み系 Server Actions は `executeAdminMutationResult` を使用（認証・権限チェック・監査ログ・DomainError ハンドリングを一括処理）:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";

// OK: executeAdminMutationResult パターン
export async function createItem(
  input: ItemInput,
): Promise<MutationResult<{ id: string }>> {
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

// NG: 直接 checkPermission（executeAdminMutationResult を使う）
export async function createItem(
  input: ItemInput,
): Promise<MutationResult<{ id: string }>> {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

詳細は `auth-patterns/admin-actions.md` を参照。

## AdminDetailLayout vs InlineEditorShell の使い分け

| パターン                             | 適用場面                                         | ページ例                                                    |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| `AdminDetailLayout`                  | 標準の詳細・編集・新規作成ページ                 | customers/[id], spaces/[id]/edit, staff/new                 |
| `InlineEditorShell` + `EditorHeader` | フルスクリーンエディタ（Lexical/コンテンツ編集） | posts/[id], news/[id], terms/[id]/edit, faq/items/[id]/edit |

**禁止**: InlineEditorShell を使うページに AdminDetailLayout をラップすること（二重ヘッダーになる）

**禁止**: `[id]/page.tsx` に detail と edit form を同居させる hybrid pattern — 詳細は `[id]/page.tsx`（`AdminDetailLayout` + 編集ボタン → `/edit`）、編集は `[id]/edit/page.tsx`（`AdminDetailLayout backLabel="詳細に戻る"` + Form）に必ず分離。編集成功時のリダイレクトは詳細ページ（`/admin/<resource>/${id}`）。参照実装: customers / coupons
