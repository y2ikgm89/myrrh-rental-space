# Auth セッション分離設計

> 管理者と顧客の Better Auth セッションを Cookie prefix で完全分離する

## 背景

単一の Better Auth インスタンスが管理者(email/password)と顧客(Google/LINE)の両方を処理しており、Cookie が1つしかないため、公開サイトでソーシャルログインすると管理者セッションが上書きされる。Multiple Root Layouts で CSS・レイアウトは完全分離済みだが、認証は未分離。

## 目標

- 管理者と顧客のセッション Cookie を分離し、同時共存を実現
- 破壊的変更OK、後方互換性なしのクリーン実装
- Better Auth 公式パターンに準拠

## 設計

### アーキテクチャ

```
adminAuth (admin-auth.*)        customerAuth (customer-auth.*)
├─ email/password のみ          ├─ Google/LINE ソーシャルのみ
├─ 監査ログ hooks               ├─ accountLinking enabled
├─ sendResetPassword            ├─ deleteUser enabled
├─ /api/auth/*                  ├─ /api/customer-auth/*
└─ 管理画面 /admin/*            └─ 公開ページ /mypage/*, /login
         │                              │
         └──────── 同一 DB ─────────────┘
              (user/session/account テーブル)
```

### ファイル構成

#### 新規作成

| ファイル                                      | 内容                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| `src/shared/lib/customer-auth.ts`             | 顧客用 Better Auth インスタンス + セッション検証関数 |
| `src/shared/lib/customer-auth-client.ts`      | 顧客用クライアント SDK                               |
| `src/app/api/customer-auth/[...all]/route.ts` | 顧客用 API ルート                                    |

#### リネーム（破壊的変更）

| 旧パス                          | 新パス                                |
| ------------------------------- | ------------------------------------- |
| `src/shared/lib/auth.ts`        | `src/shared/lib/admin-auth.ts`        |
| `src/shared/lib/auth-client.ts` | `src/shared/lib/admin-auth-client.ts` |

#### 更新（import パス変更）

全ファイルの import を `@/shared/lib/auth` → `@/shared/lib/admin-auth` または `@/shared/lib/customer-auth` に更新。

### インスタンス設定

#### adminAuth

```typescript
// src/shared/lib/admin-auth.ts
export const adminAuth = betterAuth({
  baseURL: appUrl,
  database: createBetterAuthDatabaseAdapter(),
  advanced: {
    database: { generateId: "uuid" },
    cookiePrefix: "admin-auth",
  },
  session: {
    expiresIn: SESSION_CONFIG.expiresIn, // 30日
    updateAge: SESSION_CONFIG.updateAge, // 1日
    cookieCache: {
      enabled: true,
      maxAge: SESSION_CONFIG.cookieCacheMaxAge, // 5分
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetUrl: url,
      });
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "CUSTOMER", input: false },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // 監査ログ（管理者ログインのみ）
      if (ctx.path.startsWith("/sign-in") && ctx.context.newSession) {
        const { user } = ctx.context.newSession;
        void logAuthEvent(AuditAction.LOGIN_SUCCESS, user.id, {
          email: user.email,
          provider: "email",
        });
      }
    }),
  },
  trustedOrigins: [appUrl],
  plugins: [nextCookies()],
});
```

#### customerAuth

```typescript
// src/shared/lib/customer-auth.ts
export const customerAuth = betterAuth({
  baseURL: appUrl,
  basePath: "/api/customer-auth", // デフォルト /api/auth と衝突回避
  database: createBetterAuthDatabaseAdapter(),
  advanced: {
    database: { generateId: "uuid" },
    cookiePrefix: "customer-auth",
  },
  session: {
    expiresIn: SESSION_CONFIG.expiresIn,
    updateAge: SESSION_CONFIG.updateAge,
    cookieCache: {
      enabled: true,
      maxAge: SESSION_CONFIG.cookieCacheMaxAge,
    },
  },
  emailAndPassword: {
    // 開発環境のみ有効（dev-login-action 用）
    enabled: process.env["NODE_ENV"] !== "production",
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            scope: ["openid", "email", "profile"],
          },
        }
      : {}),
    ...(lineClientId && lineClientSecret
      ? {
          line: {
            clientId: lineClientId,
            clientSecret: lineClientSecret,
            scope: ["openid", "profile", "email"],
          },
        }
      : {}),
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google", "line"] },
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "CUSTOMER", input: false },
    },
    deleteUser: { enabled: true },
  },
  trustedOrigins: [appUrl],
  plugins: [nextCookies()],
});
```

