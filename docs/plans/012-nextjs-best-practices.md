# 012-nextjs-best-practices.md

Next.js公式ベストプラクティス準拠改善

## 完了日

2026-01-11

## 背景

Next.js公式ドキュメントで推奨されているベストプラクティスに準拠するため、以下の2点を改善：
- Route Groupsによるセクション整理
- cache() APIによるセッション検証のメモ化

## 実装内容

### A. adminをRoute Groupに変更

**Before:**
```
src/app/
├── (public)/    # Route Group
└── admin/       # 通常ディレクトリ
```

**After:**
```
src/app/
├── (public)/    # Route Group
└── (admin)/     # Route Group
    └── admin/   # URL: /admin/...（変更なし）
```

**メリット:**
- 論理的なセクション分離
- 将来的に(admin)専用のlayout/error/loadingを追加可能
- Next.js公式パターン準拠

### B. cache()でverifySessionをメモ化

**Data Access Layer (DAL) パターン実装**

新規関数:
```typescript
import { cache } from 'react'
import { redirect } from 'next/navigation'

// Server Components用（リダイレクトベース）
export const verifySession = cache(async () => {
  const session = await auth()
  if (!session?.user) {
    redirect('/admin/login')
  }
  return session.user
})

export const verifyAdminSession = cache(async () => {
  const user = await verifySession()
  if (user.role !== Role.ADMIN) {
    redirect('/admin/login')
  }
  return user
})

// オプショナル認証用（リダイレクトなし）
export const getCurrentUser = cache(async () => {
  const session = await auth()
  return session?.user
})
```

**Server Actions用パターン:**
```typescript
// withAuth HOF は直接 auth() を呼び出し
// ActionFailure を返す（redirectなし）
export function withAuth<TArgs, TData>(fn) {
  return async (...args) => {
    const session = await auth()
    if (!session?.user) {
      return createFailure('ログインが必要です')
    }
    if (session.user.role !== Role.ADMIN) {
      return createFailure('管理者権限が必要です')
    }
    return await fn(session.user, ...args)
  }
}
```

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/app/(admin)/admin/` | 新しいRoute Group（移動） |
| `src/lib/auth.ts` | verifySession, verifyAdminSession追加（cache()ラップ） |
| `src/types/server-actions.ts` | withAuth HOFを直接auth()呼び出しに変更 |

## 後方互換性

**意図的に削除:**
- `requireAuth()` → `verifySession()` に置換（@deprecated として残存）
- `requireAdmin()` → `verifyAdminSession()` に置換（@deprecated として残存）

## 技術詳細

### cache() APIの効果

同一リクエスト内で複数回呼び出されても1回のみ実行：
```typescript
// 1回のリクエスト中に
const user1 = await verifySession() // DB/JWT検証実行
const user2 = await verifySession() // キャッシュから取得（実行なし）
const user3 = await verifySession() // キャッシュから取得（実行なし）
```

### Server Components vs Server Actions

| 用途 | 関数 | 未認証時の動作 |
|------|------|---------------|
| Server Components | `verifySession()` | redirect |
| Server Actions | `withAuth()` | ActionFailure返却 |

## 検証結果

- `bun run type-check` - 成功
- `bun run lint` - 警告のみ（既存のReact Hook Form互換性警告）
- `bun run build` - 成功

## 参考

- [Next.js公式: Authentication](https://nextjs.org/docs/app/building-your-application/authentication)
- [Next.js公式: Data Access Layer](https://nextjs.org/docs/app/building-your-application/data-fetching/security)
