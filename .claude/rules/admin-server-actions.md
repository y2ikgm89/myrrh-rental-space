---
paths:
  - "src/app/(admin)/**/*.ts"
  - "src/app/(admin)/**/*.tsx"
---

# 管理画面 / Server Actions の規約

## Server Action の体裁

- Server Action ファイルは **先頭**に `'use server';`。
- action は thin に保ち、ビジネスロジックは `src/shared/domain/<entity>/commands.ts`（server-only）に委譲する。

## mutation は executeAdminMutationResult を経由

- すべての管理 mutation は `executeAdminMutationResult`（`@/admin/lib/admin-action`、実体 `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`）を通す。auth / permission / audit を手書きしない。
- 実行順は固定: 認証 → リソース解決 → 権限(RBAC) → `execute` → `afterSuccess`(cache 無効化) → 監査ログ。順序を入れ替えると stale cache の流出や監査漏れになる。
- 典型形:

  ```ts
  "use server";

  export async function deleteFoo(id: string): Promise<MutationResult> {
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return createValidationMutationError(parsed.error);

    return executeAdminMutationResult({
      resource: "foo",
      action: "delete",
      resourceId: parsed.data,
      execute: async () => {
        await deleteFooCommand(parsed.data); // domain command（server-only）に委譲
        return null;
      },
      afterSuccess: invalidateFooCache, // CACHE_TAGS / getCacheTag を使う
    });
  }
  ```

## 入力検証 / 権限

- 受け取った入力は Zod で検証してから `execute`（Conform + Zod）。
- `resource` / `action` が RBAC マトリクス（`@/admin/lib/permissions`）に存在するか確認する。
- 既存の action（例: `_shared/actions/announcement-bar.ts`）を Read して体裁を踏襲する。