### エクスポート関数

#### admin-auth.ts

```typescript
// Better Auth インスタンス
export const adminAuth: AuthInstance;

// 型
export type AdminSession = AuthInstance["$Infer"]["Session"];
export type AdminUser = Omit<AdminSession["user"], "role"> & { role: Role };

// セッション検証（Server Components — cache() メモ化）
export const verifyAdminSession: (headers?: Headers) => Promise<AdminUser>;
export const getCurrentAdminUser: (
  headers?: Headers,
) => Promise<AdminUser | undefined>;
export const isAdmin: (headers?: Headers) => Promise<boolean>;

// セッション取得（Server Actions — cache なし）
export const getAdminSession: (
  headers?: Headers,
) => Promise<AdminSession | null>;

// ヘルパー
export const getAdminSessionUser: (
  session: AdminSession | null,
) => AdminUser | null;
export const DASHBOARD_ROLES: readonly Role[];
export const isValidRole: (role: string) => role is Role;
```

#### customer-auth.ts

```typescript
// Better Auth インスタンス
export const customerAuth: AuthInstance;

// 型
export type CustomerSession = AuthInstance["$Infer"]["Session"];
export type CustomerUser = Omit<CustomerSession["user"], "role"> & {
  role: Role;
};

// セッション検証（Server Components）
export const verifyCustomerSession: () => Promise<{
  session: CustomerSession;
  user: CustomerUser;
}>;
export const getCurrentCustomerUser: (
  headers?: Headers,
) => Promise<CustomerUser | undefined>;

// セッション取得（Server Actions）
export const getCustomerSession: (
  headers?: Headers,
) => Promise<CustomerSession | null>;

// ヘルパー
export const getCustomerSessionUser: (
  session: CustomerSession | null,
) => CustomerUser | null;
```

#### admin-auth-client.ts

```typescript
export const adminAuthClient = createAuthClient({
  baseURL: getAppUrl(),
  // basePath: "/api/auth" — デフォルトのため省略可
  plugins: [inferAdditionalFields<typeof adminAuth>()],
});
export const { signIn, signOut, signUp, useSession, getSession } =
  adminAuthClient;
```

#### customer-auth-client.ts

```typescript
export const customerAuthClient = createAuthClient({
  baseURL: getAppUrl(),
  basePath: "/api/customer-auth", // サーバー側 basePath と一致必須
  plugins: [inferAdditionalFields<typeof customerAuth>()],
});
export const {
  signIn,
  signOut,
  useSession,
  getSession,
  linkSocial,
  unlinkAccount,
  deleteUser,
} = customerAuthClient;
```

### Proxy 変更

```typescript
// src/proxy.ts — 管理画面は admin-auth Cookie をチェック
const sessionCookie = getSessionCookie(req, { cookiePrefix: "admin-auth" });
if (!sessionCookie) {
  return NextResponse.redirect(new URL("/admin/login", req.url));
}
```

### Import 更新マップ

#### Admin 側（`@/shared/lib/auth` → `@/shared/lib/admin-auth`）

| ファイル                                                 | 変更内容                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `(admin)/admin/(auth)/login/page.tsx`                    | `getSession` → `getAdminSession`, `getRoleFromSession` → `getAdminSessionUser` |
| `(admin)/admin/(auth)/login/LoginForm.tsx`               | `signIn` from `admin-auth-client`                                              |
| `(admin)/admin/(dashboard)/_shared/lib/action-auth.ts`   | `getSession` → `getAdminSession`                                               |
| `(admin)/admin/(dashboard)/_shared/queries/_helpers.ts`  | `verifyAdminSession` from `admin-auth`                                         |
| `(admin)/admin/(dashboard)/_components/UserInfo.tsx`     | `admin-auth`                                                                   |
| `(admin)/admin/(dashboard)/_components/LogoutButton.tsx` | `signOut` from `admin-auth-client`                                             |
| `src/proxy.ts`                                           | `getSessionCookie` に `cookiePrefix: "admin-auth"`                             |
| `src/app/api/auth/[...all]/route.ts`                     | `adminAuth` from `admin-auth`                                                  |
| `(public)/forgot-password/*`                             | `adminAuthClient` (管理者のみパスワードあり)                                   |
| `(public)/reset-password/*`                              | `adminAuthClient`                                                              |

#### Customer 側（`@/shared/lib/auth` → `@/shared/lib/customer-auth`）

