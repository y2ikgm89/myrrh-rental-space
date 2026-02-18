# Architecture Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** アーキテクチャスコアを 91/100 → 97/100 に向上（5フェーズ・5コミットで実施）

**Architecture:** セキュリティ強化（server-only DAL 保護）→ キャッシュ正確性（Route Handler revalidateTag）→ 開発体験（Turbopack FS キャッシュ）→ 型安全性（gtag 型改善）→ ドキュメント整合性（ルール更新）の順で独立して実施。各タスクは単独でコミット可能。

**Tech Stack:** Next.js 16.1.6 / TypeScript 6.0-beta / Bun 1.3.x / React 19.2.4 / Prisma 7.4

---

## Task 1: `server-only` — DAL モジュールのクライアントバンドル混入防止

**Priority:** P0（セキュリティ）
**Score impact:** +3点

**Files:**
- Modify: `package.json` (bun add コマンドで自動更新)
- Modify: `src/shared/lib/prisma.ts`
- Modify: `src/shared/lib/auth.ts`
- Modify: `src/shared/lib/errors/logger.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/audit.ts`

**背景:**
`server-only` パッケージはバンドラーレベルでビルドエラーを発生させ、サーバー専用モジュールがクライアントバンドルに混入するのを防ぐ。`'use server'` / `'use cache'` はランタイム境界制御であり、`server-only` とは保護層が異なる（ビルド時 vs ランタイム）。DB シークレット・OAuth 設定・権限定義がクライアントに漏洩するリスクをゼロにする。

**Step 1: 現状ベースライン確認**

```bash
bun run validate
```

Expected: `type-check` と `lint` が両方 PASS すること。

---

**Step 2: server-only パッケージをインストール**

```bash
bun add server-only
```

Expected: `package.json` の `dependencies` に `"server-only": "^0.0.1"` が追加される。

---

**Step 3: `src/shared/lib/prisma.ts` に追加**

ファイルの最初のインポート行（`import { PrismaPg } from '@prisma/adapter-pg'`）の直前に1行追加:

```typescript
import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
// ... (以降は変更なし)
```

---

**Step 4: `src/shared/lib/auth.ts` に追加**

ファイル先頭の JSDoc コメント（`/** Better Auth 設定 ... */`）直後、最初の `import` 行の直前に1行追加:

```typescript
/**
 * Better Auth 設定
 * ...（既存 JSDoc）
 */

import 'server-only'
import { betterAuth } from 'better-auth'
// ... (以降は変更なし)
```

---

**Step 5: `src/shared/lib/errors/logger.ts` に追加**

ファイル先頭の JSDoc コメント直後、`import type { ErrorLogContext }` の直前に1行追加:

```typescript
/**
 * 構造化エラーロガー
 * ...（既存 JSDoc）
 */

import 'server-only'
import type { ErrorLogContext } from './types'
// ... (以降は変更なし)
```

---

**Step 6: `action-auth.ts` に追加**

`src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts` の JSDoc コメント直後:

```typescript
/**
 * Server Action 認証ヘルパー
 * ...（既存 JSDoc）
 */

import 'server-only'
import { getSession, getSessionUser, type User } from '@/shared/lib/auth'
// ... (以降は変更なし)
```

---

**Step 7: `permissions.ts` に追加**

`src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts` の JSDoc コメント直後:

```typescript
/**
 * 権限管理ライブラリ
 * ...（既存 JSDoc）
 */

import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
// ... (以降は変更なし)
```

---

**Step 8: `audit.ts` に追加**

`src/app/(admin)/admin/(dashboard)/_shared/lib/audit.ts` の JSDoc コメント直後（空行の後に最初のインポートがあるはず）:

```typescript
/**
 * 監査ログライブラリ
 * ...（既存 JSDoc）
 */

import 'server-only'
// ... (以降は変更なし)
```

---

**Step 9: 型チェック・lint 検証**

```bash
bun run validate
```

Expected: 両方 PASS。

**もし "This module cannot be used in a Client Component or Server Action" エラーが出た場合:**
これは既存のセキュリティバグが顕在化したもの。エラーメッセージの該当ファイルを特定し、クライアントコンポーネントからのインポートを削除するか、`server-only` のないファイルに対象の機能を移動する。

---

**Step 10: ビルド検証**

```bash
bun run build
```

