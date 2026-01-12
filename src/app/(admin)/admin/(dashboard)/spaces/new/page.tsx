import Link from 'next/link'
import { SpaceForm } from '../_components/SpaceForm'
import { Button } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'スペース新規作成 | Myrrh Rental Space',
}

export default function NewSpacePage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/spaces">← 戻る</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">スペース新規作成</h1>
          <p className="text-muted-foreground">
            新しいスペースを作成します
          </p>
        </div>
      </div>

      {/* フォーム */}
      <SpaceForm mode="create" />
    </div>
  )
}
