---
name: adding-an-admin-action
description: Adds an admin Server Action in this repo following the executeAdminMutationResult pattern — domain command delegation, Zod validation, RBAC, cache invalidation, and audit. Use when the user wants to add or modify an admin create/update/delete action.
---

# 管理 Server Action を追加する

管理画面の mutation は auth / permission / audit を手書きせず、共通 helper `executeAdminMutationResult` を通す。

## 手順

1. **ドメインコマンド** — 実処理を `src/shared/domain/<entity>/commands.ts` に書く（先頭 `import "server-only";`）。DB は `@/shared/db/prisma`、cache タグは `CACHE_TAGS` / `getCacheTag`。
2. **Server Action** — `src/app/(admin)/admin/(dashboard)/_shared/actions/<resource>.ts` に薄い action を作る:
   - 先頭 `'use server';`
   - 入力を Zod で検証（失敗は `createValidationMutationError`）
   - `executeAdminMutationResult({ resource, action, resourceId, execute, afterSuccess })` を return する
   - `execute` 内で手順 1 のコマンドを呼ぶ。`afterSuccess` で cache を無効化する
3. **権限** — `resource` / `action` が RBAC マトリクス（`@/admin/lib/permissions`）に存在するか確認する。
4. **配線** — フォーム / ボタンから action を呼ぶ（Conform）。
5. **検証** — `bun run validate` を通す。

## 参照

- helper 実体: `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`
- 既存 action（例: `_shared/actions/announcement-bar.ts`）を Read して体裁を踏襲する。
