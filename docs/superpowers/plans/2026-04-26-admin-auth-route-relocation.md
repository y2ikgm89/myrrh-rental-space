# Admin Auth Route Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/forgot-password` と `/reset-password` を `(public)/` route group から `(admin)/admin/(auth)/` route group に移動し、URL を `/admin/forgot-password` / `/admin/reset-password` に変更して管理者専用 auth ページとして完全に分離する。

**Architecture:** Multiple Root Layouts の境界に合わせて auth ページを admin 配下に再配置。既存実装はすでに `getCurrentAdminUser()` リダイレクトと `adminAuthClient.$fetch` を使う管理者専用フォームのため、フォームロジックは丸ごと移植可能。`proxy.ts` の admin gate に新ルートをセッション不要として明示し、Better Auth の `redirectTo` body field を `/admin/reset-password` に変更してメール内リンクの遷移先を更新する。`(public)/forgot-password` / `(public)/reset-password` は移動後に完全削除し、`robots.txt` の個別 `Disallow` 行は `/admin/` カバー範囲に統合。

**Tech Stack:** Next.js 16.2 (App Router / Multiple Root Layouts) / Better Auth 1.6 (admin instance + `request-password-reset` / `reset-password` endpoints) / Cloudflare Turnstile (DB-managed secret) / React 19.2 / TypeScript 6.0 / Tailwind 4 (Swiss Industrial Admin theme)

---

## File Structure

**Create:**

- `src/app/(admin)/admin/(auth)/forgot-password/page.tsx` — Server Component（メタデータ、認証済みリダイレクト、Turnstile site key 取得、Swiss Industrial Admin デザインのレイアウト）
- `src/app/(admin)/admin/(auth)/forgot-password/_components/forgot-password-form.tsx` — Client Component（メール入力 + Turnstile + `adminAuthClient.$fetch("/request-password-reset", { ..., redirectTo: "/admin/reset-password" })`）
- `src/app/(admin)/admin/(auth)/reset-password/page.tsx` — Server Component（token 検証、無効リンク fallback、Swiss Industrial Admin レイアウト）
- `src/app/(admin)/admin/(auth)/reset-password/_components/reset-password-form.tsx` — Client Component（パスワード入力 + Turnstile + `adminAuthClient.resetPassword`）

**Modify:**

- `src/proxy.ts` — `/admin/login` / `/admin/login/consume` / `/admin/setup/` のセッション不要分岐に `/admin/forgot-password` と `/admin/reset-password` を追加
- `src/app/(admin)/admin/(auth)/login/LoginForm.tsx` — `<Link href="/admin/forgot-password">パスワードを忘れた方</Link>` を「メールアドレスを保存する」チェックボックスの右側に追加
- `src/shared/domain/settings/robots-txt.ts` — `Disallow: /forgot-password/` と `Disallow: /reset-password/` を削除（`Disallow: /admin/` で既にカバー）

**Delete:**

- `src/app/(public)/forgot-password/` ディレクトリ全体（`page.tsx` + `_components/forgot-password-form.tsx`）
- `src/app/(public)/reset-password/` ディレクトリ全体（`page.tsx` + `_components/reset-password-form.tsx`）

**Untouched but verified:**

- `src/shared/lib/admin-auth.ts` — `TURNSTILE_PROTECTED_ENDPOINTS` のキー（`/request-password-reset` / `/reset-password`）は **Better Auth API endpoint パス**であり public URL ではない。変更不要
- `src/shared/lib/email/password-reset-emails.ts` — `resetUrl` は Better Auth が `body.redirectTo` から組み立てるため、フォーム側の修正のみで自動的に `/admin/reset-password?token=...` になる
- `src/app/(admin)/_styles/admin.css` — Swiss Industrial Admin テーマがそのまま継承される

---

## Pre-flight Verification

- [ ] **Step 0.1: Verify clean working tree on main**

Run: `git status --short && git log --oneline -5`
Expected: 作業ツリー clean、最新 commit が `05662572` (a11y/mypage-nav announce current page)

