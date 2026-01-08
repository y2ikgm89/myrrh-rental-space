# patterns.md - 再利用パターン

> プロジェクトで確立された再利用可能なパターンを記録

## 形式

```markdown
## パターン名

**用途**: いつ使うか
**パターン**: 具体的な実装パターン
**例**: コード例
**注意**: 使用時の注意点
```

---

## Server Components でのデータ取得

**用途**: ページやレイアウトでのデータ取得
**パターン**:
```tsx
// src/app/spaces/page.tsx
import { prisma } from '@/lib/prisma'

export default async function SpacesPage() {
  const spaces = await prisma.space.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      images: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return <SpaceList spaces={spaces} />
}
```
**注意**:
- `use client` を使わない
- Prisma クエリは Server Component 内で直接実行
- 必要なフィールドのみ `select` で取得

---

## Server Actions でのフォーム処理

**用途**: フォーム送信、データ変更
**パターン**:
```tsx
// src/actions/create-reservation.ts
'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

const schema = z.object({
  spaceId: z.string().uuid(),
  date: z.string().date(),
  // ...
})

export async function createReservation(formData: FormData) {
  const validated = schema.parse(Object.fromEntries(formData))

  await prisma.reservation.create({
    data: validated,
  })

  revalidatePath('/reservations')
}
```
**注意**:
- `'use server'` ディレクティブ必須
- Zod でバリデーション
- `revalidatePath` でキャッシュ更新

---

## 認証チェック

**用途**: 認証が必要なページ・アクション
**パターン**:
```tsx
// src/app/admin/layout.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/admin/login')
  }

  return <>{children}</>
}
```
**注意**:
- `auth()` は Server Component で使用
- 未認証時は `redirect()` でリダイレクト
