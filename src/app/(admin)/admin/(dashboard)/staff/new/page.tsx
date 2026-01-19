/**
 * スタッフ招待ページ
 *
 * 管理者がメールアドレスを入力して招待メールを送信
 * スタッフ自身がパスワードを設定するフロー
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/admin/components/ui/card'
import Link from 'next/link'
import { Button } from '@/admin/components/ui/button'
import { InviteForm } from '../_components/InviteForm'

export const metadata = {
  title: 'スタッフを招待 | 管理画面',
}

export default function InviteStaffPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">スタッフを招待</h1>
          <p className="text-muted-foreground">メールでスタッフを招待します</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/staff">戻る</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>招待情報</CardTitle>
          <CardDescription>
            招待するスタッフのメールアドレスとロールを入力してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>
    </div>
  )
}