- [ ] **Step 0.2: Verify dev DB schema is current**

Run: `ls prisma/migrations/ | tail -1`
Expected: 既知の最新 migration ディレクトリ。スキーマ変更を含む plan ではないため migration は発生しない（schema 操作なし）

- [ ] **Step 0.3: Verify dev server is not running from another worktree**

Run: `netstat -ano | grep :3000 || echo "no dev server"`
Expected: いずれの結果でも OK（dev server 起動はこの plan には不要）

---

## Task 1: proxy.ts に admin auth ルート例外を追加

`/admin/forgot-password` と `/admin/reset-password` は **未認証ユーザーがアクセスできる必要がある**（パスワードを忘れた人はログインできない）。現状の `proxy.ts` は `/admin/login` / `/admin/login/consume` / `/admin/setup/` のみセッション不要として扱い、それ以外の `/admin/*` はセッション cookie がなければ `/admin/login` にリダイレクトする。新ルートも例外に追加する。

**Files:**

- Modify: `src/proxy.ts:204-225`

- [ ] **Step 1.1: Read the current admin gate logic**

Read: `src/proxy.ts` lines 204-226

確認内容: `pathname === "/admin/login"` / `pathname === "/admin/login/consume"` / `pathname.startsWith("/admin/setup/")` の3つの早期 return 分岐があり、その後セッション cookie 検証が走る。

- [ ] **Step 1.2: Add forgot-password / reset-password to the auth-public list**

Edit `src/proxy.ts` — 既存ブロック:

```typescript
// セットアップページは認証不要
if (pathname.startsWith("/admin/setup/")) {
  return createResponse(req, pathname);
}
```

を以下に置き換える:

```typescript
// セットアップページは認証不要
if (pathname.startsWith("/admin/setup/")) {
  return createResponse(req, pathname);
}

// パスワードリセット系ページは認証不要（ログインできないユーザーがアクセスする）
// Turnstile + Better Auth の TURNSTILE_PROTECTED_ENDPOINTS で別途レート制限・bot 対策済み
if (
  pathname === "/admin/forgot-password" ||
  pathname === "/admin/reset-password"
) {
  return createResponse(req, pathname);
}
```

- [ ] **Step 1.3: Verify type-check still passes**

Run: `bun run type-check`
Expected: EXIT=0、エラーなし

- [ ] **Step 1.4: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(admin/auth): allow unauthenticated access to forgot-password and reset-password routes"
```

---

## Task 2: `/admin/forgot-password` ページを新設

既存の `(public)/forgot-password/page.tsx` のロジックを admin 配下に移植する。Swiss Industrial Admin テーマに合わせるため、`Container` / `PageHero`（公開ページ Design System）ではなく既存 admin login と同じ shell（minimal な center layout）を採用する。

**Files:**

- Create: `src/app/(admin)/admin/(auth)/forgot-password/page.tsx`
- Create: `src/app/(admin)/admin/(auth)/forgot-password/_components/forgot-password-form.tsx`

- [ ] **Step 2.1: Create the directory**

Run: `python3 -c "import os; os.makedirs('src/app/(admin)/admin/(auth)/forgot-password/_components', exist_ok=True)"`

- [ ] **Step 2.2: Write the page component**

Create `src/app/(admin)/admin/(auth)/forgot-password/page.tsx`:

```typescript
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = {
  title: "パスワードをお忘れの方 | 管理画面",
  robots: { index: false, follow: false },
};

