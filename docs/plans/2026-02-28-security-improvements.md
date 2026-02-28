# Security Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** セキュリティ監査で検出された XSS・情報漏洩・トークン URL 露出の全問題を修正し、プロジェクト全体のセキュリティスコアを 10/10 にする。

**Architecture:**

- XSS 修正: 既存の `SanitizedHtml` コンポーネント（DOMPurify wrapper）を3箇所に適用するだけ。
- ADMIN_LOGIN_TOKEN 露出: proxy.ts に cookie gate パターンを追加。トークンを URL パラメータで受け取ったら HttpOnly cookie をセットして token-free URL にリダイレクト。LogoutButton は token prop を廃止。
- 軽微修正: `/api/admin/media` limit 上限、`/api/health` バージョン情報削除。

**Tech Stack:** Next.js 16.1.6 proxy.ts, `isomorphic-dompurify` (SanitizedHtml), `NextResponse.cookies`, Better Auth signOut

---

## Task 1: XSS修正 — EmbedSection.tsx

**Files:**

- Modify: `src/app/(public)/_components/EmbedSection.tsx`

**背景:** `config.embedCode`（管理者が設定した HTML/iframe コード）が DOMPurify を通さず直接レンダリングされている。`SanitizedHtml` コンポーネントは `ADD_TAGS: ['iframe']` 設定済みで YouTube 等の埋め込みも許可。

**Step 1: ファイルを読む**

`src/app/(public)/_components/EmbedSection.tsx` を読んで `config.embedCode` をレンダリングしている箇所を特定する。

**Step 2: SanitizedHtml をインポートして置換**

import を追加:

```typescript
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
```

`config.embedCode` を直接レンダリングしている `<div>` を `SanitizedHtml` コンポーネントに置き換える。className は既存のものをそのまま使う:

```tsx
// 変更前: <div className={...} [html直接レンダリング] />
// 変更後:
<SanitizedHtml
  html={config.embedCode}
  className={`overflow-hidden ${radiusClass} ${aspectClass}`}
/>
```

コメント「`embedCode is admin-configured content, sanitized at input time`」は削除する（SanitizedHtml が保証するため）。

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 4: コミット**

```bash
git add 'src/app/(public)/_components/EmbedSection.tsx'
git commit -m "fix(security): sanitize embedCode with DOMPurify via SanitizedHtml"
```

---

## Task 2: XSS修正 — FaqListSection.tsx

**Files:**

- Modify: `src/app/(public)/_components/FaqListSection.tsx`

**背景:** `item.answer`（FAQ の回答 HTML）が DOMPurify を通さず直接レンダリングされている。

**Step 1: ファイルを読む**

`src/app/(public)/_components/FaqListSection.tsx` を読んで `item.answer` をレンダリングしている箇所と周囲の className を確認する。

**Step 2: SanitizedHtml をインポートして置換**

import を追加:

```typescript
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
```

`item.answer` を直接レンダリングしている `<div>` を置換:

```tsx
// 変更前: <div className="mt-3 text-sm leading-relaxed text-muted-foreground" [html直接レンダリング] />
// 変更後:
<SanitizedHtml
  html={item.answer}
  className="mt-3 text-sm leading-relaxed text-muted-foreground"
/>
```

コメント「`NOTE: pre-existing dangerouslySetInnerHTML for admin-managed FAQ content`」は削除する。

**Step 3: 型チェック**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add 'src/app/(public)/_components/FaqListSection.tsx'
git commit -m "fix(security): sanitize FAQ answer HTML with DOMPurify via SanitizedHtml"
```

---

## Task 3: XSS修正 — CustomSection.tsx

**Files:**

- Modify: `src/app/(public)/_components/CustomSection.tsx`

**背景:** Lexical エディタが生成した `content` HTML が DOMPurify を通さず直接レンダリングされている。

**Step 1: ファイルを読む**

`src/app/(public)/_components/CustomSection.tsx` を読んで `content` をレンダリングしている箇所・className・style を確認する。

**Step 2: SanitizedHtml をインポートして置換**

import を追加:

```typescript
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
```

`SanitizedHtml` が `style` prop を受け付けるか `SanitizedHtml.tsx` で確認すること。

**受け付ける場合:**

```tsx
<SanitizedHtml
  html={content}
  className="prose prose-neutral max-w-none"
  style={getTextStyle(design)}
/>
```

**受け付けない場合（外側 div でラップ）:**

```tsx
<div style={getTextStyle(design)}>
  <SanitizedHtml html={content} className="prose prose-neutral max-w-none" />
</div>
```

コメント「`Lexical editor sanitized HTML output`」は削除する。

**Step 3: 型チェック**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add 'src/app/(public)/_components/CustomSection.tsx'
git commit -m "fix(security): sanitize Lexical HTML output with DOMPurify via SanitizedHtml"
```

