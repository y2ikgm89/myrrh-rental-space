---
paths:
  - src/app/**
  - src/shared/**
---

# 認証パターンルール

> Better Auth 1.6.5 / RBAC / Next.js 16.2 対応（`package.json` の `better-auth` と一致）

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

| ロール        | 権限                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPER_ADMIN` | システム全体の管理（ユーザー管理・監査ログ含む）                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ADMIN`       | コンテンツ管理全般（ユーザー管理除く）                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `EDITOR`      | 割り当てられた **page** のみ編集可（page / media upload / blockTemplate read / notification read）。post / news / faq / event 等の独立コンテンツ resource は権限自体なし — `userPageAssignment` テーブルが page にのみ紐づく設計のため、resource-level access チェック (`userHasResourceAccess`) は **page UUID 専用判定**。子リソース (section 等) で `checkResourceAccess: true` を使う場合は `resolveResourceId` callback で親 page UUID を解決する |
| `VIEWER`      | 閲覧のみ（編集不可）                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `USER`        | 公開ユーザー（管理画面アクセス不可）                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CUSTOMER`    | ソーシャルログイン顧客（マイページのみアクセス可）                                                                                                                                                                                                                                                                                                                                                                                                     |

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

### 副作用のない admin-only fetch endpoint は `checkAdminAuth` で十分

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

### HTTP status の使い分け（401 vs 403）

[RFC 9110 §15.5.2 / §15.5.4](https://www.rfc-editor.org/rfc/rfc9110#name-401-unauthorized) 準拠:

- **401 Unauthorized** — 認証失敗（`checkAdminAuth` が `!success`）。クライアントは認証情報を付与して再試行可能
- **403 Forbidden** — 認証済みだが権限不足（`checkPermission` の permission チェックが `!success`）。同じ認証情報での再試行は失敗する

`checkPermission` は内部で `checkAdminAuth` も呼ぶため未認証時も `!success` になるが、エラーメッセージ文言（`"ログインが必要です"` / `"管理者権限が必要です"`）を見て status を分岐させない。**そのエンドポイントが `checkAdminAuth` 止まりか `checkPermission` まで検査するか**で status を選ぶ（呼び出し側の意図で決定）。

### NG パターン

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
import { createMutationError } from "@/shared/lib/mutation-result";

export async function myAction() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) {
    return createMutationError("ログインが必要です");
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

| 関数                           | キャッシュ     | 未認証時                               | 用途                                                 |
| ------------------------------ | -------------- | -------------------------------------- | ---------------------------------------------------- |
| `verifyAdminSession()`         | `cache()` あり | `/` redirect                           | Server Components（DASHBOARD_ROLES 必須）            |
| `getCurrentAdminUser()`        | `cache()` あり | `undefined` を返す                     | Server Components（オプショナル）                    |
| `getAdminSession()`            | なし           | `null` を返す                          | Server Actions（直接使用は稀）                       |
| `getAdminSessionUser()`        | なし           | `null` を返す                          | Server Actions（セッションから型安全にユーザー取得） |
| `executeAdminMutationResult()` | なし           | `MutationError` を返す                 | Server Actions（書き込み系 — **標準パターン**）      |
| `checkPermission()`            | なし           | `PermissionResult`（`!success`）を返す | API Route（`request.headers` を第3引数に渡す）       |

**顧客用（`@/shared/lib/customer-auth`）:**

| 関数                       | キャッシュ     | 未認証時           | 用途                                              |
| -------------------------- | -------------- | ------------------ | ------------------------------------------------- |
| `verifyCustomerSession()`  | `cache()` あり | `/login` redirect  | マイページ（CUSTOMER 認証、管理者→`/admin`）      |
| `getCurrentCustomerUser()` | `cache()` あり | `undefined` を返す | 公開ページ（オプショナル顧客認証）                |
| `getCustomerSession()`     | なし           | `null` を返す      | マイページ Server Actions                         |
| `getCustomerSessionUser()` | なし           | `null` を返す      | マイページ Server Actions（型安全なユーザー取得） |

---

## 型安全な Role 取得

Better Auth の `additionalFields` は `string` 型で定義されるため、
`getAdminSessionUser` / `getCustomerSessionUser` で型安全に `Role` enum に変換する:

```typescript
// 管理者用
import { getAdminSessionUser } from "@/shared/lib/admin-auth";

const user = getAdminSessionUser(session); // AdminUser | null

// 顧客用
import { getCustomerSessionUser } from "@/shared/lib/customer-auth";

const user = getCustomerSessionUser(session); // CustomerUser | null

// isValidRole は SSoT に集約: @/shared/lib/validations/enums/guards
// （旧 admin-auth.ts / customer-auth.ts の重複定義は削除済み）
import { isValidRole } from "@/shared/lib/validations/enums/guards";
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

7. **`isValidRole` / `VALID_ROLES` のローカル再定義禁止**
   - SSoT は `@/shared/lib/validations/enums/guards.ts` のみ
   - `admin-auth.ts` / `customer-auth.ts` 内の `getAdminSessionUser()` / `getCustomerSessionUser()` は guards.ts の `isValidRole` を import して使う
   - 旧 API（`admin-auth.ts` / `customer-auth.ts` からの `isValidRole` export）は削除済み。復活させない

8. **`ROLE_PERMISSIONS.EDITOR` に page 系以外の resource を追加禁止**
   - `userHasResourceAccess` は page UUID 専用判定のため、独立 resource (post / news / event 等) を EDITOR に許可すると `checkResourceAccess: true` 経路で常に reject される silent bug の温床
   - EDITOR を別 resource に拡張する場合は、`userHasResourceAccess` 自体を resource-aware（per-resource access table 参照）にリファクタする必要がある — 現状の page-only 設計を維持する場合は ADMIN+ で実装する
   - 現状許容されている EDITOR 権限: `page:read/update` / `media:create+read+update` / `blockTemplate:read` / `notification:read` のみ

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

### OAuth token の at-rest encryption（Better Auth 互換）

Better Auth が `Account.{accessToken,refreshToken}` を OAuth callback で **plaintext 直書き**する制約下で、本ルールの「`basePrisma` を Better Auth に渡す」「`databaseHooks` 不使用」規律と互換な at-rest encryption は **application 層境界の transparent encryption** で実装する（`$extends` query middleware は不使用 — Better Auth に拡張前クライアントを渡す原則を維持）:

- **read** (`getGoogleOAuthAccount` 等): `isEncrypted(value)` で encrypted/legacy plaintext を判定、encrypted は `safeDecrypt`、plaintext は ① そのまま return ② `fireAndForget(reEncryptLegacyOAuthToken(...))` で background 再暗号化を予約
- **write** (`updateGoogleOAuthAccountTokens`): `encryptOAuthToken(plaintext)` で必ず encrypt してから DB 書き込み
- **migration script 不要** — Better Auth callback 直書きの token は最初の application 層 read で encrypt 化、以降は OAuth refresh / token rotate のたびに encrypted state へ自然収束（実装: 2026-05-07、purpose=`"oauth-google"`、AES-256-GCM + HKDF）
- `reEncryptLegacyOAuthToken` は再読み込み + `isEncrypted` + 値一致の 3 段チェックで競合書き込みを no-op fallback
- 新規 OAuth provider 追加時はこの pattern を踏襲（`encryptOAuthToken` の purpose を `"oauth-<provider>"` に分けて HKDF 派生鍵を分離）

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

### signOut（マイページ / 公開ヘッダー用）

Better Auth 公式推奨パターン。`router.push` 単独だと PPR の server-side session キャッシュが古いため `router.refresh()` を併用:

```typescript
await signOut({
  fetchOptions: {
    onSuccess: () => {
      router.push("/");
      router.refresh(); // PPR server-side session キャッシュ無効化
    },
  },
});
```

実装は `@/public/components/ui/logout-button.tsx` の `LogoutButton`（`desktop-nav` / `mobile-nav` variants）に集約。**マイページ・設定ページ等にローカル再実装禁止**。業界標準（GitHub / Stripe / Notion / Amazon）はヘッダー右上配置 — `site-header.tsx` の `authSlot?.variant === "authenticated"` 分岐のみが SSoT。

### signIn（公開サインイン用）

**Better Auth Client API `signIn.email({ callbackURL })` / `signIn.social({ callbackURL })` が公式パターン**。Client API の Set-Cookie response を Next.js の `nextCookies` プラグインが Router Cache と同期するため、callbackURL へのリダイレクト後にヘッダー等の Server Component が新 session で自動再評価される。

```typescript
// OK: Client API + callbackURL — Set-Cookie + Router Cache 自動更新
await signIn.email({
  email,
  password,
  callbackURL: "/mypage",
  fetchOptions: {
    onError: (ctx) => setError(ctx.error.message ?? "ログインに失敗しました"),
  },
});
```

**NG パターン**: Server Action 経由 `customerAuth.api.signInEmail` + `revalidatePath("/", "layout")` + `router.push + router.refresh()` では Next.js 16 PPR 環境で Router Cache が更新されず、`/mypage` 遷移後もヘッダーが未認証表示のまま残る（`revalidatePath` は server-side Full Route Cache のみ無効化、Client Router Cache には伝播しない）。

```typescript
// NG: Server Action 経由の signInEmail
"use server";
await customerAuth.api.signInEmail({ body: {...}, headers: await headers() });
revalidatePath("/", "layout"); // ← ヘッダー更新に不十分
```

**hybrid パターン**（server 操作が必要な場合）: ユーザー作成等を Server Action (`ensureDevUserAction` 等) に分離し、sign-in 自体は Client API で実行する。credentials は `xxx-credentials.ts` に SSoT 抽出して client / server 両方で参照（参照実装: `src/app/(public)/login/_components/dev-login-{action,button,credentials}.ts`）。

**`fetchOptions.onError` は `signIn.email` でも必須**（`signIn.social` と同じ契約） — `result.error` のみでは HTTP 429（レート制限）等が Better Auth クライアントで Promise サイレントに処理され UI にフィードバックが出ない。管理画面 LoginForm も公開ページの social login と同パターンに統一:

```typescript
await signIn.email({
  email,
  password,
  fetchOptions: {
    onSuccess: () => {
      /* localStorage 保存 + router.push */
    },
    onError: (ctx) => {
      if (ctx.response.status === 429) setError("レート制限エラー");
      else setError("認証エラー");
    },
  },
});
```

**NG**: `try { const result = await signIn.email(...); if (result.error) setError(...); } catch { ... }` — Better Auth クライアントは例外を throw しないため catch は不到達、429 も result.error に現れず silent failure。参照実装: `src/app/(admin)/admin/(auth)/login/LoginForm.tsx`。

---

## Gotchas

- **`databaseHooks.user.create.after` はソーシャルログイン時に FK 制約違反** — トランザクション内で実行されるため外部テーブルへの FK 参照が失敗する（Issue #7260, #4614）。`ensureCustomerLinked` のようなアプリ層での遅延紐づけを使用
- **`prisma migrate dev` は非対話環境でブロック** — `prisma migrate diff --script` + `prisma db execute` + `prisma migrate resolve --applied` で代替
- **セッション作成で `invalid input syntax for type uuid` エラー** — `advanced.database.generateId: "uuid"` が未設定。Better Auth のデフォルト ID 生成はランダム文字列で、DB の `@db.Uuid` 制約に違反する
- **`'use cache'` 関数に Zod スキーマを引数で渡すと `Cannot access safeParse on the server` エラー** — `'use cache'` の引数は React シリアライゼーションを通るため、Zod スキーマ等の関数を含むオブジェクトは渡せない。DB フェッチのみをキャッシュし、バリデーションはキャッシュ境界外で行う
- **`verifyAdminSession()`（`@/shared/lib/admin-auth`）/ `isAdmin()` は `SUPER_ADMIN` も必須チェック** — `role !== Role.ADMIN` のみでは `SUPER_ADMIN`（全権限保有）が管理画面にアクセスできないバグになる。`role !== Role.ADMIN && role !== Role.SUPER_ADMIN` の形式で記述する
- **接続テスト・確認系アクションも `executeAdminMutationResult` 必須** — 独自の `checkXxxPermission()` ヘルパーは権限チェックが非標準になり欠落が生じる
- **resource permission の上にロール制限を加える場合は `execute` callback 内で `user.role` チェック** — 新 resource enum を増やさず特権操作（restore / force-close / impersonate 等）を表現する canonical パターン。`execute: async (user) => { if (user.role !== Role.SUPER_ADMIN) throw new DomainError("...", "FORBIDDEN"); ... }`。`executeAdminMutationResult` が `DomainError("FORBIDDEN")` を `MutationError` に自動変換するため UI 側で 403 として扱える。参照実装: `restoreReservationStatus` (`reservation/mutations.ts`)
- **Webhook トークン比較に `!==` 禁止** — `crypto.timingSafeEqual` を使用。`receivedToken !== settings.token` はタイミング攻撃に脆弱。Google Calendar webhook の `timingSafeTokenEqual()` が実装例
- **Better Auth クライアントの `forgetPassword` は `InferClientAPI` で型推論されない** — `emailAndPassword` のコア機能だが、クライアント型に含まれない。`adminAuthClient.$fetch("/request-password-reset", { method: "POST", body: { email, redirectTo } })` で直接呼び出す（管理者用）。`resetPassword` は型推論される

### EDITOR ロール契約（page-only 設計）

- **`ROLE_PERMISSIONS.EDITOR` への追加は page resource のみ許容** — `userHasResourceAccess` は `assignedPageIds.includes(resourceId)` で判定する **page UUID 専用ロジック**。post / news / event 等の独立 resource を EDITOR に許可すると `checkResourceAccess: true` 有効化時に常に reject される silent bug の温床。EDITOR は page / media upload / blockTemplate(read) / notification(read) のみ
- **slug ベース resourceId の page Server Action は `resolveResourceId` 必須** — `updatePage(slug)` 等で `resourceId: slug` を直接渡すと slug ≠ page UUID で `userPageAssignment` 判定が常に false になる。`resolveResourceId: () => getPageIdBySlugQuery(slug)` で認証後に UUID 解決し、`resolveAuditResourceId: () => slug` で監査ログには slug を残す。参照実装: `actions/page.ts` の `updatePage` / `restorePage` / `updatePageSeo`
- **bulk page operations は ADMIN+ 限定設計** — `page:delete` / `page:publish` を EDITOR から外すことで bulk action が permission level で弾かれ、per-item resourceId 判定の複雑さを回避（業界標準: WordPress 風の per-item edit_others は本プロジェクト未採用）。EDITOR は per-page edit のみ可能とする clean break 採用済

### Turnstile 保護エンドポイント（before hook パターン）

`/request-password-reset` / `/reset-password` は `admin-auth.ts` の `hooks.before` で Cloudflare Turnstile 保護。
Better Auth 公式 `captcha` プラグインと**同一の `x-captcha-response` ヘッダー契約**を採用しつつ、DB 管理 secret key との整合のため hook で実装（公式プラグインは静的 `secretKey` を要求するため採用不可）:

```typescript
const TURNSTILE_PROTECTED_ENDPOINTS: ReadonlyMap<string, TurnstileAction> =
  new Map([
    ["/request-password-reset", TURNSTILE_ACTIONS.admin_password_reset_request],
    ["/reset-password", TURNSTILE_ACTIONS.admin_password_reset],
  ]);