export default async function AdminForgotPasswordPage(): Promise<ReactElement> {
  const user = await getCurrentAdminUser();
  if (user) redirect("/admin");

  const turnstileSiteKey = await getTurnstileSiteKey();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            パスワードをお忘れの方
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ご登録のメールアドレスを入力してください。
            <br />
            パスワードリセットのリンクをお送りします。
          </p>
        </div>

        <div className="rounded-md border bg-card p-6 shadow-sm sm:p-8">
          <ForgotPasswordForm turnstileSiteKey={turnstileSiteKey} />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/admin/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            ログインページに戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.3: Write the client form component**

Create `src/app/(admin)/admin/(auth)/forgot-password/_components/forgot-password-form.tsx`:

```typescript
"use client";

import { useRef, useState, useTransition } from "react";
import { adminAuthClient } from "@/shared/lib/admin-auth-client";
import { SubmitButton } from "@/admin/components/ui";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

type Props = {
  readonly turnstileSiteKey: string | null;
};

export function ForgotPasswordForm({ turnstileSiteKey }: Props) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);

    if (turnstileSiteKey && !turnstileToken) {
      setError("セキュリティ検証を完了してください。");
      return;
    }

    startTransition(async () => {
      const { error: fetchError } = await adminAuthClient.$fetch(
        "/request-password-reset",
        {
          method: "POST",
          body: { email, redirectTo: "/admin/reset-password" },
          ...(turnstileToken && {
            headers: { "x-captcha-response": turnstileToken },
          }),
        },
      );

      if (fetchError) {
        setError(fetchError.message ?? "エラーが発生しました");
        turnstileRef.current?.reset();
        setTurnstileToken("");
      } else {
        setSubmitted(true);
      }
    });
  };

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-base font-medium text-foreground">
          メールを送信しました
        </p>
        <p className="text-sm text-muted-foreground">
          入力されたメールアドレスにパスワードリセットのリンクをお送りしました。
        </p>
        <p className="text-xs text-muted-foreground">
          メールが届かない場合は、迷惑メールフォルダをご確認いただくか、
          再度お試しください。
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setEmail("");
            setTurnstileToken("");
            turnstileRef.current?.reset();
          }}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          別のメールアドレスで試す
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={isPending}
          placeholder="admin@example.com"
          className="h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1"
        />
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.admin_password_reset_request}
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
        onError={() => setTurnstileToken("")}
      />

      <SubmitButton
        isPending={isPending}
        label="リセットリンクを送信"
        pendingLabel="送信中..."
        className="w-full"
        size="lg"
      />
    </form>
  );
}
```

- [ ] **Step 2.4: Verify type-check**

Run: `bun run type-check`
Expected: EXIT=0

- [ ] **Step 2.5: Verify lint**

Run: `bun run lint`
Expected: EXIT=0

- [ ] **Step 2.6: Commit**

```bash
git add "src/app/(admin)/admin/(auth)/forgot-password/"
git commit -m "feat(admin/auth): add /admin/forgot-password page with Swiss Industrial theme"
```

---

## Task 3: `/admin/reset-password` ページを新設

既存の `(public)/reset-password/` を admin 配下に移植する。token 検証 / 無効リンク fallback / `adminAuthClient.resetPassword()` のロジックは流用、レイアウトは Swiss Industrial Admin テーマに合わせる。

**Files:**

- Create: `src/app/(admin)/admin/(auth)/reset-password/page.tsx`
- Create: `src/app/(admin)/admin/(auth)/reset-password/_components/reset-password-form.tsx`

- [ ] **Step 3.1: Create the directory**

Run: `python3 -c "import os; os.makedirs('src/app/(admin)/admin/(auth)/reset-password/_components', exist_ok=True)"`

- [ ] **Step 3.2: Write the page component**

Create `src/app/(admin)/admin/(auth)/reset-password/page.tsx`:

```typescript
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { getCurrentAdminUser } from "@/shared/lib/admin-auth";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const metadata: Metadata = {
  title: "パスワードリセット | 管理画面",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminResetPasswordPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  const user = await getCurrentAdminUser();
  if (user) redirect("/admin");

  const params = await searchParams;
  const token = typeof params["token"] === "string" ? params["token"] : null;

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              無効なリンク
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              パスワードリセットのリンクが無効です。
              <br />
              有効期限が切れている可能性があります。
            </p>
          </div>
          <p className="text-center text-sm">
            <Link
              href="/admin/forgot-password"
              className="text-primary underline-offset-4 hover:underline"
            >
              パスワードリセットを再リクエスト
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const turnstileSiteKey = await getTurnstileSiteKey();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            新しいパスワードを設定
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            新しいパスワードを入力してください。
          </p>
        </div>

        <div className="rounded-md border bg-card p-6 shadow-sm sm:p-8">
          <ResetPasswordForm
            token={token}
            turnstileSiteKey={turnstileSiteKey}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/admin/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            ログインページに戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.3: Write the client form component**

Create `src/app/(admin)/admin/(auth)/reset-password/_components/reset-password-form.tsx`:

```typescript
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAuthClient } from "@/shared/lib/admin-auth-client";
import { SubmitButton } from "@/admin/components/ui";
import {
  TurnstileWidget,
  type TurnstileInstance,
} from "@/public/components/ui/turnstile-widget";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