Expected: PASS（standalone mode 無効の開発ビルドで確認）。

---

**Step 11: コミット**

```bash
git add package.json bun.lock \
  src/shared/lib/prisma.ts \
  src/shared/lib/auth.ts \
  src/shared/lib/errors/logger.ts \
  "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts" \
  "src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts" \
  "src/app/(admin)/admin/(dashboard)/_shared/lib/audit.ts"
git commit -m "security: add server-only to DAL modules to prevent client bundle leakage"
```

---

## Task 2: Route Handler キャッシュ無効化

**Priority:** P1（キャッシュ正確性）
**Score impact:** +2点

**Files:**
- Modify: `src/app/api/cron/calendar-sync/route.ts`
- Modify: `src/app/api/webhooks/google-calendar/route.ts`

**背景:**
CRON Job と Webhook の Route Handler が `syncFromCalendar()` 後にキャッシュを無効化していない。同期完了後もユーザーには古いデータが返され続ける。Route Handler では `updateTag()`（Server Actions 専用）でなく `revalidateTag()` を使用する。

**Step 1: `calendar-sync/route.ts` のインポート確認**

ファイルの先頭 import 行を読み、`revalidateTag` と `CACHE_TAGS` が既にインポートされているか確認する。

Expected: どちらも未インポート。

---

**Step 2: `calendar-sync/route.ts` — インポート追加**

既存の `import { NextResponse } from 'next/server'` 付近（ファイル先頭）に追加:

```typescript
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
```

---

**Step 3: `calendar-sync/route.ts` — revalidateTag 追加**

`syncFromCalendar()` の成功パス（エラーハンドリング `if (!result.success) { ... }` の閉じブレースの直後、`return NextResponse.json({ success: true, ... })` の直前）:

変更前（現在 line 169 付近）:
```typescript
    }

    return NextResponse.json({
      success: true,
      processed: result.processed,
```

変更後:
```typescript
    }

    // カレンダー同期完了後にキャッシュを無効化（次リクエストから最新データを返す）
    revalidateTag(CACHE_TAGS.RESERVATIONS)

    return NextResponse.json({
      success: true,
      processed: result.processed,
```

---

**Step 4: `google-calendar/route.ts` のインポート確認・追加**

同様に `revalidateTag` と `CACHE_TAGS` のインポートを追加する。

---

**Step 5: `google-calendar/route.ts` — revalidateTag 追加**

`syncFromCalendar()` の成功パス（エラーハンドリング直後、`return NextResponse.json({ success: true, ... })` の直前、現在 line 130 付近）:

変更前:
```typescript
    }

    return NextResponse.json({
      success: true,
      processed: result.processed,
```

変更後:
```typescript
    }

    // Webhook 同期完了後にキャッシュを無効化
    revalidateTag(CACHE_TAGS.RESERVATIONS)

    return NextResponse.json({
      success: true,
      processed: result.processed,
```

---

**Step 6: 検証 + コミット**

```bash
bun run validate
git add "src/app/api/cron/calendar-sync/route.ts" "src/app/api/webhooks/google-calendar/route.ts"
git commit -m "fix(cache): add revalidateTag(RESERVATIONS) after calendar sync in Route Handlers"
```

---

## Task 3: Turbopack ファイルシステムキャッシュ有効化

**Priority:** P2（開発体験）
**Score impact:** +1点

**Files:**
- Modify: `next.config.ts` (line 119 付近の `experimental` セクション)

**背景:**
`turbopackFileSystemCacheForDev: true` で開発サーバー再起動後もビルドキャッシュをディスクに永続化し、コールドスタート時間を大幅短縮する。`.next/cache/` は `.gitignore` で除外済み。

**Step 1: `next.config.ts` の experimental セクションを確認**

現在の `experimental` セクション（line 119）を読み、`optimizePackageImports` のみが定義されていることを確認する。

---

**Step 2: `turbopackFileSystemCacheForDev: true` を追加**

`experimental` セクションの先頭（`optimizePackageImports` の前）に1行追加:

変更前:
```typescript
  experimental: {
    // Optimize package imports - tree shaking for barrel exports
    optimizePackageImports: [
```

変更後:
```typescript
  experimental: {
    // Turbopack persistent filesystem cache for faster dev server cold starts
    // Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
    turbopackFileSystemCacheForDev: true,
    // Optimize package imports - tree shaking for barrel exports
    optimizePackageImports: [
```

