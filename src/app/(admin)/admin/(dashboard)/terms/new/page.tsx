import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { TermsForm } from '../_components/TermsForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '規約作成 | Myrrh Rental Space',
}

export default function NewTermsPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/terms">
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">規約作成</h1>
          <p className="text-muted-foreground">
            新しい利用規約を作成します。作成後、バージョンを追加して公開できます。
          </p>
        </div>
      </div>

      <TermsForm />
    </div>
  )
}