type Props = {
  readonly token: string;
  readonly turnstileSiteKey: string | null;
};

export function ResetPasswordForm({ token, turnstileSiteKey }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);
    setFieldError(undefined);

    if (password !== confirmPassword) {
      setFieldError("パスワードが一致しません");
      return;
    }

    if (password.length < 8) {
      setFieldError("パスワードは8文字以上で入力してください");
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setError("セキュリティ検証を完了してください。");
      return;
    }

    startTransition(async () => {
      const result = await adminAuthClient.resetPassword({
        newPassword: password,
        token,
        ...(turnstileToken && {
          fetchOptions: {
            headers: { "x-captcha-response": turnstileToken },
          },
        }),
      });

      if (result.error) {
        setError(result.error.message ?? "パスワードのリセットに失敗しました");
        turnstileRef.current?.reset();
        setTurnstileToken("");
      } else {
        setSuccess(true);
      }
    });
  };

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-base font-medium text-foreground">
          パスワードを変更しました
        </p>
        <p className="text-sm text-muted-foreground">
          新しいパスワードでログインしてください。
        </p>
        <button
          type="button"
          onClick={() => router.push("/admin/login")}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          ログインページへ
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="new-password"
          className="block text-sm font-medium text-foreground"
        >
          新しいパスワード
        </label>
        <input
          id="new-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          disabled={isPending}
          placeholder="8文字以上"
          className="h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirm-password"
          className="block text-sm font-medium text-foreground"
        >
          パスワード（確認）
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          disabled={isPending}
          placeholder="もう一度入力してください"
          aria-invalid={fieldError ? "true" : undefined}
          aria-describedby={fieldError ? "confirm-password-error" : undefined}
          className="h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-1"
        />
        {fieldError ? (
          <p
            id="confirm-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {fieldError}
          </p>
        ) : null}
      </div>

      <TurnstileWidget
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action={TURNSTILE_ACTIONS.admin_password_reset}
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
        onError={() => setTurnstileToken("")}
      />

      <SubmitButton
        isPending={isPending}
        label="パスワードを変更"
        pendingLabel="変更中..."
        className="w-full"
        size="lg"
      />
    </form>
  );
}
```

- [ ] **Step 3.4: Verify type-check**

Run: `bun run type-check`
Expected: EXIT=0

- [ ] **Step 3.5: Verify lint**

Run: `bun run lint`
Expected: EXIT=0

- [ ] **Step 3.6: Commit**

```bash
git add "src/app/(admin)/admin/(auth)/reset-password/"
git commit -m "feat(admin/auth): add /admin/reset-password page with Swiss Industrial theme"
```

---

## Task 4: 旧 public 配下を削除

新パスが正しく動作することを Task 2-3 で検証済みのため、旧 public 配下を完全削除する。後方互換 redirect は不要（外部からこれらの URL を直接ブックマーク・bookmarked emailing しているケースは通常存在しない。万一既存メール内リンクがある場合でも、Better Auth トークンの寿命は短く、再リクエストで新 URL に切り替えできる）。

**Files:**

- Delete: `src/app/(public)/forgot-password/` (全体)
- Delete: `src/app/(public)/reset-password/` (全体)

- [ ] **Step 4.1: Verify no other references to old paths**

Run: `bun run lint --quiet 2>&1 | head -5; grep -rn "(public)/forgot-password\|(public)/reset-password" src/ --include="*.ts" --include="*.tsx" || echo "no references"`
Expected: `no references`

- [ ] **Step 4.2: Remove old public route directories**

Run:

```bash
git rm -r "src/app/(public)/forgot-password"
git rm -r "src/app/(public)/reset-password"
```

- [ ] **Step 4.3: Verify type-check (no broken imports)**

Run: `bun run type-check`
Expected: EXIT=0

- [ ] **Step 4.4: Commit**

```bash
git commit -m "refactor(public/auth): remove deprecated forgot-password and reset-password public routes"
```

---

## Task 5: 既存リンクとロボット規定の更新

`/admin/login` ページに「パスワードを忘れた方」へのリンクを追加し、`robots.txt` の個別 `Disallow` 行を `/admin/` 統合カバーに置き換える。

**Files:**

- Modify: `src/app/(admin)/admin/(auth)/login/LoginForm.tsx`
- Modify: `src/shared/domain/settings/robots-txt.ts`

- [ ] **Step 5.1: Read current LoginForm structure**

Read: `src/app/(admin)/admin/(auth)/login/LoginForm.tsx` lines 185-210

確認内容: `<input id="remember-me">` の checkbox group があり、その下に `SubmitButton` が配置されている。

- [ ] **Step 5.2: Add forgot-password link to LoginForm**

Edit `src/app/(admin)/admin/(auth)/login/LoginForm.tsx` — まず先頭の import に `Link` を追加:

```typescript
import { useRouter } from "next/navigation";
```

の直後（Better Auth import の前）に追加:

```typescript
import Link from "next/link";
```

次に、checkbox group の閉じ `</div>` の直後（`<SubmitButton ... />` の直前）の構造を以下に置き換える:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center">
    <input
      id="remember-me"
      type="checkbox"
      checked={rememberMe}
      onChange={(e) => setRememberMe(e.target.checked)}
      className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50 cursor-pointer transition-colors duration-200"
    />
    <label
      htmlFor="remember-me"
      className="ml-2 block text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors duration-200"
    >
      メールアドレスを保存する
    </label>
  </div>

  <Link
    href="/admin/forgot-password"
    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
  >
    パスワードを忘れた方
  </Link>
</div>
```

