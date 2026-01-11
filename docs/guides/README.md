# 開発ガイド

開発者向けのガイドラインとベストプラクティス。

## ガイド一覧

| ガイド | 説明 |
|-------|------|
| [コーディング規約](./coding-standards.md) | コード品質・命名規則 |
| [型安全性](./type-safety.md) | TypeScript・Zodベストプラクティス |
| [テスト](./testing.md) | テスト戦略・実行方法 |
| [nuqs](./nuqs.md) | URL状態管理 |
| [Prisma](./prisma.md) | Prisma 7使用ガイド |
| [Turbopack](./turbopack.md) | Next.js 16バンドラー |

## クイックリファレンス

### 型安全性の原則

```typescript
// Zodスキーマから型を導出
const schema = z.object({ name: z.string() })
type Input = z.infer<typeof schema>

// Prisma型を活用
import type { Space } from '@/generated/prisma/client'
```

### Server Actions パターン

```typescript
import { withAuth, createSuccess, createFailure } from '@/types/server-actions'

export const updateItem = withAuth(async (_user, id: string, data: Input) => {
  // 認証済み、エラーハンドリング統一
  return createSuccess('更新しました')
})
```

## 関連ドキュメント

- [アーキテクチャ](../architecture/README.md)
- [セキュリティ](../security/README.md)
