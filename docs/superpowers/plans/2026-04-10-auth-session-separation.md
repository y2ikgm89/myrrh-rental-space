# Auth セッション分離 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者と顧客の Better Auth セッションを Cookie prefix で完全分離し、同時共存を実現する

**Architecture:** 単一の `auth` インスタンスを `adminAuth`（cookiePrefix: `admin-auth`）と `customerAuth`（cookiePrefix: `customer-auth`, basePath: `/api/customer-auth`）の2つに分割。同一 DB・同一ユーザーテーブルを共有しつつ、Cookie 名前空間を分離する。

**Tech Stack:** Better Auth 1.6.1, Next.js 16, Prisma 7, TypeScript 6

**Spec:** `docs/superpowers/specs/2026-04-10-auth-session-separation-design.md`

---

## File Map

### 新規作成

| ファイル                                      | 責務                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| `src/shared/lib/customer-auth.ts`             | 顧客用 Better Auth インスタンス + セッション検証関数 |
| `src/shared/lib/customer-auth-client.ts`      | 顧客用クライアント SDK                               |
| `src/app/api/customer-auth/[...all]/route.ts` | 顧客用 API ルートハンドラ                            |

### リネーム

| 旧                              | 新                                    |
| ------------------------------- | ------------------------------------- |
| `src/shared/lib/auth.ts`        | `src/shared/lib/admin-auth.ts`        |
| `src/shared/lib/auth-client.ts` | `src/shared/lib/admin-auth-client.ts` |

### Import 更新（`@/shared/lib/auth` → `@/shared/lib/admin-auth`）

**Admin 側 (src コード):**

- `src/app/(admin)/admin/(auth)/login/page.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts`
- `src/app/(admin)/admin/(dashboard)/_components/UserInfo.tsx`
- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/admin/login-tokens/route.ts`
- `src/app/api/instagram/oauth/authorize/route.ts`
- `src/app/api/instagram/oauth/callback/route.ts`
- `src/app/(public)/forgot-password/page.tsx` (管理者パスワードリセット — admin session チェック)
- `src/app/(public)/reset-password/page.tsx` (同上)

### Import 更新（`@/shared/lib/auth` → `@/shared/lib/customer-auth`）

**Customer 側 (src コード):**

- `src/app/(public)/layout.tsx`
- `src/app/(public)/login/page.tsx`
- `src/app/(public)/login/_components/dev-login-action.ts`
- `src/app/(public)/reservation/page.tsx`
- `src/app/(public)/mypage/layout.tsx`
- `src/app/(public)/mypage/page.tsx`
- `src/app/(public)/mypage/events/page.tsx`
- `src/app/(public)/mypage/inquiries/page.tsx`
- `src/app/(public)/mypage/inquiries/[id]/page.tsx`
- `src/app/(public)/mypage/settings/page.tsx`
- `src/app/(public)/mypage/reservations/[id]/page.tsx`
- `src/app/(public)/mypage/reservations/[id]/edit/page.tsx`
- `src/app/(public)/mypage/_shared/actions/account.ts`
- `src/app/(public)/mypage/_shared/actions/profile.ts`
- `src/app/(public)/mypage/_shared/actions/reservation.ts`
- `src/app/(public)/_shared/actions/review.ts`
- `src/app/(public)/_shared/actions/event-registration.ts`
- `src/app/(public)/_shared/actions/inquiry.ts`
- `src/app/(public)/_shared/actions/reservation.ts`

### Import 更新（`@/shared/lib/auth-client` → 分離先）

**→ `@/shared/lib/admin-auth-client`:**

- `src/app/(admin)/admin/(auth)/login/LoginForm.tsx`
- `src/app/(admin)/admin/(auth)/setup/[token]/_components/SetupForm.tsx`
- `src/app/(admin)/admin/(dashboard)/_components/LogoutButton.tsx`
- `src/app/(public)/forgot-password/_components/forgot-password-form.tsx`
- `src/app/(public)/reset-password/_components/reset-password-form.tsx`

**→ `@/shared/lib/customer-auth-client`:**

- `src/app/(public)/login/_components/social-login-buttons.tsx`
- `src/app/(public)/mypage/settings/_components/account-linking.tsx`
- `src/app/(public)/_shared/components/layouts/mobile-nav.tsx`

### Proxy

- `src/proxy.ts` — `getSessionCookie` に `{ cookiePrefix: "admin-auth" }` 追加

### テスト

- `__tests__/unit/lib/auth.test.ts` — import パス更新
- `__tests__/unit/lib/permissions.test.ts` — import パス更新
- `__tests__/unit/architecture-boundaries.test.ts` — assert 文字列更新

---

## Task 1: admin-auth.ts を作成（auth.ts リネーム + cookiePrefix 追加）

**Files:**

- Rename: `src/shared/lib/auth.ts` → `src/shared/lib/admin-auth.ts`
- Modify: `src/shared/lib/admin-auth.ts`

- [ ] **Step 1: auth.ts を admin-auth.ts にリネーム**

```bash
git mv src/shared/lib/auth.ts src/shared/lib/admin-auth.ts
```

- [ ] **Step 2: admin-auth.ts を編集 — cookiePrefix 追加、ソーシャルプロバイダー/deleteUser/accountLinking 削除、export 名変更**

`src/shared/lib/admin-auth.ts` を以下のように変更:

1. `advanced` に `cookiePrefix: "admin-auth"` を追加
2. `socialProviders` ブロックを完全削除（管理者は email/password のみ）
3. `account.accountLinking` ブロックを削除
4. `user.deleteUser` を削除
5. `hooks.after` の provider 判定を `"email"` 固定に簡略化
6. `export const auth` → `export const adminAuth`
7. 型名: `Session` → `AdminSession`, `User` → `AdminUser`
8. 関数名: `verifySession` → 内部関数化（export しない）、`verifyAdminSession` はそのまま、`getCurrentUser` → `getCurrentAdminUser`、`getSession` → `getAdminSession`、`getSessionUser` → `getAdminSessionUser`
9. `verifyCustomerSession` を完全削除（customer-auth.ts に移動）
10. DEBUG ログを削除

- [ ] **Step 3: type-check（大量の型エラーが出るのは期待通り）**

```bash
bun run type-check 2>&1 | head -50
```

エラーが `Cannot find module '@/shared/lib/auth'` 系であることを確認。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(auth): rename auth.ts → admin-auth.ts with cookiePrefix separation"
```

