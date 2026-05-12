---
description: 公開顧客のソーシャルログイン（Google/LINE）+ ensureCustomerLinked + OAuth at-rest encryption + signIn.email/social + signOut
paths:
  - src/shared/lib/customer-auth.ts
  - src/shared/lib/customer-auth-client.ts
  - src/shared/domain/customers/**
  - src/app/(public)/**
  - src/app/(public)/login/**
  - src/app/(public)/mypage/**
  - src/app/api/customer-auth/**
  - src/**/actions/public/**
---

# 公開顧客認証（ソーシャルログイン）

> Google / LINE OAuth + ensureCustomerLinked + AES-256-GCM at-rest encryption + Better Auth Client API パターン。

## verifyCustomerSession（マイページ用）

未認証→`/login`、管理者ロール→`/admin` にリダイレクト。`verifyAdminSession`（→`/`）とは分離:

```typescript
import { verifyCustomerSession } from "@/shared/lib/customer-auth";

export default async function MypageLayout({ children }) {
  const { user } = await verifyCustomerSession();
  const customer = await ensureCustomerLinked(user);
  // ...
}
```

## OAuth token の at-rest encryption（Better Auth 互換）

Better Auth が `Account.{accessToken,refreshToken}` を OAuth callback で **plaintext 直書き**する制約下で、本ルールの「`basePrisma` を Better Auth に渡す」「`databaseHooks` 不使用」規律と互換な at-rest encryption は **application 層境界の transparent encryption** で実装する（`$extends` query middleware は不使用 — Better Auth に拡張前クライアントを渡す原則を維持）:

- **read** (`getGoogleOAuthAccount` 等): `isEncrypted(value)` で encrypted/legacy plaintext を判定、encrypted は `safeDecrypt`、plaintext は ① そのまま return ② `fireAndForget(reEncryptLegacyOAuthToken(...))` で background 再暗号化を予約
- **write** (`updateGoogleOAuthAccountTokens`): `encryptOAuthToken(plaintext)` で必ず encrypt してから DB 書き込み
- **migration script 不要** — Better Auth callback 直書きの token は最初の application 層 read で encrypt 化、以降は OAuth refresh / token rotate のたびに encrypted state へ自然収束（実装: 2026-05-07、purpose=`"oauth-google"`、AES-256-GCM + HKDF）
- `reEncryptLegacyOAuthToken` は再読み込み + `isEncrypted` + 値一致の 3 段チェックで競合書き込みを no-op fallback
- 新規 OAuth provider 追加時はこの pattern を踏襲（`encryptOAuthToken` の purpose を `"oauth-<provider>"` に分けて HKDF 派生鍵を分離）

## ensureCustomerLinked（User ↔ Customer 遅延紐づけ）

`databaseHooks.user.create.after` は FK 制約違反を起こすため使用禁止（[GitHub Issue #7260](https://github.com/better-auth/better-auth/issues/7260)）。マイページ layout で `ensureCustomerLinked(user)` を呼び、アプリケーション層で紐づけ:

- 検索順: `userId` → `email` → 新規作成（P2002 競合対策付き）
- `Customer.userId String? @unique @db.Uuid` — 一意制約で重複防止
- ソーシャルログイン初回は `lastName: user.name || "未設定"` で仮登録

## accountLinking

`trustedProviders: ["google", "line"]` で同一メールの自動統合。管理者メールで顧客がログインした場合、ADMIN User に統合され `/admin` にリダイレクト（`ensureCustomerLinked` は CUSTOMER ロール以外では呼ばれない）。

## マイページ Server Actions の認証パターン

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

## 公開ページ Settings クエリの分離

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

## signIn.social のエラーハンドリング（公式推奨パターン）

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

## signOut（マイページ / 公開ヘッダー用）

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

## signIn（公開サインイン用）

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

## ソーシャルプロバイダーロゴ

- **Google/LINE ソーシャルログインボタンはブランド SVG ロゴ必須** — テキストのみのボタンは UX 品質不足。Google は公式 4 色「G」ロゴ + 白背景、LINE は `#06C755` 背景 + 白アイコン
- **共有コンポーネント**: `@/public/components/ui/social-provider-logos.tsx` の `GoogleLogo` / `LineLogo` / `PROVIDER_LOGOS` をエクスポート。ログインページ・アカウント連携の両方で使用、ローカル定義禁止

## マイページ開発確認（dev login）

- `/login` ページに `NODE_ENV !== "production"` でのみ表示される「テスト顧客でログイン」ボタンあり（`dev-login-action.ts`）。Better Auth の `signUpEmail` / `signInEmail` で `dev-customer@example.com` セッションを作成し、`ensureCustomerLinked` が Customer を自動生成
- **管理画面側も対称化済（2026-05-12）** — `/admin/login` に `process.env["NODE_ENV"] !== "production"` でのみ表示される「SUPER_ADMIN でログイン」ボタン（`(admin)/admin/(auth)/login/{DevLoginButton.tsx,dev-login-credentials.ts}`）。seed `superadmin@example.com` / `superadmin123` 前提（user 自動作成なし — `signUpEmail` は admin-auth で role: CUSTOMER デフォルトのため不採用）。`proxy.ts` の Admin Gate dev bypass（`handleAdminLoginGate` 冒頭 `serverEnv.NODE_ENV === "development"` short-circuit）と組み合わせ、`localhost:3000/admin/login` 直アクセス → 1 クリック login が成立。staging / production には `=== "development"` 厳密判定で確実に伝播しない
