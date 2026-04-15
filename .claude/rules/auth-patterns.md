---
paths:
  - src/app/**
  - src/shared/**
---

# 認証パターンルール

> Better Auth 1.6.1 / RBAC / Next.js 16 対応（`package.json` の `better-auth` と一致）

## Better Auth 公式パターン

### nextCookies プラグイン（必須）

Server Actions で `Set-Cookie` を正しく処理するために必須。**`plugins` 配列の最後に配置すること**:

```typescript
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

// 管理者用
export const adminAuth = betterAuth({
  cookiePrefix: "admin-auth",
  // ...config
  plugins: [
    // 他のプラグイン,
    nextCookies(), // 必ず配列の最後
  ],
});

// 顧客用
export const customerAuth = betterAuth({
  cookiePrefix: "customer-auth",
  basePath: "/api/customer-auth",
  // ...config
  plugins: [
    // 他のプラグイン,
    nextCookies(), // 必ず配列の最後
  ],
});
```

### 静的初期化パターン（本プロジェクト正本）

管理者用と顧客用で Better Auth インスタンスを分離:

- `src/shared/lib/admin-auth.ts` で `export const adminAuth = createAdminAuth()` を **モジュールロード時に 1 回だけ** 生成（email/password、`cookiePrefix: "admin-auth"`）
- `src/shared/lib/customer-auth.ts` で `export const customerAuth = createCustomerAuth()` を **モジュールロード時に 1 回だけ** 生成（Google/LINE、`cookiePrefix: "customer-auth"`、`basePath: "/api/customer-auth"`）

Google OAuth は `serverEnv`（env / Secret Manager）を正本とし、**DB から provider を動的に差し替えたり、`getAuth()` / `resetAuthInstance()` で再 bootstrap したりしない**（AGENTS.md の不変条件）。

### Prisma アダプター + Prisma 7（必須設定）

- **アダプターに渡すクライアント**: `$extends` による Decimal 換算などを付けたアプリ用 `prisma` は使わない。`src/shared/db/prisma.ts` の **`basePrisma`（拡張前の `PrismaClient`）** のみを `src/shared/db/better-auth-adapter.ts` から `prismaAdapter(...)` に渡す
- **`generateId: "uuid"`**: DB スキーマが `@db.Uuid` のため `advanced.database.generateId: "uuid"` 必須（[公式](https://www.better-auth.com/docs/concepts/database)）。未設定だと Better Auth がランダム文字列 ID を生成し `invalid input syntax for type uuid` エラー
- **`baseURL`**: `betterAuth({ baseURL: serverEnv.BETTER_AUTH_URL ?? getAppUrl(), ... })` で明示設定（[公式](https://www.better-auth.com/docs/concepts/dynamic-base-url)）

### Server Components でのセッション取得（推奨: DAL ヘルパー）

運用コードでは `verifyAdminSession` / `getCurrentAdminUser` を優先（下記「セッション取得パターン」）。
`adminAuth.api.getSession` を直に叩く例（管理画面）:

```typescript
import { adminAuth } from "@/shared/lib/admin-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await adminAuth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/admin/login");
  }

  return <h1>Welcome {session.user.name}</h1>;
}
```

### Server Actions でのセッション取得（adminAuth.api 直接呼び出し）

```typescript
import { adminAuth } from "@/shared/lib/admin-auth";
import { headers } from "next/headers";

const someAuthenticatedAction = async () => {
  "use server";
  const session = await adminAuth.api.getSession({
    headers: await headers(),
  });
};
```

---

## 権限階層

```
SUPER_ADMIN > ADMIN > EDITOR > VIEWER > USER / CUSTOMER
```

| ロール        | 権限                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `SUPER_ADMIN` | システム全体の管理（ユーザー管理・監査ログ含む）                            |
| `ADMIN`       | コンテンツ管理全般（ユーザー管理除く）                                      |
| `EDITOR`      | 割り当てられたページのみ編集可能（`userPageAssignment` でリソース単位制御） |
| `VIEWER`      | 閲覧のみ（編集不可）                                                        |
| `USER`        | 公開ユーザー（管理画面アクセス不可）                                        |
| `CUSTOMER`    | ソーシャルログイン顧客（マイページのみアクセス可）                          |

### DASHBOARD_ROLES（ダッシュボードアクセス制御の SSOT）

**Single Source of Truth は `@/shared/lib/admin-roles`**（client-safe、`server-only` なし）。
`@/shared/lib/admin-auth`（server-only）は互換性のため `DASHBOARD_ROLES` を再 export する。

```typescript
// Server-only コード（admin-auth / customer-auth / permissions 等）
import { isDashboardRole } from "@/shared/lib/admin-roles";
if (!isDashboardRole(user.role)) redirect("/");

// Client Component（InviteForm / UserForm / status-badges 等）
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

### リソース別アクション一覧

`Resource` 型と `Action` 型は `@/admin/lib/permissions` で定義:

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

---

## Server Action の認証パターン

### executeAdminMutationResult（書き込み系 — 標準パターン）

権限チェック・実行・監査ログ・DomainError ハンドリングを一括処理する。
`@/admin/lib/admin-action` から import。**Server Actions の書き込み操作は原則これを使用**:

```typescript
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createSuccess } from "@/admin/types/server-actions";

export const createSpace = async (input: SpaceFormData) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "create",
    execute: async () => createSpaceCommand(parsed.data),
    success: (result) => createSuccess("作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

**`executeAdminMutationResult`** — `ActionResult` ではなく `MutationResult<T>` を返す変種（API Route 呼び出し等）:

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
  success: (result) => createSuccess("更新しました", result),
});
```

### checkPermission（API Route 用 — 直接呼び出し）

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

### NG パターン

```typescript
// NG: 認証チェックなし
export async function deleteSpace(id: string) {
  await prisma.space.delete({ where: { id } });
  return createSuccess("削除しました");
}

// NG: 権限ハードコード
export async function deleteSpace(id: string) {
  const session = await getSession();
  if (session?.user.role !== "SUPER_ADMIN")
    return createFailure("権限がありません");
}

// NG: Server Actions で checkPermission 直接呼び出し（executeAdminMutationResult を使う）
export async function createItem(input: ItemInput) {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

---

## セッション取得パターン

### Server Components（`cache()` でリクエスト単位にメモ化）

**Next.js Data Access Layer (DAL) パターン**に準拠。同一リクエスト内で複数回呼び出しても DB アクセスは 1 回のみ:

```typescript
import { verifyAdminSession } from "@/shared/lib/admin-auth";

// 管理認証必須ページ（未認証なら /admin/login にリダイレクト、DASHBOARD_ROLES 必須）
export default async function AdminPage() {
  const user = await verifyAdminSession();
  return <div>Welcome, {user.name}</div>;
}
```

### Server Actions（`cache()` **不使用**）

Server Actions は複数リクエストにまたがるため `cache()` を使用しない:

```typescript
import { getAdminSession, getAdminSessionUser } from "@/shared/lib/admin-auth";
import { createFailure } from "@/shared/types/server-actions";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createFailure("ログインが必要です");
  }
  // アクション実行（通常は checkAdminAuth/checkPermission を使用）
}
```

### オプショナル認証（リダイレクトなし）

```typescript
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";

export default async function Page() {
  const user = await getCurrentAdminUser(); // AdminUser | undefined
  if (user) {
    return <AuthenticatedView user={user} />;
  }
  return <PublicView />;
}
```

### セッション取得関数の使い分け

**管理者用（`@/shared/lib/admin-auth`）:**

| 関数                           | キャッシュ     | 未認証時               | 用途                                                 |
| ------------------------------ | -------------- | ---------------------- | ---------------------------------------------------- |
| `verifyAdminSession()`         | `cache()` あり | `/` redirect           | Server Components（DASHBOARD_ROLES 必須）            |
| `getCurrentAdminUser()`        | `cache()` あり | `undefined` を返す     | Server Components（オプショナル）                    |
| `getAdminSession()`            | なし           | `null` を返す          | Server Actions（直接使用は稀）                       |
| `getAdminSessionUser()`        | なし           | `null` を返す          | Server Actions（セッションから型安全にユーザー取得） |
| `executeAdminMutationResult()` | なし           | `MutationError` を返す | Server Actions（書き込み系 — **標準パターン**）      |
| `checkPermission()`            | なし           | `ActionFailure` を返す | API Route（`request.headers` を第3引数に渡す）       |

**顧客用（`@/shared/lib/customer-auth`）:**

| 関数                       | キャッシュ     | 未認証時           | 用途                                              |
| -------------------------- | -------------- | ------------------ | ------------------------------------------------- |
| `verifyCustomerSession()`  | なし           | `/login` redirect  | マイページ（CUSTOMER 認証、管理者→`/admin`）      |
| `getCurrentCustomerUser()` | `cache()` あり | `undefined` を返す | 公開ページ（オプショナル顧客認証）                |
| `getCustomerSession()`     | なし           | `null` を返す      | マイページ Server Actions                         |
| `getCustomerSessionUser()` | なし           | `null` を返す      | マイページ Server Actions（型安全なユーザー取得） |

---

## 型安全な Role 取得

Better Auth の `additionalFields` は `string` 型で定義されるため、
`getRoleFromSession` / `getSessionUser` で型安全に `Role` enum に変換する:

```typescript
// 管理者用
import { isValidRole, getAdminSessionUser } from "@/shared/lib/admin-auth";

const user = getAdminSessionUser(session); // AdminUser | null

// 顧客用
import { getCustomerSessionUser } from "@/shared/lib/customer-auth";

const user = getCustomerSessionUser(session); // CustomerUser | null

// isValidRole は両モジュールから export（同一実装）
if (isValidRole(session?.user?.role)) {
  const role = session.user.role; // Role 型に narrowed
}
```

**User 型の定義:**

```typescript
// 管理者用（admin-auth.ts）
export type AdminUser = Omit<AdminSession["user"], "role"> & {
  role: Role;
};

// 顧客用（customer-auth.ts）
export type CustomerUser = Omit<CustomerSession["user"], "role"> & {
  role: Role;
};
```

---

## 監査ログ

`executeAdminMutationResult` は `logAction()` を内部で自動呼び出しするため、手動呼び出し不要。
`resolveAuditResourceId` でリソース ID を動的解決できる:

```typescript
return executeAdminMutationResult({
  resource: "space",
  action: "create",
  execute: async () => createSpaceCommand(parsed.data),
  success: (result) => createSuccess("作成しました", result),
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

---

## 禁止事項

1. **認証チェック漏れ禁止**
   - 管理画面の書き込み系 Server Actions は `executeAdminMutationResult` / `executeAdminMutationResult` を使用
   - API Route は `checkPermission()` を直接呼び出す

2. **Server Actions での `checkPermission` 直接呼び出し禁止**
   - `executeAdminMutationResult` が権限チェック・監査ログ・DomainError ハンドリングを一括処理する
   - 直接 `checkPermission` を使うと監査ログが漏れる

3. **直接的な role アクセス禁止**
   - `session.user.role` を直接比較しない
   - `getRoleFromSession(session)` または `getSessionUser(session)` を使用

4. **`cache()` の誤用禁止**
   - Server Actions 内では `getAdminSession()` / `getCustomerSession()` を使用（`cache()` 不使用）
   - Server Components では `verifyAdminSession()` / `getCurrentAdminUser()` を使用（`cache()` あり）

5. **権限ハードコード禁止**
   - `user.role === 'ADMIN'` → `executeAdminMutationResult` の `resource`/`action` で宣言的に指定
   - `user.role === Role.ADMIN` の直接比較禁止

6. **HOF（`withPermission` / `withReadPermission`）パターン禁止**
   - Turbopack HMR との互換性のため廃止済み

---

## ファイル配置

| パス                                   | 内容                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@/shared/lib/admin-auth.ts`           | 管理者用 Better Auth 設定・セッション検証（`cookiePrefix: "admin-auth"`、email/password）                |
| `@/shared/lib/admin-auth-client.ts`    | 管理者用認証クライアント（`adminAuthClient`）                                                            |
| `@/shared/lib/customer-auth.ts`        | 顧客用 Better Auth 設定・セッション検証（`cookiePrefix: "customer-auth"`、Google/LINE）                  |
| `@/shared/lib/customer-auth-client.ts` | 顧客用認証クライアント（`customerAuthClient`）                                                           |
| `@/admin/lib/admin-action.ts`          | `executeAdminMutationResult`（Server Actions 標準認証パターン）                                          |
| `@/admin/lib/action-auth.ts`           | 認証プリミティブ（`checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `checkRole`, `logAction`） |
| `@/admin/lib/permissions.ts`           | 権限定義（`ROLE_PERMISSIONS`, `hasPermission`, `userHasResourceAccess`）                                 |
| `@/admin/lib/audit.ts`                 | 監査ログ記録（`logUserAction`, `logPermissionDenied`）                                                   |
| `@/admin/lib/role-guards.ts`           | ロール判定ヘルパー（`isEditorRole` 等）                                                                  |

## 公開顧客認証（ソーシャルログイン）

### verifyCustomerSession（マイページ用）

未認証→`/login`、管理者ロール→`/admin` にリダイレクト。`verifyAdminSession`（→`/`）とは分離:

```typescript
import { verifyCustomerSession } from "@/shared/lib/customer-auth";

export default async function MypageLayout({ children }) {
  const { user } = await verifyCustomerSession();
  const customer = await ensureCustomerLinked(user);
  // ...
}
```

### ensureCustomerLinked（User ↔ Customer 遅延紐づけ）

`databaseHooks.user.create.after` は FK 制約違反を起こすため使用禁止（[GitHub Issue #7260](https://github.com/better-auth/better-auth/issues/7260)）。マイページ layout で `ensureCustomerLinked(user)` を呼び、アプリケーション層で紐づけ:

- 検索順: `userId` → `email` → 新規作成（P2002 競合対策付き）
- `Customer.userId String? @unique @db.Uuid` — 一意制約で重複防止
- ソーシャルログイン初回は `lastName: user.name || "未設定"` で仮登録

### accountLinking

`trustedProviders: ["google", "line"]` で同一メールの自動統合。管理者メールで顧客がログインした場合、ADMIN User に統合され `/admin` にリダイレクト（`ensureCustomerLinked` は CUSTOMER ロール以外では呼ばれない）。

### マイページ Server Actions の認証パターン

```typescript
"use server";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";

export async function myAction(reservationId: string) {
  const session = await getCustomerSession();
  if (!session) return { error: "認証が必要です" };
  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return { error: "顧客情報が見つかりません" };
  // ドメインコマンドに customerId を渡して所有者チェック
}
```

### 公開ページ Settings クエリの分離

`admin-queries.ts` を公開ページから import しない。公開ページが必要なフィールドのみ取得する `public-queries.ts` を作成:

```typescript
// src/shared/domain/settings/public-queries.ts
export async function getReservationDeadlineSettings() {
  return prisma.settings.findFirstOrThrow({
    select: {
      cancellationDeadlineHours: true,
      modificationDeadlineHours: true,
    },
  });
}
```

### signIn.social のエラーハンドリング（公式推奨パターン）

`fetchOptions.onSuccess` / `onError` を使用。`result.error` のみでは HTTP エラー（429 等）を捕捉できない:

```typescript
void signIn.social({
  provider,
  callbackURL: "/mypage",
  fetchOptions: {
    onSuccess() {
      // Better Auth がリダイレクトを処理する — 追加操作不要
    },
    onError(ctx) {
      if (ctx.response.status === 429) {
        const retryAfter = ctx.response.headers.get("retry-after");
        // レート制限エラー表示
      } else {
        // ctx.error.message でエラー内容取得（"Provider not found" 等）
      }
    },
  },
});
```

**禁止パターン:**

```typescript
// NG: fetchOptions なし — HTTP エラー時にサイレント失敗
const result = await signIn.social({ provider: "google", callbackURL: "/mypage" });
if (result.error) { /* 429 はここに到達しない */ }

