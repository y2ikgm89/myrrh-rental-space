import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/admin/ui/card'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import { UserForm } from '../_components/user-form'

export const metadata = {
  title: '新規ユーザー | 管理画面',
}

export default function NewUserPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">新規ユーザー</h1>
          <p className="text-muted-foreground">新しいユーザーアカウントを作成</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/users">戻る</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ユーザー情報</CardTitle>
          <CardDescription>
            新しいユーザーの情報を入力してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm mode="create" />
        </CardContent>
      </Card>
    </div>
  )
}