つまり、既存の `<div className="flex items-center">...</div>`（checkbox + label）を `<div className="flex items-center justify-between">` でラップし、内部の checkbox group は `<div className="flex items-center">` を維持、その兄弟として `<Link>` を追加する。

- [ ] **Step 5.3: Update robots.txt default**

Edit `src/shared/domain/settings/robots-txt.ts` — 以下の2行を削除:

```typescript
Disallow: /forgot-password/;
Disallow: /reset-password/;
```

`Disallow: /admin/` がすでに存在するため、新パス `/admin/forgot-password` / `/admin/reset-password` はカバー済み。

- [ ] **Step 5.4: Verify type-check**

Run: `bun run type-check`
Expected: EXIT=0

- [ ] **Step 5.5: Verify lint**

Run: `bun run lint`
Expected: EXIT=0

- [ ] **Step 5.6: Commit**

```bash
git add src/app/\(admin\)/admin/\(auth\)/login/LoginForm.tsx src/shared/domain/settings/robots-txt.ts
git commit -m "feat(admin/login): link to forgot-password from login form and consolidate robots.txt admin paths"
```

---

## Task 6: 最終検証とドキュメント整合

`gotchas.md` の「noindex 対象ページ」テーブルと CLAUDE.md / rules で `forgot-password` / `reset-password` の URL を参照している箇所を更新する。

**Files:**

- Modify: `.claude/rules/gotchas.md` （noindex 対象ページテーブル）
- Modify: `.claude/rules/frontend/seo-patterns.md` （noindex 対象ページテーブル — 同一内容のため）

