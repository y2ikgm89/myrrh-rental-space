# 開発ガイド

開発者向けの補助ガイドです。実装ルールの正本は `docs/reference/codex-rules/*` と `AGENTS.md` を参照してください。

## ガイド一覧

| ガイド                                    | 説明                              |
| ----------------------------------------- | --------------------------------- |
| [コーディング規約](./coding-standards.md) | コード品質・命名規則              |
| [型安全性](./type-safety.md)              | TypeScript・Zodベストプラクティス |
| [テスト](./testing.md)                    | テスト戦略・実行方法              |
| [nuqs](./nuqs.md)                         | URL状態管理                       |
| [Prisma](./prisma.md)                     | Prisma 7使用ガイド                |
| [Turbopack](./turbopack.md)               | Next.js 16バンドラー              |

## クイックリファレンス

### 型安全性の原則

```typescript
// Zodスキーマから型を導出
const schema = z.object({ name: z.string() });
type Input = z.infer<typeof schema>;

// app 層では generated Prisma 型を直接使わない
import type { SpaceSummary } from "@/shared/domain/spaces/types";
```

### Server Actions パターン

```typescript
"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { hasPermission } from "@/admin/lib/permissions";
import { verifyAdminSession } from "@/shared/lib/auth";
import { CACHE_TAGS } from "@/shared/lib/constants/cache";

const schema = z.object({
  id: z.string().uuid(),
});

export async function updateItem(input: unknown) {
  const user = await verifyAdminSession();
  if (!hasPermission(user.role, "settings", "update")) {
    return { error: "権限がありません" };
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    return { error: "入力が不正です" };
  }

  updateTag(CACHE_TAGS.SETTINGS);
  return { success: true };
}
```

## 関連ドキュメント

- [アーキテクチャ](../architecture/README.md)
- [セキュリティ](../security/README.md)
- [Codex Rules](../reference/codex-rules/)
