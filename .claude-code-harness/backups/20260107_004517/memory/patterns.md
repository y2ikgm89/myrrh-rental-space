# 再利用パターン (Patterns)

> プロジェクトで確立された再利用可能なパターンを記録します。

---

## Server Actions パターン

### フォーム送信の基本パターン

```typescript
// src/actions/create-reservation.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  spaceId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  guestName: z.string().min(1),
  guestEmail: z.string().email(),
})

export async function createReservation(formData: FormData) {
  const validated = schema.safeParse({
    spaceId: formData.get('spaceId'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    guestName: formData.get('guestName'),
    guestEmail: formData.get('guestEmail'),
  })

  if (!validated.success) {
    return { error: validated.error.flatten() }
  }

  try {
    const reservation = await prisma.reservation.create({
      data: validated.data,
    })

    revalidatePath('/admin/reservations')
    return { success: true, data: reservation }
  } catch (error) {
    return { error: 'Failed to create reservation' }
  }
}
```

---

## データ取得パターン

### Server Component でのデータ取得

```typescript
// src/app/spaces/[id]/page.tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

type Props = {
  params: Promise<{ id: string }>
}

export default async function SpacePage({ params }: Props) {
  const { id } = await params

  const space = await prisma.space.findUnique({
    where: { id, isPublished: true },
    include: { images: true },
  })

  if (!space) {
    notFound()
  }

  return <SpaceDetail space={space} />
}
```

---

## バリデーションパターン

### Zod スキーマの共有

```typescript
// src/lib/schemas/reservation.ts
import { z } from 'zod'

export const reservationSchema = z.object({
  spaceId: z.string().uuid(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  guestName: z.string().min(1, '名前を入力してください'),
  guestEmail: z.string().email('有効なメールアドレスを入力してください'),
  guestPhone: z.string().optional(),
})

export type ReservationInput = z.infer<typeof reservationSchema>
```

---

## コンポーネントパターン

### クライアントコンポーネントの最小化

```typescript
// src/components/ui/SpaceCard.tsx (Server Component)
import { Space } from '@prisma/client'
import { SpaceCardActions } from './SpaceCardActions'

type Props = {
  space: Space
}

export function SpaceCard({ space }: Props) {
  return (
    <div className="rounded-lg border p-4">
      <h3>{space.name}</h3>
      <p>{space.description}</p>
      {/* クライアントインタラクションのみ Client Component */}
      <SpaceCardActions spaceId={space.id} />
    </div>
  )
}

// src/components/ui/SpaceCardActions.tsx (Client Component)
'use client'

import { useState } from 'react'

export function SpaceCardActions({ spaceId }: { spaceId: string }) {
  const [isBookmarked, setIsBookmarked] = useState(false)
  // インタラクティブな処理
}
```

---

## 追記欄

<!-- 新しいパターンはここに追加 -->