| ファイル                                                   | 変更内容                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `(public)/login/page.tsx`                                  | `getCurrentCustomerUser` from `customer-auth`             |
| `(public)/login/_components/social-login-buttons.tsx`      | `signIn` from `customer-auth-client`                      |
| `(public)/login/_components/dev-login-action.ts`           | `customerAuth`                                            |
| `(public)/mypage/layout.tsx`                               | `verifyCustomerSession` from `customer-auth`              |
| `(public)/mypage/settings/_components/account-linking.tsx` | `linkSocial`, `unlinkAccount` from `customer-auth-client` |
| `(public)/mypage/_shared/actions/account.ts`               | `getCustomerSession`, `deleteUser`                        |
| `(public)/mypage/_shared/actions/profile.ts`               | `getCustomerSession`                                      |
| `(public)/mypage/_shared/actions/reservation.ts`           | `getCustomerSession`                                      |
| `(public)/_shared/actions/review.ts`                       | `getCustomerSession`                                      |
| `(public)/_shared/actions/event-registration.ts`           | `getCustomerSession`                                      |
| `(public)/_shared/actions/inquiry.ts`                      | `getCustomerSession`                                      |
| `(public)/_shared/actions/reservation.ts`                  | `getCustomerSession`                                      |
| `(public)/_shared/components/layouts/mobile-nav.tsx`       | `useSession` from `customer-auth-client`                  |
| `(public)/reservation/page.tsx`                            | `getCurrentCustomerUser`                                  |
| `(public)/layout.tsx`                                      | `customer-auth` (if auth used)                            |
| `src/app/api/customer-auth/[...all]/route.ts`              | **新規**                                                  |

#### Shared（更新のみ）

| ファイル                                          | 変更内容                               |
| ------------------------------------------------- | -------------------------------------- |
| `src/shared/domain/users/commands.ts`             | 使用する auth インスタンスに応じて分岐 |
| `src/shared/domain/staff-invitations/commands.ts` | `adminAuth`                            |
| `src/shared/domain/customers/link.ts`             | 変更なし（auth インスタンス不使用）    |
| `src/shared/db/better-auth-adapter.ts`            | 変更なし（共有）                       |
| `prisma/seed.ts`                                  | `adminAuth` (admin ユーザー作成)       |

### Dev Login Action

`customerAuth` は本番で `emailAndPassword: false` のため `signUpEmail`/`signInEmail` が使えない。開発環境のみ条件付きで有効化:

```typescript
// customer-auth.ts
emailAndPassword: {
  enabled: process.env["NODE_ENV"] !== "production",
},
```

### パスワードリセット

- `/forgot-password`, `/reset-password` は `adminAuthClient` を使用
- 顧客はソーシャルログインのみのためパスワードリセット不要
- これらのページは `(public)` ルートグループに残す（Admin Gate の外でアクセス可能にするため）

### 既存セッションの影響

Cookie prefix が変わるため、デプロイ後に全ユーザーのセッションが無効化される。再ログインが必要。破壊的変更として許容。

### ルールファイル更新

- `.claude/rules/auth-patterns.md` — 分離後のパターンに全面書き換え
- `.claude/rules/gotchas.md` — auth 関連エントリを更新
- `CLAUDE.md` — SSOT テーブルに `adminAuth`/`customerAuth` を追加

### テスト更新

- `__tests__/unit/proxy-admin-gate.test.ts` — `cookiePrefix: "admin-auth"` に更新
- `__tests__/unit/lib/permissions.test.ts` — import パス更新
- `__tests__/unit/queries/admin-query-helpers.test.ts` — import パス更新
- `__tests__/unit/architecture-boundaries.test.ts` — 新しいモジュールパスに更新
- mock パターン: `mock.module("@/shared/lib/admin-auth")` / `mock.module("@/shared/lib/customer-auth")`

## 非スコープ

- ロール体系の変更（SUPER_ADMIN/ADMIN/EDITOR/VIEWER/USER/CUSTOMER は現状維持）
- DB スキーマ変更（user/session/account テーブルは共有のまま）
- Admin Gate の変更（トークンシステムは現状維持）
- UI の変更（ログインフォームのデザインは現状維持）

## リスク

| リスク                            | 対策                                                   |
| --------------------------------- | ------------------------------------------------------ |
| 全ユーザーのセッション無効化      | 破壊的変更として許容。再ログインのみ                   |
| import パス変更漏れ               | `bun run type-check` で全検出可能                      |
| 2つの auth インスタンスで DB 競合 | 同一 `basePrisma` を使用、Better Auth が内部で排他制御 |
| Cookie 名の衝突                   | prefix が異なるため不可能                              |
