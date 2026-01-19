import { Suspense } from 'react'
import { getUsers, getUserStats } from '@/admin/actions/user'
import { getPendingInvitations } from '@/admin/actions/staff-invitation'
import { loadAdminUserSearchParams } from '@/shared/lib/nuqs'
import { Card, CardContent, CardHeader, CardTitle } from '@/admin/components/ui/card'
import { Button } from '@/admin/components/ui/button'
import { Input } from '@/admin/components/ui/input'
import { Badge } from '@/admin/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui/select'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Role, getRoleFilterOrAll } from '@/shared/lib/validations/enums'
import { UserActions } from './_components/UserActions'
import { Pagination } from '@/admin/components/ui'
import { InvitationActions } from './_components/InvitationActions'
// URLパラメータのバリデーション用型
type SortBy = 'name' | 'email' | 'role' | 'createdAt'
type SortOrder = 'asc' | 'desc'

const VALID_SORT_BY: readonly SortBy[] = ['name', 'email', 'role', 'createdAt']
const VALID_SORT_BY_SET = new Set<string>(VALID_SORT_BY)

// 型安全なバリデーション関数（Set-based O(1) lookup）
function isValidSortBy(value: string): value is SortBy {
  return VALID_SORT_BY_SET.has(value)
}

function validateSortBy(value: string): SortBy {
  return isValidSortBy(value) ? value : 'createdAt'
}

function validateSortOrder(value: string): SortOrder {
  return value === 'asc' || value === 'desc' ? value : 'desc'
}

export const metadata = {
  title: 'スタッフ管理 | 管理画面',
}

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function StaffPage({ searchParams }: Props) {
  const params = await loadAdminUserSearchParams(searchParams)

  const validatedRole = getRoleFilterOrAll(params.role)
  const validatedSortBy = validateSortBy(params.sortBy)
  const validatedSortOrder = validateSortOrder(params.sortOrder)

  const [result, stats, pendingInvitations] = await Promise.all([
    getUsers({
      page: params.page,
      perPage: params.perPage,
      search: params.search || undefined,
      role: validatedRole,
      sortBy: validatedSortBy,
      sortOrder: validatedSortOrder,
    }),
    getUserStats(),
    getPendingInvitations(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">スタッフ管理</h1>
          <p className="text-muted-foreground">管理画面にアクセスできるスタッフアカウントを管理</p>
        </div>
        <Button asChild>
          <Link href="/admin/staff/new">スタッフを招待</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総スタッフ数</CardTitle>
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
            <CardTitle className="text-sm font-medium">一般スタッフ</CardTitle>
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

      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              招待中
              <Badge variant="secondary">{pendingInvitations.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>メールアドレス</TableHead>
                    <TableHead>名前</TableHead>
                    <TableHead>ロール</TableHead>
                    <TableHead>有効期限</TableHead>
                    <TableHead>招待日</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>{invitation.email}</TableCell>
                      <TableCell>{invitation.name || '(未設定)'}</TableCell>
                      <TableCell>
                        <RoleBadge role={invitation.role} />
                      </TableCell>
                      <TableCell>
                        {format(invitation.expiresAt, 'yyyy/MM/dd HH:mm', { locale: ja })}
                      </TableCell>
                      <TableCell>
                        {format(invitation.createdAt, 'yyyy/MM/dd', { locale: ja })}
                      </TableCell>
                      <TableCell>
                        <InvitationActions invitation={invitation} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>スタッフ一覧</CardTitle>
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
                      スタッフが見つかりません
                    </TableCell>
                  </TableRow>
                ) : (
                  result.users.map((user: (typeof result.users)[number]) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Link
                          href={`/admin/staff/${user.id}`}
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
  const variants: Record<Role, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    SUPER_ADMIN: 'destructive',
    ADMIN: 'default',
    EDITOR: 'secondary',
    VIEWER: 'outline',
    USER: 'outline',
  }

  const labels: Record<Role, string> = {
    SUPER_ADMIN: 'スーパー管理者',
    ADMIN: '管理者',
    EDITOR: '編集者',
    VIEWER: '閲覧者',
    USER: 'ユーザー',
  }

  return <Badge variant={variants[role]}>{labels[role]}</Badge>
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
          <SelectItem value="SUPER_ADMIN">スーパー管理者</SelectItem>
          <SelectItem value="ADMIN">管理者</SelectItem>
          <SelectItem value="EDITOR">編集者</SelectItem>
          <SelectItem value="VIEWER">閲覧者</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" variant="secondary">
        検索
      </Button>
    </form>
  )
}
