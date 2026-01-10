import { Suspense } from 'react'
import { getUsers, getUserStats } from '@/actions/admin/user'
import { parseAsInteger, parseAsString, createSearchParamsCache } from 'nuqs/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Badge } from '@/components/admin/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Role } from '@/generated/prisma/client/enums'
import { UserActions } from './_components/user-actions'
import { Pagination } from '@/components/admin/ui'

export const metadata = {
  title: 'ユーザー管理 | 管理画面',
}

const searchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(20),
  search: parseAsString.withDefault(''),
  role: parseAsString.withDefault('ALL'),
  sortBy: parseAsString.withDefault('createdAt'),
  sortOrder: parseAsString.withDefault('desc'),
})

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function UsersPage({ searchParams }: Props) {
  const params = await searchParamsCache.parse(searchParams)

  const [result, stats] = await Promise.all([
    getUsers({
      page: params.page,
      perPage: params.perPage,
      search: params.search || undefined,
      role: params.role as Role | 'ALL',
      sortBy: params.sortBy as 'name' | 'email' | 'role' | 'createdAt',
      sortOrder: params.sortOrder as 'asc' | 'desc',
    }),
    getUserStats(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ユーザー管理</h1>
          <p className="text-muted-foreground">管理者とユーザーアカウントを管理</p>
        </div>
        <Button asChild>
          <Link href="/admin/users/new">新規ユーザー</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総ユーザー数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">管理者</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.admins}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">一般ユーザー</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">新規（30日以内）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentUsers}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ユーザー一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div>読み込み中...</div>}>
            <UserFilters
              search={params.search}
              role={params.role}
            />
          </Suspense>

          <div className="mt-4 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead>メールアドレス</TableHead>
                  <TableHead>ロール</TableHead>
                  <TableHead>予約数</TableHead>
                  <TableHead>記事数</TableHead>
                  <TableHead>登録日</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      ユーザーが見つかりません
                    </TableCell>
                  </TableRow>
                ) : (
                  result.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="font-medium hover:underline"
                        >
                          {user.name || '(未設定)'}
                        </Link>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell>{user._count.reservations}</TableCell>
                      <TableCell>{user._count.blogPosts}</TableCell>
                      <TableCell>
                        {format(user.createdAt, 'yyyy/MM/dd', { locale: ja })}
                      </TableCell>
                      <TableCell>
                        <UserActions user={user} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {result.totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                currentPage={result.page}
                totalPages={result.totalPages}
                total={result.total}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RoleBadge({ role }: { role: Role }) {
  switch (role) {
    case 'ADMIN':
      return <Badge variant="default">管理者</Badge>
    case 'USER':
      return <Badge variant="secondary">ユーザー</Badge>
    default:
      return <Badge variant="outline">{role}</Badge>
  }
}

function UserFilters({ search, role }: { search: string; role: string }) {
  return (
    <form className="flex gap-4">
      <Input
        name="search"
        placeholder="名前またはメールアドレスで検索..."
        defaultValue={search}
        className="max-w-sm"
      />
      <Select name="role" defaultValue={role}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="ロール" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">すべて</SelectItem>
          <SelectItem value="ADMIN">管理者</SelectItem>
          <SelectItem value="USER">ユーザー</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" variant="secondary">
        検索
      </Button>
    </form>
  )
}
