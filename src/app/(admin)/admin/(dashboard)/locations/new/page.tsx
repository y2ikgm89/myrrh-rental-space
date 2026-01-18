import Link from 'next/link'
import { LocationForm } from '../_components/LocationForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '場所新規作成 | Myrrh Rental Space',
}

export default function NewLocationPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/locations">← 戻る</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">場所新規作成</h1>
          <p className="text-muted-foreground">
            新しい場所（建物・施設）を作成します
          </p>
        </div>
      </div>

      {/* フォーム */}
      <LocationForm mode="create" />
    </div>
  )
}