---

## Task 2: admin-auth-client.ts を作成

**Files:**

- Rename: `src/shared/lib/auth-client.ts` → `src/shared/lib/admin-auth-client.ts`
- Modify: `src/shared/lib/admin-auth-client.ts`

- [ ] **Step 1: auth-client.ts を admin-auth-client.ts にリネーム**

```bash
git mv src/shared/lib/auth-client.ts src/shared/lib/admin-auth-client.ts
```

- [ ] **Step 2: admin-auth-client.ts を編集**

変更内容:

1. `import type { auth }` → `import type { adminAuth }` from `"./admin-auth"`
2. `inferAdditionalFields<typeof auth>()` → `inferAdditionalFields<typeof adminAuth>()`
3. `export const authClient` → `export const adminAuthClient`
4. 分割 export: `signIn`, `signOut`, `signUp`, `useSession`, `getSession` のみ（`linkSocial`, `unlinkAccount`, `deleteUser` は customer 専用なので削除）
5. `$Infer` export を削除（使われていない）

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor(auth): rename auth-client.ts → admin-auth-client.ts"
```

---

## Task 3: customer-auth.ts を作成

**Files:**

- Create: `src/shared/lib/customer-auth.ts`

- [ ] **Step 1: customer-auth.ts を作成**

`src/shared/lib/customer-auth.ts` を作成。以下の内容:

1. `import "server-only"` + 必要な import
2. `createCustomerAuth()` 関数:
   - `basePath: "/api/customer-auth"`
   - `cookiePrefix: "customer-auth"`
   - `emailAndPassword: { enabled: process.env["NODE_ENV"] !== "production" }` （dev-login 用）
   - `socialProviders:` Google/LINE（`serverEnv` から読み取り）
   - `account.accountLinking: { enabled: true, trustedProviders: ["google", "line"] }`
   - `user.deleteUser: { enabled: true }`
   - hooks: なし（監査ログは管理者のみ）
   - `plugins: [nextCookies()]`
3. `export const customerAuth = createCustomerAuth()`
4. 型: `CustomerSession`, `CustomerUser`
5. ヘルパー: `getCustomerSessionUser()`, `isValidRole()`（admin-auth.ts と同じロジック）
6. `verifyCustomerSession()` — `customerAuth.api.getSession()` → DASHBOARD_ROLES ならリダイレクト `/admin`、未認証ならリダイレクト `/login`
7. `getCurrentCustomerUser()` — リダイレクトなし版
8. `getCustomerSession()` — Server Actions 用（cache なし）

`DASHBOARD_ROLES` は `admin-auth.ts` から import（SSOT を維持）。

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/customer-auth.ts && git commit -m "feat(auth): create customer-auth.ts with separate cookie prefix"
```

