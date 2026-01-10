import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/actions/admin/user'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/admin/ui/card'
import { Button } from '@/components/admin/ui/button'
import { UserForm } from '../../_components/user-form'

export const metadata = {
  title: 'ユーザー編集 | 管理画面',
}

type Props = {
  params: Promise<{ id: string }>
}

export default async function EditUserPage({ params }: Props) {
  const { id } = await params
  const user = await getUser(id)

  if (!user) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ユーザー編集</h1>
          <p className="text-muted-foreground">{user.name || user.email}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/admin/users/${user.id}`}>戻る</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ユーザー情報</CardTitle>
          <CardDescription>
            ユーザー情報を編集します。パスワードを変更しない場合は空欄のままにしてください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm mode="edit" user={user} />
        </CardContent>
      </Card>
    </div>
  )
}
