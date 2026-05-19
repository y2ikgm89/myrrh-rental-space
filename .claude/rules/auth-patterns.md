---
paths:
  - src/app/**
  - src/shared/**
---

# 認証パターンルール

> Better Auth + RBAC 対応。バージョン SSoT は `package.json` の `better-auth`。

## 禁止事項

1. **認証チェック漏れ禁止**
   - 管理画面の書き込み系 Server Actions は `executeAdminMutationResult` を使用
   - API Route は `checkPermission()` を直接呼び出す（→ `auth-patterns/admin-actions.md`）

2. **Server Actions での `checkPermission` 直接呼び出し禁止**
   - `executeAdminMutationResult` が権限チェック・監査ログ・DomainError ハンドリングを一括処理する
   - 直接 `checkPermission` を使うと監査ログが漏れる

3. **直接的な role アクセス禁止**
   - `session.user.role` を直接比較しない
   - `getAdminSessionUser(session)` / `getCustomerSessionUser(session)` を使用（→ `auth-patterns/sessions.md`）

4. **`cache()` の誤用禁止**
   - Server Actions 内では `getAdminSession()` / `getCustomerSession()` を使用（`cache()` 不使用）
   - Server Components では `verifyAdminSession()` / `getCurrentAdminUser()` を使用（`cache()` あり）

5. **権限ハードコード禁止**
   - `user.role === 'ADMIN'` → `executeAdminMutationResult` の `resource` / `action` で宣言的に指定
   - `user.role === Role.ADMIN` の直接比較禁止

6. **HOF（`withPermission` / `withReadPermission`）パターン禁止**
   - Turbopack HMR との互換性のため廃止済み

7. **`isValidRole` / `VALID_ROLES` のローカル再定義禁止**
   - SSoT は `@/shared/lib/validations/enums/guards.ts` のみ
   - `admin-auth.ts` / `customer-auth.ts` 内の `getAdminSessionUser()` / `getCustomerSessionUser()` は guards.ts の `isValidRole` を import して使う
   - 旧 API（`admin-auth.ts` / `customer-auth.ts` からの `isValidRole` export）は削除済み。復活させない

8. **`ROLE_PERMISSIONS.EDITOR` に page 系以外の resource を追加禁止**
   - `userHasResourceAccess` は page UUID 専用判定のため、独立 resource (post / news / event 等) を EDITOR に許可すると `checkResourceAccess: true` 経路で常に reject される silent bug の温床
   - 詳細 → `auth-patterns/admin-actions.md` §EDITOR ロール契約

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
| `@/shared/lib/admin-roles.ts`          | DASHBOARD_ROLES SSoT（client-safe、`server-only` なし）                                                  |
| `@/shared/lib/admin-resources.ts`      | リソース enum SSoT（client-safe）                                                                        |

## Gotchas

- **`databaseHooks.user.create.after` はソーシャルログイン時に FK 制約違反** — トランザクション内で実行されるため外部テーブルへの FK 参照が失敗する（Issue #7260, #4614）。`ensureCustomerLinked` のようなアプリ層での遅延紐づけを使用（→ `auth-patterns/customer-social.md`）
- **`prisma migrate dev` は非対話環境でブロック** — `prisma migrate diff --script` + `prisma db execute` + `prisma migrate resolve --applied` で代替（→ `prisma-patterns/migrations.md`）
- **セッション作成で `invalid input syntax for type uuid` エラー** — `advanced.database.generateId: "uuid"` が未設定。Better Auth のデフォルト ID 生成はランダム文字列で、DB の `@db.Uuid` 制約に違反する（→ `auth-patterns/sessions.md`）
- **`'use cache'` 関数に Zod スキーマを引数で渡すと `Cannot access safeParse on the server` エラー** — `'use cache'` の引数は React シリアライゼーションを通るため、Zod スキーマ等の関数を含むオブジェクトは渡せない。DB フェッチのみをキャッシュし、バリデーションはキャッシュ境界外で行う
- **`verifyAdminSession()` / `isAdmin()` は `SUPER_ADMIN` も必須チェック** — `role !== Role.ADMIN` のみでは `SUPER_ADMIN`（全権限保有）が管理画面にアクセスできないバグになる。`role !== Role.ADMIN && role !== Role.SUPER_ADMIN` の形式で記述する
- **接続テスト・確認系アクションも `executeAdminMutationResult` 必須** — 独自の `checkXxxPermission()` ヘルパーは権限チェックが非標準になり欠落が生じる
- **resource permission の上にロール制限を加える場合は `execute` callback 内で `user.role` チェック** — 新 resource enum を増やさず特権操作（restore / force-close / impersonate 等）を表現する canonical パターン。`execute: async (user) => { if (user.role !== Role.SUPER_ADMIN) throw new DomainError("...", "FORBIDDEN"); ... }`。`executeAdminMutationResult` が `DomainError("FORBIDDEN")` を `MutationError` に自動変換するため UI 側で 403 として扱える。参照実装: `restoreReservationStatus` (`reservation/mutations.ts`)
- **Webhook トークン比較に `!==` 禁止** — `crypto.timingSafeEqual` を使用。`receivedToken !== settings.token` はタイミング攻撃に脆弱。Google Calendar webhook の `timingSafeTokenEqual()` が実装例
- **Better Auth クライアントの `forgetPassword` は `InferClientAPI` で型推論されない** — `emailAndPassword` のコア機能だが、クライアント型に含まれない。`adminAuthClient.$fetch("/request-password-reset", { method: "POST", body: { email, redirectTo } })` で直接呼び出す（管理者用）。`resetPassword` は型推論される
- **Better Auth `$Infer` は module augmentation で上書きできない** — `better-auth.d.ts` で `interface User { role: Role }` を宣言しても、`AuthInstance["$Infer"]["Session"]["user"]["role"]` は `additionalFields` の `type: "string"` から推論された `string` のまま。`Omit<Session["user"], "role"> & { role: Role }` パターン（`admin-auth.ts` / `customer-auth.ts`）が必須。`getAdminSessionUser()` / `getCustomerSessionUser()` のランタイム `isValidRole()` 検証も維持する

### Better Auth hooks の挙動（TS 型に出ない仕様）

- **`hooks.after` は APIError throw 時にも発火する** — `to-auth-endpoints.mjs` で APIError は catch されて `internalContext.context.returned` に格納されてから after hook が呼ばれる。成功 / 失敗の対称配線は `ctx.context.returned.status !== "OK"` で判定（TS 型では露出していない実装由来の挙動）。`/reset-password` の `PASSWORD_CHANGE` / `PASSWORD_RESET_FAILED` 対称監査ログ（`admin-auth.ts`）が canonical 参照実装
- **`onAPIError.onError(error, ctx)` の `ctx` は静的 AuthContext のみ** — `ctx.path` / `ctx.body` は未提供（型は `(error, ctx: AuthContext) => void`、内部で `betterFetch` の閉包から渡される静的 instance context）。per-request の path / body / email を含む失敗トラッキングは `onAPIError` ではなく `hooks.after` + `ctx.context.returned` で実装する

### Admin Gate

- **`admin-login-gate.ts` に `server-only` / `serverEnv` 依存禁止** — seed.ts・CLI スクリプト（`scripts/generate-login-url.ts`）から import するため。`process.env` を直接参照する
- **Admin Gate トークン生成の鶏と卵** — 管理画面 API でトークン生成するには既にログインが必要。初回は `bun prisma/seed.ts --admin`（自動 URL 出力）または `bun scripts/generate-login-url.ts` で生成
- **proxy.ts の `/admin/login` ガードを削除しない** — Admin Gate が無効化されると管理画面ログインページが公開される。修正時は gate cookie / token の 2 条件を維持すること。セッション cookie の存在だけでは通過させない（CUSTOMER ロールのセッションでもログインフォームが露出するため）
- **`verifyAdminSession` は非管理者ロールを `/` にリダイレクト** — `/admin/login` ではなく `/` にリダイレクトする。`/admin/login` にリダイレクトすると Admin Gate で 404 になるか、gate cookie があれば無限リダイレクトループが発生する
- **`/admin/api/*` の Client fetch が 404 になる原因の典型は admin セッション切れ** — proxy.ts は `/admin` プレフィックスを持つ全パスにセッション必須チェックを適用するため、`/admin/api/notifications/unread-count` 等の admin API も対象。セッション cookie 不在 → `/admin/login` 307 redirect → fetch が redirect follow → `/admin/login` で admin-gate cookie もなければ `handleAdminLoginGate` が 404 を返却 → ブラウザコンソールには「API が 404」と見える silent debug trap。切り分け: ① `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/api/...` で 307 が出れば proxy redirect、② DevTools → Application → Cookies で `admin-auth.session_token` と `admin_login_gate` の有無確認、③ 不在なら再ログイン

### Multiple Root Layouts + ルーティング

- **root `app/loading.tsx` を削除する場合、各 route group 内に `loading.tsx` が必要** — root `loading.tsx` は `app/layout.tsx` がなくても Suspense boundary として機能している。削除すると `(dashboard)/layout.tsx` 等の動的レイアウトで「Uncached data was accessed outside of \<Suspense\>」ビルドエラー。対処: `(admin)/admin/loading.tsx`（admin 全体）と `(admin)/admin/(auth)/loading.tsx`（認証画面）を個別に追加
- **Multiple Root Layouts では `app/not-found.tsx` 禁止 — `app/global-not-found.tsx` を使う** — Next.js 16 で `app/not-found.tsx` に `<html><body>` を書くと内部 `DefaultLayout` と衝突し hydration mismatch（server が `<html lang="ja"><body className="...">` を送り、client が DefaultLayout の素の `<html><body>` を期待）。公式解は `app/global-not-found.tsx` + `next.config.ts` の `experimental: { globalNotFound: true }`。`global-not-found.tsx` は Server Component で CSS import + `next/font/google` が使用可能（Root Layout をバイパスして自前で `<html><body>` を持つ）。各 Route Group 内の `not-found.tsx`（`(public)/not-found.tsx` / `(admin)/admin/(dashboard)/not-found.tsx` 等）は `<html><body>` を**含めず**、各 Root Layout 配下で描画される。`global-error.tsx` は `"use client"` 必須のためインラインスタイル（admin.css / public.css の CSS 変数・`@theme` トークン・`next/font` が一切利用不可）
- **ルーティング移行後の空ディレクトリ残骸に注意** — `[slug]` → `[...segments]` 等の移行で空ディレクトリが残る。`page.tsx` がなくても Next.js のルート解決に影響する可能性がある
- **Turbopack route discovery が空の非プライベートディレクトリで silent break する** — `[slug]/` 配下に `page.tsx` 不在の兄弟ディレクトリ（`builder/_components/` のような ADR refactor 残骸、`_` プレフィックスなし）が残ると `.next/dev/types/routes.d.ts` の `AppRoutes` から子ルートが**欠落**する silent bug。URL アクセスは `(public)/[...segments]/page.tsx` の catch-all にフォールスルーし、admin URL なのに**公開ページの 404**（`%s | Myrrh Rental Space` タイトル + 公開 layout chrome）が表示される。診断: `grep "/admin/<resource>/\[" .next/dev/types/routes.d.ts` で AppRoutes 欠落確認 + `ls "<route segment dir>"` で空 dir 検出。復旧: 空ディレクトリ削除（`python3 -c "import shutil; shutil.rmtree('<path>', ignore_errors=True)"`）+ `.next/` クリア + dev server 再起動
- **JSX `className` 内の改行は hydration mismatch** — `className="fixed bottom-16\n        md:hidden"` のようにダブルクォート文字列内に改行+インデントを含めると SSR は生文字列をそのまま出力、React は CSR で空白正規化した文字列を期待し差分発生（`sticky-bottom-bar.tsx` で実例）。Prettier が複数行整形する長さなら `cn("fixed ...", "md:hidden")` で配列分割、そうでなければ single-line を維持する（→ `tailwind-patterns/inline-style-vs-arbitrary.md` §禁止事項 3.1）
- **動的 layout を持つサブルートに `loading.tsx` 必須** — `mypage/layout.tsx`（認証チェーン）や `(dashboard)/layout.tsx` 配下のサブルートには個別の `loading.tsx` を追加。親の `loading.tsx` だけではページ固有のデータ取得待ちと認証待ちが同じスケルトンに合流する
- **URL 由来 initial props の Client Component は `key={urlValue}` 必須** — `searchParams` / `params` が変わっても同一 route 内では Client Component が remount されず `useState` lazy init / `useForm defaultValues` / `useReducer` initial state が stale 化する。実例: 利用規約「規約を追加」ダイアログで type 選択時に URL は変わるが常にプライバシーポリシーテンプレートが表示される silent bug（`terms/new/page.tsx` で `key={typeParam}` を追加して修正）。key 不要ケース: Dialog 内 form（unmount で自動 reset）/ Settings singleton / list page（nuqs 直接 subscribe）/ 別 route segment。詳細は `react/forms-ssr.md` §Resetting state with key

### ナビゲーション

- **ヘッダーナビは DB（`NavigationItem` テーブル）が正、`FALLBACK_NAV` はフォールバック** — ナビ変更は seed.ts + DB 両方を更新。コードだけ変えても DB にレコードがあればそちらが使われる
- **CTA ボタンと同じ URL をナビリンクに含めない** — `site-header.tsx` が `/reservation` をフィルタ除外済み。新しい CTA 導線を追加する場合も同パターンで重複を防ぐ
- **seed の `navigationItem` は "create if not exists"** — 既存レコードの削除・更新はしない。ナビ項目を削除するには DB 直接操作または管理画面が必要