---

## Task 4: customer-auth-client.ts を作成

**Files:**

- Create: `src/shared/lib/customer-auth-client.ts`

- [ ] **Step 1: customer-auth-client.ts を作成**

```typescript
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { customerAuth } from "./customer-auth";
import { getAppUrl } from "./constants";

export const customerAuthClient = createAuthClient({
  baseURL: getAppUrl(),
  basePath: "/api/customer-auth",
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

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/customer-auth-client.ts && git commit -m "feat(auth): create customer-auth-client.ts"
```

---

## Task 5: 顧客用 API ルートを作成

**Files:**

- Create: `src/app/api/customer-auth/[...all]/route.ts`
- Modify: `src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: 顧客用 API ルートを作成**

```typescript
// src/app/api/customer-auth/[...all]/route.ts
import { customerAuth } from "@/shared/lib/customer-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(customerAuth);
```

- [ ] **Step 2: 管理者用 API ルートを更新**

`src/app/api/auth/[...all]/route.ts`:

```typescript
import { adminAuth } from "@/shared/lib/admin-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(adminAuth);
```

- [ ] **Step 3: Commit**

```bash
git add 'src/app/api/customer-auth/[...all]/route.ts' 'src/app/api/auth/[...all]/route.ts' && git commit -m "feat(auth): add customer-auth API route, update admin route"
```

---

## Task 6: Proxy を更新

**Files:**

- Modify: `src/proxy.ts`

- [ ] **Step 1: proxy.ts の admin セッションチェックに cookiePrefix を追加**

`getSessionCookie(req)` → `getSessionCookie(req, { cookiePrefix: "admin-auth" })`

DEBUG ログも削除。

- [ ] **Step 2: Commit**

```bash
git add src/proxy.ts && git commit -m "fix(proxy): use admin-auth cookie prefix for admin session check"
```

---

## Task 7: Admin 側 import を一括更新

**Files:** (全て `@/shared/lib/auth` → `@/shared/lib/admin-auth` に変更)

- `src/app/(admin)/admin/(auth)/login/page.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts`
- `src/app/(admin)/admin/(dashboard)/_components/UserInfo.tsx`
- `src/app/api/admin/login-tokens/route.ts`
- `src/app/api/instagram/oauth/authorize/route.ts`
- `src/app/api/instagram/oauth/callback/route.ts`
- `src/app/(public)/forgot-password/page.tsx`
- `src/app/(public)/reset-password/page.tsx`

- [ ] **Step 1: 各ファイルの import パスを更新**

置換ルール:

- `from "@/shared/lib/auth"` → `from "@/shared/lib/admin-auth"`
- `getSession` → `getAdminSession`（action-auth.ts, login/page.tsx, login-tokens, instagram routes）
- `getSessionUser` → `getAdminSessionUser`（action-auth.ts）
- `getCurrentUser` → `getCurrentAdminUser`（必要に応じて）
- `getRoleFromSession` → `getAdminSessionUser`（login/page.tsx, login-tokens, instagram routes）
- `verifyAdminSession` — 名前はそのまま
- `type User` → `type AdminUser`
- `type Session` → `type AdminSession`
- `auth` → `adminAuth`（login/page.tsx で `getSession()` → `getAdminSession()` に変更）

login/page.tsx の特別な変更:

- `getSession()` + `getRoleFromSession()` → `getAdminSession()` + `getAdminSessionUser()` パターンに統一
- `verifyCustomerSession` の import 削除（もう admin-auth にない）

- [ ] **Step 2: Admin client import を更新**

置換ルール: `from "@/shared/lib/auth-client"` → `from "@/shared/lib/admin-auth-client"`

- `src/app/(admin)/admin/(auth)/login/LoginForm.tsx`
- `src/app/(admin)/admin/(auth)/setup/[token]/_components/SetupForm.tsx`
- `src/app/(admin)/admin/(dashboard)/_components/LogoutButton.tsx`
- `src/app/(public)/forgot-password/_components/forgot-password-form.tsx`
- `src/app/(public)/reset-password/_components/reset-password-form.tsx`

`authClient` → `adminAuthClient` に変更（forgot-password, reset-password で `authClient.$fetch` / `authClient.resetPassword` を使用している場合）。

- [ ] **Step 3: type-check で admin 側のエラーが解消されたか確認**

```bash
bun run type-check 2>&1 | grep -c "error TS"
```

残りのエラーは customer 側のみであること。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(auth): update all admin imports to admin-auth"
```