---

**Step 3: 検証 + コミット**

```bash
bun run validate
git add next.config.ts
git commit -m "feat(dx): enable turbopackFileSystemCacheForDev for faster dev server restarts"
```

**検証メモ:** 次回の `bun dev` 起動時、初回はキャッシュ構築のため通常通りの時間がかかる。2回目以降の起動時間が短縮される。Windows 環境でエラーが出た場合はこの設定を削除する（Windows + Turbopack 固有の互換性問題がある可能性）。

---

## Task 4: `global.d.ts` gtag 型の改善

**Priority:** P3（型安全性）
**Score impact:** +0.5点

**Files:**
- Modify: `src/shared/types/global.d.ts`

**背景:**
現在 `gtag` が `(...args: any[]) => void` 型。`@next/third-parties` の gtag シグネチャに合わせた厳密な型定義に変更し、eslint-disable コメントも除去する。

**Step 1: 現状確認**

`src/shared/types/global.d.ts` の内容を確認:

```typescript
declare global {
  var prisma: PrismaClient | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var gtag: ((...args: any[]) => void) | undefined
}
export {}
```

---

**Step 2: 厳密な型定義に変更**

ファイル全体を以下に置き換える:

```typescript
import type { PrismaClient } from '@/shared/generated/prisma/client'

// Google Analytics gtag 型定義
// https://developers.google.com/tag-platform/gtagjs/reference
type GtagCommand = 'config' | 'event' | 'get' | 'set' | 'consent'
type GtagParams = Record<string, string | number | boolean | null | undefined>

declare global {
  var prisma: PrismaClient | undefined
  var gtag: ((command: GtagCommand, target: string, params?: GtagParams) => void) | undefined
}
export {}
```

**注意:** 既存の `var prisma: PrismaClient | undefined` の `PrismaClient` が import なしで参照されている場合は import を追加する（あるいは既に ambient declaration で解決されていれば不要）。型チェックで判断する。

---

**Step 3: 検証 + コミット**

```bash
bun run validate
```

Expected: PASS（eslint-disable コメントが除去されてもエラーなし）。

```bash
git add "src/shared/types/global.d.ts"
git commit -m "refactor(types): replace any with strict GtagCommand/GtagParams in global.d.ts"
```

---

## Task 5: ルールファイル更新

**Priority:** P3（ドキュメント整合性）
**Score impact:** 品質向上（点数外）

**Files:**
- Create: `.claude/rules/server-only-patterns.md`
- Modify: `.claude/rules/server-actions.md`

**Step 1: `server-only-patterns.md` 新規作成**

`.claude/rules/server-only-patterns.md` を以下の内容で作成:

````markdown
# server-only パターンルール

> Next.js Data Access Layer (DAL) / サーバー専用モジュール保護

## 概要

`server-only` パッケージはバンドラーレベルでクライアントバンドルへの混入を**ビルド時エラー**で防ぐ。`'use server'` / `'use cache'` ディレクティブはランタイム境界を制御するが、`server-only` は**ビルド時**に誤ったインポートを即座に検出するセキュリティ層。

| 手段 | 保護タイミング | 保護対象 |
|------|--------------|---------|
| `server-only` | **ビルド時** | モジュール自体のクライアントバンドル混入 |
| `'use server'` | ランタイム | 関数が Client→Server RPC エンドポイントになる |
| `'use cache'` | ランタイム | 関数の結果をクロスリクエストキャッシュに保存 |

## 対象ファイル（プロジェクト標準）

以下のファイルは `import 'server-only'` を持つ:

| ファイル | 理由 |
|---------|------|
| `@/shared/lib/prisma.ts` | DB クライアント + 接続シークレット |
| `@/shared/lib/auth.ts` | Better Auth 設定（OAuth シークレット等） |
| `@/shared/lib/errors/logger.ts` | サーバー専用構造化ロガー |
| `@/admin/lib/action-auth.ts` | 権限チェック関数群 |
| `@/admin/lib/permissions.ts` | 権限定義マップ（ROLE_PERMISSIONS 等） |
| `@/admin/lib/audit.ts` | 監査ログ記録関数 |

## 使い方

```typescript
// JSDoc コメント直後、最初の import 行の前に追加
import 'server-only'

// 以降は通常のインポート
import { PrismaPg } from '@prisma/adapter-pg'
```

