# コーディング規約

## 命名規則

| 対象                | 規則             | 例                |
| ------------------- | ---------------- | ----------------- |
| コンポーネント      | PascalCase.tsx   | `UserForm.tsx`    |
| その他ファイル      | kebab-case.ts    | `api-keys.ts`     |
| 関数                | camelCase        | `getUserById`     |
| 定数                | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 型/インターフェース | PascalCase       | `UserInput`       |

## ディレクトリ構成

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/          # 公開ページ
│   ├── (admin)/admin/     # 管理画面
│   └── api/               # API Routes
├── components/
│   ├── admin/             # 管理画面UI
│   └── site/              # 公開サイトUI
├── actions/               # Server Actions
├── lib/                   # ユーティリティ
├── types/                 # 型定義
└── generated/             # Prisma生成コード
```

## コンポーネント設計

### Server Components優先

```typescript
// デフォルトはServer Component
export default async function Page() {
  const data = await getData()
  return <ClientComponent initialData={data} />
}
```

### Client Componentは必要時のみ

```typescript
"use client";
// フック、イベントハンドラ、ブラウザAPIが必要な場合のみ
```

## Server Actions

### withAuth パターン

```typescript
import { withAuth, createSuccess, createFailure } from "@/types/server-actions";

export const updateItem = withAuth(async (_user, id: string, data: Input) => {
  const validated = schema.safeParse(data);
  if (!validated.success) {
    return createFailure("入力エラー", validated.error.flatten().fieldErrors);
  }

  await prisma.item.update({ where: { id }, data: validated.data });
  return createSuccess("更新しました");
});
```

### Query関数（読み取り専用）

```typescript
import { verifyAdminSession } from "@/lib/auth";

export async function getItems() {
  await verifyAdminSession();
  return prisma.item.findMany();
}
```

## 型安全性

### Zodスキーマ優先

```typescript
import { z } from "zod";

export const itemSchema = z.object({
  name: z.string().min(1, "必須"),
  price: z.number().positive(),
});

export type ItemInput = z.infer<typeof itemSchema>;
```

### Prisma型の活用

```typescript
import type { Item } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

// WhereInput型
const where: Prisma.ItemWhereInput = { isActive: true };
```

## バリデーション

- **クライアント**: ユーザー体験向上（フィードバック）
- **サーバー**: セキュリティ確保（必須）

```typescript
// 同じスキーマを両方で使用
import { itemSchema } from "@/lib/validations/item";

// Client: react-hook-form + zodResolver
// Server: safeParse
```

## コミット規約

```
<type>(<scope>): <subject>

feat(reservation): add calendar sync
fix(auth): handle token refresh
refactor(settings): extract to components
```

| type     | 用途             |
| -------- | ---------------- |
| feat     | 新機能           |
| fix      | バグ修正         |
| refactor | リファクタリング |
| docs     | ドキュメント     |
| style    | フォーマット     |
| test     | テスト           |
| chore    | 雑務             |

## 禁止事項

- `any`型の使用
- `// @ts-ignore`
- `useEffect`でのデータフェッチ
- クライアントのみのバリデーション
- 未認証のServer Actions mutation