---

## Task 8: Customer 側 import を一括更新

**Files:** (全て `@/shared/lib/auth` → `@/shared/lib/customer-auth` に変更)

### Server 側

- `src/app/(public)/layout.tsx` — `getCurrentUser` → `getCurrentCustomerUser`
- `src/app/(public)/login/page.tsx` — `getCurrentUser` → `getCurrentCustomerUser`
- `src/app/(public)/login/_components/dev-login-action.ts` — `auth` → `customerAuth`
- `src/app/(public)/reservation/page.tsx` — `getCurrentUser` → `getCurrentCustomerUser`
- `src/app/(public)/mypage/layout.tsx` — `verifyCustomerSession` from `customer-auth`
- `src/app/(public)/mypage/page.tsx` — `verifyCustomerSession` from `customer-auth`
- `src/app/(public)/mypage/events/page.tsx` — 同上
- `src/app/(public)/mypage/inquiries/page.tsx` — 同上
- `src/app/(public)/mypage/inquiries/[id]/page.tsx` — 同上
- `src/app/(public)/mypage/settings/page.tsx` — 同上
- `src/app/(public)/mypage/reservations/[id]/page.tsx` — 同上
- `src/app/(public)/mypage/reservations/[id]/edit/page.tsx` — 同上
- `src/app/(public)/mypage/_shared/actions/account.ts` — `getSession` → `getCustomerSession`, `auth` → `customerAuth`
- `src/app/(public)/mypage/_shared/actions/profile.ts` — `getSession` → `getCustomerSession`
- `src/app/(public)/mypage/_shared/actions/reservation.ts` — `getSession` → `getCustomerSession`
- `src/app/(public)/_shared/actions/review.ts` — `getSession` → `getCustomerSession`
- `src/app/(public)/_shared/actions/event-registration.ts` — `getSession` → `getCustomerSession`
- `src/app/(public)/_shared/actions/inquiry.ts` — `getSession` → `getCustomerSession`
- `src/app/(public)/_shared/actions/reservation.ts` — `getCurrentUser` → `getCurrentCustomerUser`

### Client 側

- `src/app/(public)/login/_components/social-login-buttons.tsx` — `signIn` from `customer-auth-client`
- `src/app/(public)/mypage/settings/_components/account-linking.tsx` — `linkSocial`, `unlinkAccount` from `customer-auth-client`
- `src/app/(public)/_shared/components/layouts/mobile-nav.tsx` — `useSession` from `customer-auth-client`

- [ ] **Step 1: 全 customer 側ファイルの import を更新**

各ファイルで:

1. `from "@/shared/lib/auth"` → `from "@/shared/lib/customer-auth"`
2. `from "@/shared/lib/auth-client"` → `from "@/shared/lib/customer-auth-client"`
3. 関数名を対応する customer 版に変更

