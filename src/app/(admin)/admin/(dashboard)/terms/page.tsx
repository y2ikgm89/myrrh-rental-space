import { Suspense } from 'react'
import Link from 'next/link'
import { getTermsList } from '@/actions/admin/terms'
import { TermsList } from './_components/TermsList'
import { Button } from '@/components/admin/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '利用規約管理 | Myrrh Rental Space',
}

async function TermsContent() {
  const result = await getTermsList()

  if (!result.success) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <p className="text-destructive">{result.error}</p>
      </div>
    )
  }

  return <TermsList terms={result.data ?? []} />
}

export default function TermsPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">利用規約管理</h1>
          <p className="text-muted-foreground">
            スペースに紐づける利用規約を管理します。バージョン管理により変更履歴を追跡できます。
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/terms/new">規約を追加</Link>
        </Button>
      </div>

      {/* 規約一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <TermsContent />
      </Suspense>
    </div>
  )
}