- [ ] **Step 6.1: Search for stale references in rule docs**

Run: `grep -rn "forgot-password\|reset-password" .claude/ docs/`
Expected: noindex テーブル / seo-patterns / project plan ファイル等にヒット。各ヒットを確認。

- [ ] **Step 6.2: Update gotchas.md noindex table**

Edit `.claude/rules/gotchas.md` の「noindex 対象ページ」テーブル:

```
| パスワードリセット | `forgot-password/page.tsx`, `reset-password/page.tsx`           | static metadata                     |
```

を以下に置き換える:

```
| 管理者パスワードリセット | `(admin)/admin/(auth)/forgot-password/page.tsx`, `(admin)/admin/(auth)/reset-password/page.tsx` | static metadata                     |
```

- [ ] **Step 6.3: Update seo-patterns.md noindex table**

Edit `.claude/rules/frontend/seo-patterns.md` の同等のテーブルを同じ要領で更新:

```
| パスワードリセット | `forgot-password/page.tsx`, `reset-password/page.tsx`           | static metadata                     |
```

を以下に置き換える:

```
| 管理者パスワードリセット | `(admin)/admin/(auth)/forgot-password/page.tsx`, `(admin)/admin/(auth)/reset-password/page.tsx` | static metadata                     |
```

- [ ] **Step 6.4: Run full validation**

Run: `bun run validate`
Expected: EXIT=0

- [ ] **Step 6.5: Run build (skip-env if needed)**

Run: `bun run build:skip-env 2>&1 | tail -40`
Expected: ビルド成功、`/admin/forgot-password` / `/admin/reset-password` がルート一覧に表示される。`/forgot-password` / `/reset-password` は表示されない。

- [ ] **Step 6.6: Commit docs sync**

```bash
git add .claude/rules/gotchas.md .claude/rules/frontend/seo-patterns.md
git commit -m "docs(rules): update noindex tables for admin auth route relocation"
```

---

## Self-Review Checklist

Plan 完成後、以下をチェック:

1. **Spec coverage:**
   - URL を `/admin/forgot-password` / `/admin/reset-password` に移動 → Task 2 / 3 ✓
   - Better Auth `redirectTo` 更新でメール内リンク整合 → Task 2.3 (`redirectTo: "/admin/reset-password"`) ✓
   - 旧 public 配下削除 → Task 4 ✓
   - admin login link 整合 → Task 5（forgot-password へのリンク追加） + Task 2/3（reset-password 内の `/admin/login` リンク） ✓
   - proxy.ts auth 例外 → Task 1 ✓
   - robots.txt 整合 → Task 5 ✓
   - rules docs 整合 → Task 6 ✓

2. **Placeholder scan:** TODO / TBD / "implement later" / "fill in" / "Add appropriate" などのヘッジ表現なし ✓

3. **Type consistency:** `ForgotPasswordForm` / `ResetPasswordForm` / `Props` 型は task 2 / 3 を通じて一貫 ✓

4. **CLAUDE.md ハードルール準拠:**
   - `as` 型アサーションなし ✓
   - `useCallback` / `useMemo` / `memo` なし ✓
   - ハードコードカラーなし（`text-primary` / `bg-card` / `border-input` 等のセマンティックトークン） ✓
   - `cn()` 使用は不要（テンプレートリテラル / 文字列内改行なし） ✓

5. **`exactOptionalPropertyTypes` 配慮:**
   - `error?: string` への代入は `setError(undefined)` か文字列のみで条件三項なし ✓
   - 条件スプレッド `...(turnstileToken && { headers: ... })` 使用 ✓

---

## Execution Notes

- このプランは `main` ブランチで順次実行可能（worktree 不要）。各 Task が 1 commit に対応する。
- スキーマ変更なし → Prisma migration 不要。
- Turnstile セット済み環境（`Settings.turnstileSecretKey`）でフォーム送信を実機検証することを推奨（dev 環境では Turnstile スキップ動作）。
- `ScheduleWakeup` 等のバックグラウンド実行は不要。