hooks: {
  before: createAuthMiddleware(async (ctx) => {
    const expectedAction = TURNSTILE_PROTECTED_ENDPOINTS.get(ctx.path);
    if (!expectedAction) return;
    const token = ctx.headers?.get("x-captcha-response") ?? undefined;
    const result = await validateTurnstile({ token, expectedAction });
    if (!result.success) {
      throw new APIError("BAD_REQUEST", { message: result.error });
    }
  }),
  // ...
}
```

**クライアント送信パターン**:

```typescript
// $fetch（Better Auth クライアント型に無い endpoint）
await adminAuthClient.$fetch("/request-password-reset", {
  method: "POST",
  body: { email, redirectTo },
  headers: { "x-captcha-response": turnstileToken },
});

// 型推論される client method
await adminAuthClient.resetPassword({
  newPassword,
  token,
  fetchOptions: { headers: { "x-captcha-response": turnstileToken } },
});
```

**新規保護エンドポイント追加手順**:

1. `turnstile-actions.ts` の `TURNSTILE_ACTIONS` に識別子を追加（公式制約: 英数/`_`/`-`、最大32文字）
2. `admin-auth.ts` の `TURNSTILE_PROTECTED_ENDPOINTS` Map に `[path, action]` エントリを追加
3. クライアントの該当 endpoint 呼び出しで `fetchOptions.headers["x-captcha-response"]` にトークンを渡す
4. `TurnstileWidget` に `action={TURNSTILE_ACTIONS.xxx}` を指定

**禁止パターン**:

- Better Auth 公式 `captcha` プラグインの採用（静的 `secretKey` 要求 → DB 管理方針に非互換）
- `ctx.body` / URL からトークン読み取り（必ず `x-captcha-response` ヘッダー契約を維持。公式 captcha プラグイン互換性のため）
- `validateTurnstile` の結果を `try/catch` で握り潰す（`APIError("BAD_REQUEST")` で throw して Better Auth の標準エラーフローに流す）

### Gotchas

### Better Auth hooks の挙動（TS 型に出ない仕様）

- **`hooks.after` は APIError throw 時にも発火する** — `to-auth-endpoints.mjs` で APIError は catch されて `internalContext.context.returned` に格納されてから after hook が呼ばれる。成功 / 失敗の対称配線は `ctx.context.returned.status !== "OK"` で判定（TS 型では露出していない実装由来の挙動）。`/reset-password` の `PASSWORD_CHANGE` / `PASSWORD_RESET_FAILED` 対称監査ログ（`admin-auth.ts`）が canonical 参照実装
- **`onAPIError.onError(error, ctx)` の `ctx` は静的 AuthContext のみ** — `ctx.path` / `ctx.body` は未提供（型は `(error, ctx: AuthContext) => void`、内部で `betterFetch` の閉包から渡される静的 instance context）。per-request の path / body / email を含む失敗トラッキングは `onAPIError` ではなく `hooks.after` + `ctx.context.returned` で実装する

### 認証 / ルーティング

### Admin Gate

- **`admin-login-gate.ts` に `server-only` / `serverEnv` 依存禁止** — seed.ts・CLI スクリプト（`scripts/generate-login-url.ts`）から import するため。`process.env` を直接参照する
- **Admin Gate トークン生成の鶏と卵** — 管理画面APIでトークン生成するには既にログインが必要。初回は `bun prisma/seed.ts --admin`（自動URL出力）または `bun scripts/generate-login-url.ts` で生成
- **proxy.ts の `/admin/login` ガードを削除しない** — Admin Gate が無効化されると管理画面ログインページが公開される。修正時は gate cookie / token の2条件を維持すること。セッション cookie の存在だけでは通過させない（CUSTOMER ロールのセッションでもログインフォームが露出するため）
- **`verifyAdminSession` は非管理者ロールを `/` にリダイレクト** — `/admin/login` ではなく `/` にリダイレクトする。`/admin/login` にリダイレクトすると Admin Gate で 404 になるか、gate cookie があれば無限リダイレクトループが発生する
- **`DASHBOARD_ROLES`（`@/shared/lib/admin-auth`）がダッシュボードアクセス可能なロールの Single Source of Truth** — `verifyAdminSession`・ログインページで共有。ロール追加時はこの定数のみ更新
- **`/admin/api/*` の Client fetch が 404 になる原因の典型は admin セッション切れ** — proxy.ts は `/admin` プレフィックスを持つ全パスにセッション必須チェックを適用するため、`/admin/api/notifications/unread-count` 等の admin API も対象。セッション cookie 不在 → `/admin/login` 307 redirect → fetch が redirect follow → `/admin/login` で admin-gate cookie もなければ `handleAdminLoginGate` が 404 を返却 → ブラウザコンソールには「API が 404」と見える silent debug trap。切り分け: ① `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/api/...` で 307 が出れば proxy redirect、② DevTools → Application → Cookies で `admin-auth.session_token` と `admin_login_gate` の有無確認、③ 不在なら再ログイン

### Multiple Root Layouts

- **root `app/loading.tsx` を削除する場合、各 route group 内に `loading.tsx` が必要** — root `loading.tsx` は `app/layout.tsx` がなくても Suspense boundary として機能している。削除すると `(dashboard)/layout.tsx` 等の動的レイアウトで「Uncached data was accessed outside of \<Suspense\>」ビルドエラー。対処: `(admin)/admin/loading.tsx`（admin 全体）と `(admin)/admin/(auth)/loading.tsx`（認証画面）を個別に追加
- **Multiple Root Layouts では `app/not-found.tsx` 禁止 — `app/global-not-found.tsx` を使う** — Next.js 16 で `app/not-found.tsx` に `<html><body>` を書くと内部 `DefaultLayout` と衝突し hydration mismatch（server が `<html lang="ja"><body className="...">` を送り、client が DefaultLayout の素の `<html><body>` を期待）。公式解は `app/global-not-found.tsx` + `next.config.ts` の `experimental: { globalNotFound: true }`。`global-not-found.tsx` は Server Component で CSS import + `next/font/google` が使用可能（Root Layout をバイパスして自前で `<html><body>` を持つ）。各 Route Group 内の `not-found.tsx`（`(public)/not-found.tsx` / `(admin)/admin/(dashboard)/not-found.tsx` 等）は `<html><body>` を**含めず**、各 Root Layout 配下で描画される。`global-error.tsx` は `"use client"` 必須のためインラインスタイル（admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可）
- **ルーティング移行後の空ディレクトリ残骸に注意** — `[slug]` → `[...segments]` 等の移行で空ディレクトリが残る。`page.tsx` がなくても Next.js のルート解決に影響する可能性がある
- **JSX `className` 内の改行は hydration mismatch** — `className="fixed bottom-16\n        md:hidden"` のようにダブルクォート文字列内に改行+インデントを含めると SSR は生文字列をそのまま出力、React は CSR で空白正規化した文字列を期待し差分発生（`sticky-bottom-bar.tsx` で実例）。Prettier が複数行整形する長さなら `cn("fixed ...", "md:hidden")` で配列分割、そうでなければ single-line を維持する（→ `tailwind-patterns/inline-style-vs-arbitrary.md` §禁止事項 3.1）
- **動的 layout を持つサブルートに `loading.tsx` 必須** — `mypage/layout.tsx`（認証チェーン）や `(dashboard)/layout.tsx` 配下のサブルートには個別の `loading.tsx` を追加。親の `loading.tsx` だけではページ固有のデータ取得待ちと認証待ちが同じスケルトンに合流する
- **マイページ開発確認は dev login ボタンを使用** — `/login` ページに `NODE_ENV !== "production"` でのみ表示される「テスト顧客でログイン」ボタンあり（`dev-login-action.ts`）。Better Auth の `signUpEmail`/`signInEmail` で `dev-customer@example.com` セッションを作成し、`ensureCustomerLinked` が Customer を自動生成
- **URL 由来 initial props の Client Component は `key={urlValue}` 必須** — `searchParams` / `params` が変わっても同一 route 内では Client Component が remount されず `useState` lazy init / `useForm defaultValues` / `useReducer` initial state が stale 化する。実例: 利用規約「規約を追加」ダイアログで type 選択時に URL は変わるが常にプライバシーポリシーテンプレートが表示される silent bug（`terms/new/page.tsx` で `key={typeParam}` を追加して修正）。key 不要ケース: Dialog 内 form（unmount で自動 reset）/ Settings singleton / list page（nuqs 直接 subscribe）/ 別 route segment。詳細は `react/forms-ssr.md` §Resetting state with key

### ナビゲーション

- **ヘッダーナビは DB（`NavigationItem` テーブル）が正、`FALLBACK_NAV` はフォールバック** — ナビ変更は seed.ts + DB 両方を更新。コードだけ変えても DB にレコードがあればそちらが使われる
- **CTA ボタンと同じ URL をナビリンクに含めない** — `site-header.tsx` が `/reservation` をフィルタ除外済み。新しい CTA 導線を追加する場合も同パターンで重複を防ぐ
- **seed の `navigationItem` は "create if not exists"** — 既存レコードの削除・更新はしない。ナビ項目を削除するには DB 直接操作または管理画面が必要

### Better Auth クライアント

- **Better Auth `$Infer` は module augmentation で上書きできない** — `better-auth.d.ts` で `interface User { role: Role }` を宣言しても、`AuthInstance["$Infer"]["Session"]["user"]["role"]` は `additionalFields` の `type: "string"` から推論された `string` のまま。`Omit<Session["user"], "role"> & { role: Role }` パターン（`admin-auth.ts` / `customer-auth.ts`）が必須。`getAdminSessionUser()` / `getCustomerSessionUser()` のランタイム `isValidRole()` 検証も維持する
- **`signIn.social()` のエラーハンドリングは `fetchOptions.onError` が公式推奨** — `result.error` だけでは 429 等の HTTP エラー時に Promise がサイレントに処理され UI にフィードバックが出ない。`fetchOptions: { onError(ctx) { ctx.response.status } }` で HTTP ステータスを検査する
- **Google/LINE ソーシャルログインボタンはブランド SVG ロゴ必須** — テキストのみのボタンは UX 品質不足。Google は公式4色「G」ロゴ + 白背景、LINE は `#06C755` 背景 + 白アイコン
- **ソーシャルプロバイダーロゴは `@/public/components/ui/social-provider-logos.tsx` の共有コンポーネントを使用** — `GoogleLogo`/`LineLogo`/`PROVIDER_LOGOS` をエクスポート。ログインページ・アカウント連携の両方で使用。ローカル定義禁止
