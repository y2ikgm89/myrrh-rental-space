import { TermsForm } from '../_components/TermsForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '規約作成 | Myrrh Rental Space',
}

export default function NewTermsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">規約作成</h1>
        <p className="text-muted-foreground">
          新しい利用規約を作成します。作成後、バージョンを追加して公開できます。
        </p>
      </div>

      <TermsForm />
    </div>
  )
}
