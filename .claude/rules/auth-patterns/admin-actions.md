---
description: 管理画面 Server Action / API Route の認証パターン（executeAdminMutationResult / checkPermission / 監査ログ / EDITOR ロール契約）
paths:
  - src/admin/lib/admin-action.ts
  - src/admin/lib/action-auth.ts
  - src/admin/lib/permissions.ts
  - src/admin/lib/audit.ts
  - src/**/actions/**/*.ts
  - src/app/(admin)/**
  - src/app/api/admin/**
---

# 管理画面 Server Action 認証パターン

> `executeAdminMutationResult` / `checkPermission` / 監査ログ / EDITOR ロール page-only 契約。Turnstile 保護は `auth-patterns/turnstile.md` を参照。

## executeAdminMutationResult（書き込み系 — 標準パターン）

権限チェック・実行・監査ログ・DomainError ハンドリングを一括処理する。
`@/admin/lib/admin-action` から import。**Server Actions の書き込み操作は原則これを使用**:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => createSpaceCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
// 戻り型: MutationResult<{ id: string }> = { id: string } | MutationError
```

**`executeAdminMutationResult`** — `MutationResult<TData>` を返す（`execute` の戻り値 `TData` が success path）:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";

export const updateItem = async (id: string, input: ItemInput) =>
  executeAdminMutationResult({
    resource: "item",
    action: "update",
    resourceId: id,
    execute: async () => updateItemCommand(id, input),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ITEMS);
    },
  });
```

**EDITOR ロール用リソース単位アクセス制御**:

```typescript
return executeAdminMutationResult({
  resource: "page",
  action: "update",
  resourceId: id,
  checkResourceAccess: true, // ← EDITOR の userPageAssignment チェックを有効化
  execute: async (user) => updatePageCommand(id, parsed.data),
});
```

## checkPermission（API Route 用 — 直接呼び出し）

API Route は `executeAdminMutationResult` を使わず `checkPermission` を直接呼び出す。
`request.headers` を第3引数に渡す（Server Actions と異なり `headers()` が使えないため）:

```typescript
import { checkPermission } from "@/admin/lib/action-auth";

export async function POST(request: Request) {
  const auth = await checkPermission("media", "create", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }
  // API処理
}
```

## 副作用のない admin-only fetch endpoint は `checkAdminAuth` で十分

OGP プレビュー取得のような「① DB write なし ② SSRF guard + timeout 等の安全装置あり ③ 特定 resource の管理画面に紐づかない」API route は、`checkPermission(resource, action)` ではなく `checkAdminAuth()` を使う:

```typescript
// NG: Lexical BookmarkPlugin は post/news/terms/page/section いずれでも使うため
//     "media" resource に縛ると semantic ミスマッチ + EDITOR 権限の偶然の一致に依存する
const auth = await checkPermission("media", "read", request.headers);

// OK: 認証済み admin なら全員が利用できる共通ユーティリティ
const auth = await checkAdminAuth(request.headers);
if (!auth.success) return jsonError(auth.error.error, 401);
```

**判定基準**: 3 条件すべて満たすなら `checkAdminAuth`。1 つでも該当しなければ `checkPermission(resource, action)` を使う（例: media アップロード → `media:create` / settings 更新 → `settings:update`）。

## HTTP status の使い分け（401 vs 403）

[RFC 9110 §15.5.2 / §15.5.4](https://www.rfc-editor.org/rfc/rfc9110#name-401-unauthorized) 準拠:

- **401 Unauthorized** — 認証失敗（`checkAdminAuth` が `!success`）。クライアントは認証情報を付与して再試行可能
- **403 Forbidden** — 認証済みだが権限不足（`checkPermission` の permission チェックが `!success`）。同じ認証情報での再試行は失敗する

`checkPermission` は内部で `checkAdminAuth` も呼ぶため未認証時も `!success` になるが、エラーメッセージ文言（`"ログインが必要です"` / `"管理者権限が必要です"`）を見て status を分岐させない。**そのエンドポイントが `checkAdminAuth` 止まりか `checkPermission` まで検査するか**で status を選ぶ（呼び出し側の意図で決定）。

## NG パターン

```typescript
// NG: 認証チェックなし
export async function deleteSpace(id: string) {
  await prisma.space.delete({ where: { id } });
  return { id }; // executeAdminMutationResult なしに直接返すのは NG
}

// NG: 権限ハードコード
export async function deleteSpace(id: string) {
  const session = await getSession();
  if (session?.user.role !== "SUPER_ADMIN")
    return createMutationError("権限がありません");
}

// NG: Server Actions で checkPermission 直接呼び出し（executeAdminMutationResult を使う）
export async function createItem(input: ItemInput) {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

## 監査ログ

`executeAdminMutationResult` は `logAction()` を **`fireAndForget`（非ブロッキング）で内部呼び出し**するため、手動呼び出し不要。実行順序は `execute → await afterSuccess → fireAndForget(logAction)` で不変（→ `server-actions/implementation.md` §executeAdminMutationResult 実行順序契約）。監査 write 失敗時は `logError`（category: `DATABASE`, severity: `MEDIUM`）で構造化ログに記録されるが mutation 応答は影響を受けない。
`resolveAuditResourceId` でリソース ID を動的解決できる:

```typescript
return executeAdminMutationResult({
  resource: "space",
  action: "create",
  execute: async () => createSpaceCommand(parsed.data),
  // create 操作では execute 後に ID が確定するため resolveAuditResourceId で解決
  resolveAuditResourceId: (data) => data.id,
});
```

API Route 等で `executeAdminMutationResult` を使わない場合のみ `logAction()` を直接呼び出す:

```typescript
function logAction(
  userId: string,
  action: Action,
  resource: Resource,
  resourceId?: string,
): void;
```

### Better Auth mutation hook の audit log（`/reset-password` 完了等）

Better Auth の `hooks.after` で auth event を `logAuthEvent()` 経由で記録する。`PASSWORD_RESET_REQUEST` のみ記録する設計はインシデント調査時に証跡が不完全になるため、**完了イベントも対応する `AuditAction` で必ず記録**する。

| パス                      | hook    | AuditAction              | 取得元                                    |
| ------------------------- | ------- | ------------------------ | ----------------------------------------- |
| `/sign-in/*`              | `after` | `LOGIN_SUCCESS`          | `ctx.context.newSession.user.id`          |
| `/sign-out`               | `after` | `LOGOUT`                 | `ctx.context.session.user.id`             |
| `/request-password-reset` | `after` | `PASSWORD_RESET_REQUEST` | `ctx.body.email`（user.id 不在）          |
| `/reset-password`         | `after` | `PASSWORD_CHANGE`        | `ctx.context.newSession?.user.id`（任意） |

```typescript
// admin-auth.ts hooks.after 内
if (ctx.path === "/reset-password") {
  try {
    const userId = ctx.context.newSession?.user.id;
    void logAuthEvent(AuditAction.PASSWORD_CHANGE, userId, {
      method: "reset",
      email: ctx.context.newSession?.user.email,
    });
  } catch {
    // 監査ログ失敗でも認証フローを阻害しない
  }
}
```

新規 mutation auth endpoint 追加時はこの pattern を踏襲（before hook で Turnstile 保護 + after hook で完了 audit log）。`PASSWORD_CHANGE` enum は既存（リセット完了 / プロフィール経由のパスワード変更を共通カバー、`method: "reset" | "profile"` で context 分離）。

## EDITOR ロール契約（page-only 設計）

- **`ROLE_PERMISSIONS.EDITOR` への追加は page resource のみ許容** — `userHasResourceAccess` は `assignedPageIds.includes(resourceId)` で判定する **page UUID 専用ロジック**。post / news / event 等の独立 resource を EDITOR に許可すると `checkResourceAccess: true` 有効化時に常に reject される silent bug の温床。EDITOR は page / media upload / blockTemplate(read) / notification(read) のみ
- **slug ベース resourceId の page Server Action は `resolveResourceId` 必須** — `updatePage(slug)` 等で `resourceId: slug` を直接渡すと slug ≠ page UUID で `userPageAssignment` 判定が常に false になる。`resolveResourceId: () => getPageIdBySlugQuery(slug)` で認証後に UUID 解決し、`resolveAuditResourceId: () => slug` で監査ログには slug を残す。参照実装: `actions/page.ts` の `updatePage` / `restorePage` / `updatePageSeo`
- **bulk page operations は ADMIN+ 限定設計** — `page:delete` / `page:publish` を EDITOR から外すことで bulk action が permission level で弾かれ、per-item resourceId 判定の複雑さを回避（業界標準: WordPress 風の per-item edit_others は本プロジェクト未採用）。EDITOR は per-page edit のみ可能とする clean break 採用済