// NG: try/catch のみ — Better Auth クライアントは例外をスローしない
try { await signIn.social({ ... }); } catch (err) { /* 到達しない */ }
```

---

## Gotchas

- **`databaseHooks.user.create.after` はソーシャルログイン時に FK 制約違反** — トランザクション内で実行されるため外部テーブルへの FK 参照が失敗する（Issue #7260, #4614）。`ensureCustomerLinked` のようなアプリ層での遅延紐づけを使用
- **`prisma migrate dev` は非対話環境でブロック** — `prisma migrate diff --script` + `prisma db execute` + `prisma migrate resolve --applied` で代替
- **セッション作成で `invalid input syntax for type uuid` エラー** — `advanced.database.generateId: "uuid"` が未設定。Better Auth のデフォルト ID 生成はランダム文字列で、DB の `@db.Uuid` 制約に違反する
- **`'use cache'` 関数に Zod スキーマを引数で渡すと `Cannot access safeParse on the server` エラー** — `'use cache'` の引数は React シリアライゼーションを通るため、Zod スキーマ等の関数を含むオブジェクトは渡せない。DB フェッチのみをキャッシュし、バリデーションはキャッシュ境界外で行う
- **`verifyAdminSession()`（`@/shared/lib/admin-auth`）/ `isAdmin()` は `SUPER_ADMIN` も必須チェック** — `role !== Role.ADMIN` のみでは `SUPER_ADMIN`（全権限保有）が管理画面にアクセスできないバグになる。`role !== Role.ADMIN && role !== Role.SUPER_ADMIN` の形式で記述する
- **接続テスト・確認系アクションも `executeAdminMutationResult` 必須** — 独自の `checkXxxPermission()` ヘルパーは権限チェックが非標準になり欠落が生じる
- **Webhook トークン比較に `!==` 禁止** — `crypto.timingSafeEqual` を使用。`receivedToken !== settings.token` はタイミング攻撃に脆弱。Google Calendar webhook の `timingSafeTokenEqual()` が実装例
- **Better Auth クライアントの `forgetPassword` は `InferClientAPI` で型推論されない** — `emailAndPassword` のコア機能だが、クライアント型に含まれない。`adminAuthClient.$fetch("/request-password-reset", { method: "POST", body: { email, redirectTo } })` で直接呼び出す（管理者用）。`resetPassword` は型推論される