## 除外対象（追加不要）

- `src/app/**/*.ts` ファイルで `'use server'` / `'use cache'` ディレクティブ付き — ランタイム境界で保護済み
- クライアントコンポーネント（`'use client'` ファイル） — そもそもサーバーコードを含まない

## 新規サーバー専用モジュール作成時

DB 接続・環境変数シークレット・認証設定・権限定義を含む新規モジュールを作成する場合は必ず `import 'server-only'` を先頭に追加する。

## 違反の検出と修正

`bun run build` で `"This module cannot be used in a Client Component or Server Action"` エラーが出た場合:

1. エラーのインポートチェーンを確認
2. 誤ってクライアントコンポーネントにインポートされている場合は削除
3. クライアント側で必要な機能は `@/shared/lib/auth-client.ts` / `@/shared/lib/logger.ts` 等の非 server-only ファイルに移動
````

---

**Step 2: `server-actions.md` の Route Handler セクション更新**

`.claude/rules/server-actions.md` の `updateTag vs revalidateTag 比較` テーブル直後または `revalidateTag（非同期再検証）` セクションに、実際のファイルパスコメントを追記する。

現在の Route Handler 使用例のコード:
```typescript
// Route Handler（CRON Job 等）
export async function POST() {
  await syncCalendar()
  revalidateTag(CACHE_TAGS.RESERVATIONS)
  return Response.json({ ok: true })
}
```

上記を以下に更新（実際のファイルとの対応を明記）:
```typescript
// Route Handler（CRON Job / Webhook — revalidateTag を使用）
// 例: src/app/api/cron/calendar-sync/route.ts
// 例: src/app/api/webhooks/google-calendar/route.ts
export async function POST() {
  const result = await syncFromCalendar()
  if (!result.success) {
    // エラー処理...
  }

  // 同期完了後にキャッシュ無効化（updateTag は Server Actions 専用のため不可）
  revalidateTag(CACHE_TAGS.RESERVATIONS)

  return NextResponse.json({ success: true })
}
```

また `禁止事項` セクション 4 の `updateTag を Route Handlers で使用禁止` コードブロックに `server-only` との違いに関する注記を追加:
```typescript
// 補足: Route Handler 自体がサーバー専用のため server-only は不要（'use server' / 'use cache' も不要）
```

---

**Step 3: 検証 + コミット**

```bash
git add ".claude/rules/server-only-patterns.md" ".claude/rules/server-actions.md"
git commit -m "docs(rules): add server-only-patterns.md and update Route Handler cache invalidation examples"
```

---

## 実施後の期待スコア

| 指標 | 改善前 | 改善後 |
|------|--------|--------|
| セキュリティスコア | 88/100 | 95/100 |
| キャッシュ正確性 | 85/100 | 97/100 |
| 開発体験 | 90/100 | 95/100 |
| 型安全性 | 94/100 | 97/100 |
| **総合スコア** | **91/100** | **97/100** |

## 実施時の注意事項

### useFormStatus について

設計調査の結果、`CustomerForm.tsx` と `CouponForm.tsx` は `useActionState` の `isPending` を同一コンポーネントスコープ内で直接使用しているため、props ドリリングは発生していない。`useFormStatus` は `<form>` の子孫コンポーネント内でのみ機能するが、これらのフォームは submit ボタンをインラインで持つ構造。

**`useFormStatus` が有効なケース（将来の参考）:**
```typescript
// 新規フォーム作成時: submit ボタンを子コンポーネントに分離する場合
function AdminSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()  // 親の <form action={formAction}> から自動で状態取得
  return (
    <Button type="submit" disabled={pending} className={cn(pending && 'opacity-50')}>
      {pending ? '処理中...' : children}
    </Button>
  )
}
// 使用側: <AdminSubmitButton>保存</AdminSubmitButton>（isPending を props で渡す不要）
```

現行コードへの適用は YAGNI 違反（3 箇所以上の使用が発生してから抽象化を検討）。

## 参考資料

- [Next.js Data Access Layer](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#keeping-server-only-code-out-of-the-client-environment)
- [Next.js Cache Invalidation](https://nextjs.org/docs/app/building-your-application/caching#invalidating-1)
- [Turbopack Configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)
- [React 19 useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