- [ ] **Step 2: type-check で全エラー解消を確認**

```bash
bun run type-check
```

エラー 0 であること。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor(auth): update all customer imports to customer-auth"
```

---

## Task 9: テストを更新

**Files:**

- `__tests__/unit/lib/auth.test.ts`
- `__tests__/unit/lib/permissions.test.ts`
- `__tests__/unit/architecture-boundaries.test.ts`

- [ ] **Step 1: auth.test.ts の import パスを更新**

`from "@/shared/lib/auth"` → `from "@/shared/lib/admin-auth"`
関数名も対応するものに更新。mock パスも `@/shared/lib/admin-auth` に。

- [ ] **Step 2: permissions.test.ts の import パスを更新**

`import { DASHBOARD_ROLES } from "@/shared/lib/auth"` → `from "@/shared/lib/admin-auth"`

- [ ] **Step 3: architecture-boundaries.test.ts の assert 文字列を更新**

`'import { auth } from "@/shared/lib/auth"'` → `'import { adminAuth } from "@/shared/lib/admin-auth"'`

- [ ] **Step 4: テスト実行**

```bash
bun run test:unit
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(auth): update test imports for auth separation"
```

---

## Task 10: validate + build

- [ ] **Step 1: validate**

```bash
bun run validate
```

- [ ] **Step 2: build**

```bash
bun run build
```

エラーがあれば修正。

- [ ] **Step 3: Commit (修正があれば)**

```bash
git add -A && git commit -m "fix(auth): resolve build errors from auth separation"
```

---

## Task 11: ルールファイル・CLAUDE.md 更新

**Files:**

- `.claude/rules/auth-patterns.md`
- `.claude/rules/gotchas.md`
- `CLAUDE.md`

- [ ] **Step 1: auth-patterns.md を更新**

主な変更:

- `auth` → `adminAuth` / `customerAuth` に全置換
- `@/shared/lib/auth` → `@/shared/lib/admin-auth` / `@/shared/lib/customer-auth`
- `auth-client` → `admin-auth-client` / `customer-auth-client`
- セッション取得パターン表を2系統に分離
- ファイル配置テーブルを更新

- [ ] **Step 2: gotchas.md の auth 関連エントリを更新**

`verifyAdminSession` の参照パスを更新。Admin Gate 節のモジュール参照を `admin-auth` に。

- [ ] **Step 3: CLAUDE.md の SSOT テーブルを更新**

`auth` → `adminAuth` / `customerAuth` に分離:

| 定数/変数      | 場所                         | 用途                                                |
| -------------- | ---------------------------- | --------------------------------------------------- |
| `adminAuth`    | `@/shared/lib/admin-auth`    | 管理者用 Better Auth インスタンス（email/password） |
| `customerAuth` | `@/shared/lib/customer-auth` | 顧客用 Better Auth インスタンス（Google/LINE）      |

- [ ] **Step 4: docs/reference/codex-rules/ の auth-patterns.md も同期**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: update auth rules and CLAUDE.md for session separation"
```

---

## Task 12: デバッグログの削除

**Files:**

- `src/shared/lib/admin-auth.ts` — Task 1 で既に削除済みのはず。残っていれば削除
- `src/app/(admin)/admin/(auth)/login/page.tsx` — DEBUG ログ削除

- [ ] **Step 1: 残存する DEBUG ログを grep で確認・削除**

```bash
grep -rn "DEBUG" src/shared/lib/admin-auth.ts src/app/\(admin\)/admin/\(auth\)/login/page.tsx src/proxy.ts
```

残っていれば削除。

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "chore: remove debug logs from auth separation investigation"
```

---

## 完了基準

1. `bun run validate` — エラー 0
2. `bun run build` — 成功
3. `bun run test:unit` — 全パス
4. 管理画面にログイン → ブラウザ閉じる → 再開 → 管理画面にアクセスできる
5. 公開サイトでソーシャルログイン → 管理画面のセッションが維持される
6. 管理画面ログアウト → 公開サイトのセッションが維持される
