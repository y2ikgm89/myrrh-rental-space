---
description: Gotchas — Admin Gate / Multiple Root Layouts / ナビゲーション / Better Auth クライアント
paths:
  - src/**
  - prisma/**
---

# Gotchas — 認証 / ルーティング

## Admin Gate

- **`admin-login-gate.ts` に `server-only` / `serverEnv` 依存禁止** — seed.ts・CLI スクリプト（`scripts/generate-login-url.ts`）から import するため。`process.env` を直接参照する
- **Admin Gate トークン生成の鶏と卵** — 管理画面APIでトークン生成するには既にログインが必要。初回は `bun prisma/seed.ts --admin`（自動URL出力）または `bun scripts/generate-login-url.ts` で生成
- **proxy.ts の `/admin/login` ガードを削除しない** — Admin Gate が無効化されると管理画面ログインページが公開される。修正時は gate cookie / token の2条件を維持すること。セッション cookie の存在だけでは通過させない（CUSTOMER ロールのセッションでもログインフォームが露出するため）
- **`verifyAdminSession` は非管理者ロールを `/` にリダイレクト** — `/admin/login` ではなく `/` にリダイレクトする。`/admin/login` にリダイレクトすると Admin Gate で 404 になるか、gate cookie があれば無限リダイレクトループが発生する
- **`DASHBOARD_ROLES`（`@/shared/lib/admin-auth`）がダッシュボードアクセス可能なロールの Single Source of Truth** — `verifyAdminSession`・ログインページで共有。ロール追加時はこの定数のみ更新

## Multiple Root Layouts

- **root `app/loading.tsx` を削除する場合、各 route group 内に `loading.tsx` が必要** — root `loading.tsx` は `app/layout.tsx` がなくても Suspense boundary として機能している。削除すると `(dashboard)/layout.tsx` 等の動的レイアウトで「Uncached data was accessed outside of \<Suspense\>」ビルドエラー。対処: `(admin)/admin/loading.tsx`（admin 全体）と `(admin)/admin/(auth)/loading.tsx`（認証画面）を個別に追加
- **Multiple Root Layouts では `app/not-found.tsx` 禁止 — `app/global-not-found.tsx` を使う** — Next.js 16 で `app/not-found.tsx` に `<html><body>` を書くと内部 `DefaultLayout` と衝突し hydration mismatch（server が `<html lang="ja"><body className="...">` を送り、client が DefaultLayout の素の `<html><body>` を期待）。公式解は `app/global-not-found.tsx` + `next.config.ts` の `experimental: { globalNotFound: true }`。`global-not-found.tsx` は Server Component で CSS import + `next/font/google` が使用可能（Root Layout をバイパスして自前で `<html><body>` を持つ）。各 Route Group 内の `not-found.tsx`（`(public)/not-found.tsx` / `(admin)/admin/(dashboard)/not-found.tsx` 等）は `<html><body>` を**含めず**、各 Root Layout 配下で描画される。`global-error.tsx` は `"use client"` 必須のためインラインスタイル（admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可）
- **ルーティング移行後の空ディレクトリ残骸に注意** — `[slug]` → `[...segments]` 等の移行で空ディレクトリが残る。`page.tsx` がなくても Next.js のルート解決に影響する可能性がある
- **JSX `className` 内の改行は hydration mismatch** — `className="fixed bottom-16\n        md:hidden"` のようにダブルクォート文字列内に改行+インデントを含めると SSR は生文字列をそのまま出力、React は CSR で空白正規化した文字列を期待し差分発生（`sticky-bottom-bar.tsx` で実例）。Prettier が複数行整形する長さなら `cn("fixed ...", "md:hidden")` で配列分割、そうでなければ single-line を維持する（→ `tailwind-patterns.md` §禁止事項 3.1）
- **動的 layout を持つサブルートに `loading.tsx` 必須** — `mypage/layout.tsx`（認証チェーン）や `(dashboard)/layout.tsx` 配下のサブルートには個別の `loading.tsx` を追加。親の `loading.tsx` だけではページ固有のデータ取得待ちと認証待ちが同じスケルトンに合流する
- **マイページ開発確認は dev login ボタンを使用** — `/login` ページに `NODE_ENV !== "production"` でのみ表示される「テスト顧客でログイン」ボタンあり（`dev-login-action.ts`）。Better Auth の `signUpEmail`/`signInEmail` で `dev-customer@example.com` セッションを作成し、`ensureCustomerLinked` が Customer を自動生成
- **URL 由来 initial props の Client Component は `key={urlValue}` 必須** — `searchParams` / `params` が変わっても同一 route 内では Client Component が remount されず `useState` lazy init / `useForm defaultValues` / `useReducer` initial state が stale 化する。実例: 利用規約「規約を追加」ダイアログで type 選択時に URL は変わるが常にプライバシーポリシーテンプレートが表示される silent bug（`terms/new/page.tsx` で `key={typeParam}` を追加して修正）。key 不要ケース: Dialog 内 form（unmount で自動 reset）/ Settings singleton / list page（nuqs 直接 subscribe）/ 別 route segment。詳細は `react-patterns.md` §Resetting state with key

## ナビゲーション

- **ヘッダーナビは DB（`NavigationItem` テーブル）が正、`FALLBACK_NAV` はフォールバック** — ナビ変更は seed.ts + DB 両方を更新。コードだけ変えても DB にレコードがあればそちらが使われる
- **CTA ボタンと同じ URL をナビリンクに含めない** — `site-header.tsx` が `/reservation` をフィルタ除外済み。新しい CTA 導線を追加する場合も同パターンで重複を防ぐ
- **seed の `navigationItem` は "create if not exists"** — 既存レコードの削除・更新はしない。ナビ項目を削除するには DB 直接操作または管理画面が必要

## Better Auth クライアント

- **Better Auth `$Infer` は module augmentation で上書きできない** — `better-auth.d.ts` で `interface User { role: Role }` を宣言しても、`AuthInstance["$Infer"]["Session"]["user"]["role"]` は `additionalFields` の `type: "string"` から推論された `string` のまま。`Omit<Session["user"], "role"> & { role: Role }` パターン（`admin-auth.ts` / `customer-auth.ts`）が必須。`getAdminSessionUser()` / `getCustomerSessionUser()` のランタイム `isValidRole()` 検証も維持する
- **`signIn.social()` のエラーハンドリングは `fetchOptions.onError` が公式推奨** — `result.error` だけでは 429 等の HTTP エラー時に Promise がサイレントに処理され UI にフィードバックが出ない。`fetchOptions: { onError(ctx) { ctx.response.status } }` で HTTP ステータスを検査する
- **Google/LINE ソーシャルログインボタンはブランド SVG ロゴ必須** — テキストのみのボタンは UX 品質不足。Google は公式4色「G」ロゴ + 白背景、LINE は `#06C755` 背景 + 白アイコン
- **ソーシャルプロバイダーロゴは `@/public/components/ui/social-provider-logos.tsx` の共有コンポーネントを使用** — `GoogleLogo`/`LineLogo`/`PROVIDER_LOGOS` をエクスポート。ログインページ・アカウント連携の両方で使用。ローカル定義禁止