---

## Task 4: /api/admin/media — limit パラメータ上限追加

**Files:**

- Modify: `src/app/api/admin/media/route.ts`

**背景:** `limit` クエリパラメータに上限がなく、巨大な値で全メディアを一括取得する DoS が可能。

**Step 1: ファイルを読む**

`src/app/api/admin/media/route.ts` を読んで `limit` パラメータの取得箇所を確認する。

**Step 2: 上限 100 を追加**

変更前:

```typescript
const page = parseInt(searchParams.get("page") || "1", 10);
const limit = parseInt(searchParams.get("limit") || "24", 10);
```

変更後:

```typescript
const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
const limit = Math.min(
  100,
  Math.max(1, parseInt(searchParams.get("limit") || "24", 10)),
);
```

- `Math.min(100, ...)`: 最大100件に制限
- `Math.max(1, ...)`: 0以下を防止（`page` も同様）

**Step 3: 型チェック**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/api/admin/media/route.ts
git commit -m "fix(security): cap media API limit to max 100 to prevent DoS"
```

---

## Task 5: /api/health — バージョン情報削除

**Files:**

- Modify: `src/app/api/health/route.ts`

**背景:** `version` フィールドが本番環境でも公開されており、攻撃者が既知 CVE と照合できる。`uptime` も稼働情報として不要。

**Step 1: ファイルを読む**

`src/app/api/health/route.ts` を全体読む。

**Step 2: レスポンスから `version` と `uptime` を削除**

成功レスポンスを以下に変更（`timestamp` と `responseTime` は Cloud Run 監視に有用なため維持）:

```typescript
return NextResponse.json({
  status: "healthy",
  timestamp: new Date().toISOString(),
  responseTime: `${responseTime}ms`,
  database: "connected",
});
```

`uptime` と `version` の行を削除する。
`process.uptime()` の呼び出しが残っていれば合わせて削除する。

**Step 3: 型チェック**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/api/health/route.ts
git commit -m "fix(security): remove version and uptime from health endpoint response"
```

---

## Task 6: ADMIN_LOGIN_TOKEN — Cookie Gate パターン実装

**Files:**

- Modify: `src/proxy.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/layout.tsx`
- Modify: TopBar.tsx（grep で実際のパスを確認: `grep -r "TopBar" src/app/admin --include="*.tsx" -l`）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/LogoutButton.tsx`

**背景:** `ADMIN_LOGIN_TOKEN`（静的シークレット）が URL クエリパラメータに平文で付与され、ブラウザ履歴・アクセスログに記録される。

**Cookie Gate パターンの設計:**

1. proxy.ts がトークンを URL で受け取ったとき → HttpOnly `admin-gate` cookie をセット + トークンを除いた URL にリダイレクト
2. `/admin/login` アクセス判定: `?token=` パラメータ **または** `admin-gate` cookie の存在で許可
3. セッション切れリダイレクト: `/admin/login`（トークンなし）にリダイレクト → `admin-gate` cookie があれば通過
4. LogoutButton: `token` prop を廃止。ログアウト後 `/admin/login` にリダイレクト（cookie 有効なら通過）

**Step 1: 全対象ファイルを読む**

以下を全て読む:

- `src/proxy.ts`（`/admin/login` の token 検証箇所と session 切れ redirect 箇所）
- `src/app/(admin)/admin/(dashboard)/layout.tsx`
- TopBar.tsx（実際のファイルパスを grep で確認してから読む）
- `src/app/(admin)/admin/(dashboard)/_shared/components/LogoutButton.tsx`

**Step 2: proxy.ts — `/admin/login` 検証に cookie gate を追加**

`/admin/login` の検証ロジックを以下に変更する:

```typescript
if (pathname === "/admin/login") {
  // Cookie gate: admin-gate cookie があれば許可（URL にトークン不要）
  const adminGateCookie = req.cookies.get("admin-gate");
  if (adminGateCookie?.value === "1") {
    return createResponse();
  }

  const token = searchParams.get("token");
  if (!token) return new NextResponse(null, { status: 404 });

  // トークン検証後: cookie をセットして token-free URL にリダイレクト
  const setGateCookieAndRedirect = () => {
    const cleanUrl = new URL(pathname, req.url);
    // token 以外の searchParams を維持
    searchParams.forEach((value, key) => {
      if (key !== "token") cleanUrl.searchParams.set(key, value);
    });
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set("admin-gate", "1", {
      httpOnly: true,
      secure: serverEnv.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1時間
      path: "/admin",
    });
    return response;
  };

  if (token === getAdminLoginToken()) {
    return setGateCookieAndRedirect();
  }

  // ワンタイムトークン検証（既存コード）
  const parsedToken = loginTokenSchema.safeParse(token);
  if (!parsedToken.success) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const loginToken = await prisma.loginToken.findUnique({
      where: { token: parsedToken.data },
    });
    if (loginToken && loginToken.expiresAt > new Date()) {
      return setGateCookieAndRedirect();
    }
  } catch (error: unknown) {
    logger.error("Error checking login token", {
      error: getErrorMessage(error),
    });
  }

  return new NextResponse(null, { status: 404 });
}
```

**Step 3: proxy.ts — セッション切れリダイレクトからトークンを削除**

変更前:

```typescript
if (!sessionCookie) {
  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("token", getAdminLoginToken());
  return NextResponse.redirect(loginUrl);
}
```

変更後:

```typescript
if (!sessionCookie) {
  // admin-gate cookie が有効なら /admin/login に token なしでアクセス可能
  // cookie が切れた場合はユーザーが招待 URL を再度使用する
  const loginUrl = new URL("/admin/login", req.url);
  return NextResponse.redirect(loginUrl);
}
```

**Step 4: LogoutButton.tsx — token prop を廃止**

変更前:

```typescript
interface LogoutButtonProps {
  token: string;
}

