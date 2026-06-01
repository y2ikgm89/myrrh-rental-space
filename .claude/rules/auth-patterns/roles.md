---
description: ロール階層（SUPER_ADMIN / ADMIN / EDITOR / VIEWER / USER / CUSTOMER）+ DASHBOARD_ROLES SSoT + リソース別アクション enum
paths:
  - src/shared/lib/admin-roles.ts
  - src/shared/lib/admin-resources.ts
  - src/shared/lib/validations/enums/guards.ts
  - src/app/(admin)/**/_shared/lib/permissions.ts
  - src/app/(admin)/**/_shared/lib/role-guards.ts
  - src/**/components/**/Invite*.tsx
  - src/**/components/**/User*.tsx
---

# 権限階層 + DASHBOARD_ROLES + リソース別アクション

> ロール階層 6 段（SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER / CUSTOMER）+ client-safe DASHBOARD_ROLES SSoT + Resource × Action enum 定義。

## ロール階層

```
SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER / CUSTOMER
```

| ロール        | 権限                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPER_ADMIN` | システム全体の管理（ユーザー管理・監査ログ含む）                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ADMIN`       | コンテンツ管理全般（ユーザー管理除く）                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `EDITOR`      | 割り当てられた **page** のみ編集可（page / media upload / blockTemplate read / notification read）。post / news / faq / event 等の独立コンテンツ resource は権限自体なし — `userPageAssignment` テーブルが page にのみ紐づく設計のため、resource-level access チェック (`userHasResourceAccess`) は **page UUID 専用判定**。子リソース (section 等) で `checkResourceAccess: true` を使う場合は `resolveResourceId` callback で親 page UUID を解決する |
| `VIEWER`      | 閲覧のみ（編集不可）                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `USER`        | 公開ユーザー（管理画面アクセス不可）                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CUSTOMER`    | ソーシャルログイン顧客（マイページのみアクセス可）                                                                                                                                                                                                                                                                                                                                                                                                     |

## DASHBOARD_ROLES（ダッシュボードアクセス制御の SSOT）

**Single Source of Truth は `@/shared/lib/admin-roles`**（client-safe、`server-only` なし）。
`@/shared/lib/admin-auth`（server-only）は互換性のため `DASHBOARD_ROLES` を再 export する。

```typescript
// Server-only コード
import { isDashboardRole } from "@/shared/lib/admin-roles";
if (!isDashboardRole(user.role)) redirect("/");

// Client Component
import {
  DASHBOARD_ROLES, // z.enum(DASHBOARD_ROLES) に直接渡せる const tuple
  STAFF_INVITABLE_ROLES, // SUPER_ADMIN 除外の派生 tuple
  ROLE_LABELS, // Record<Role, string> 日本語ラベル
  ROLE_DESCRIPTIONS, // Record<Role, string> UI 説明
  type DashboardRole,
} from "@/shared/lib/admin-roles";
```

**禁止パターン:**

- **`.includes(user.role)` 直接呼び出し禁止** — `DASHBOARD_ROLES` は `readonly [...]` tuple 型のため、wide `Role` 型を渡すと TS2345。`isDashboardRole()` 型ガードを使う
- **ローカル `type StaffRole = "SUPER_ADMIN" | ...` 定義禁止** — `DashboardRole` 型を import する
- **ローカル `ROLE_LABELS` / `"スーパー管理者"` 等のハードコード禁止** — `ROLE_LABELS[role]` を使う
- **ローカル role description 文字列禁止** — `ROLE_DESCRIPTIONS[role]` を使う

ロール追加時はこの定数のみ更新する。ローカルに管理者ロール一覧を定義しない。

## リソース別アクション一覧

`Resource` 型と `Action` 型は `@/shared/lib/admin-resources`（client-safe SSoT、PR #232 で `@/admin/lib/` から移管）で定義。`@/admin/lib/permissions` も型再 export で互換性を維持:

```typescript
type Resource =
  | "space"
  | "location"
  | "spaceCategory"
  | "reservation"
  | "customer"
  | "inquiry"
  | "post"
  | "news"
  | "page"
  | "faq"
  | "terms"
  | "settings"
  | "user"
  | "auditLog"
  | "navigation"
  | "announcementBar"
  | "media"
  | "coupon"
  | "blockTemplate";

type Action = "create" | "read" | "update" | "delete" | "publish" | "manage";

// 権限キー: "resource:action" 形式
type PermissionKey = `${Resource}:${Action}`;
```

## 型安全な Role 取得

Better Auth の `additionalFields` は `string` 型で定義されるため、`getAdminSessionUser` / `getCustomerSessionUser` で型安全に `Role` enum に変換する:

```typescript
// 管理者用
import { getAdminSessionUser } from "@/shared/lib/admin-auth";
const user = getAdminSessionUser(session); // AdminUser | null

// 顧客用
import { getCustomerSessionUser } from "@/shared/lib/customer-auth";
const user = getCustomerSessionUser(session); // CustomerUser | null

// isValidRole は SSoT に集約: @/shared/lib/validations/enums/guards
import { isValidRole } from "@/shared/lib/validations/enums/guards";
if (isValidRole(session?.user?.role)) {
  const role = session.user.role; // Role 型に narrowed
}
```

**User 型の定義:**

```typescript
// 管理者用（admin-auth.ts）
export type AdminUser = Omit<AdminSession["user"], "role"> & { role: Role };

// 顧客用（customer-auth.ts）
export type CustomerUser = Omit<CustomerSession["user"], "role"> & {
  role: Role;
};
```