export function LogoutButton({ token }: LogoutButtonProps): ReactElement {
  const router = useRouter();
  const handleLogout = async (): Promise<void> => {
    await signOut();
    router.push(`/admin/login?token=${token}`);
  };
  // ...
}
```

変更後:

```typescript
export function LogoutButton(): ReactElement {
  const router = useRouter();
  const handleLogout = async (): Promise<void> => {
    await signOut();
    router.push("/admin/login");
    // admin-gate cookie が有効な間はトークンなしでアクセス可能
  };
  // ...
}
```

**Step 5: layout.tsx — ADMIN_LOGIN_TOKEN を TopBar に渡すのを廃止**

- `const ADMIN_LOGIN_TOKEN = serverEnv.ADMIN_LOGIN_TOKEN ?? ""` の行を削除
- `<TopBar token={ADMIN_LOGIN_TOKEN} ... />` の `token={ADMIN_LOGIN_TOKEN}` prop を削除

**Step 6: TopBar.tsx — token prop を削除**

TopBar の props 型定義から `token: string` を削除し、destructuring からも削除。`<LogoutButton token={token} />` を `<LogoutButton />` に変更。

**Step 7: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 8: コミット**

```bash
git add src/proxy.ts
git add 'src/app/(admin)/admin/(dashboard)/layout.tsx'
git add 'src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx'
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/LogoutButton.tsx'
git commit -m "fix(security): implement cookie gate to eliminate ADMIN_LOGIN_TOKEN from browser URLs"
```

---

## Task 7: ビルド検証

**Step 1: 完全検証**

```bash
bun run validate && bun run build
```

Expected: 型エラーなし、lint エラーなし、ビルド成功

---

## Task 8: docs/plans/README.md 更新

**Step 1: README を読む**

`docs/plans/README.md` の先頭を確認してスコア表を特定する。

**Step 2: スコアと完了計画を更新**

- XSS対策スコア: 6/10 → 10/10 に更新（DOMPurify 全箇所適用）
- 認証・認可: 8/10 → 9/10（Cookie gate でトークン URL 露出を排除）
- 完了計画セクションに追記:
  ```
  - ✅ [2026-02-28] セキュリティ監査全修正（XSS x3、DoS、情報漏洩、トークン URL 露出）
  ```

**Step 3: コミット**

```bash
git add docs/plans/README.md
git commit -m "docs(plans): update security scores after audit fixes"
```

---

## 完了チェックリスト

- [ ] Task 1: EmbedSection — embedCode を SanitizedHtml でサニタイズ
- [ ] Task 2: FaqListSection — item.answer を SanitizedHtml でサニタイズ
- [ ] Task 3: CustomSection — content を SanitizedHtml でサニタイズ
- [ ] Task 4: /api/admin/media — limit を最大100に制限
- [ ] Task 5: /api/health — version / uptime フィールドを削除
- [ ] Task 6: Cookie gate — proxy.ts + LogoutButton + layout.tsx + TopBar.tsx
- [ ] Task 7: bun run validate && bun run build 成功
- [ ] Task 8: docs/plans/README.md スコア更新

---

## 参考

- SanitizedHtml: `src/shared/components/SanitizedHtml.tsx`（isomorphic-dompurify, ADD_TAGS: ['iframe']）
- proxy.ts アーキテクチャ: `docs/plans/2026-02-28-csp-nonce-migration-design.md`
- セキュリティ評価: 総合 7.9/10 → 目標 10/10
