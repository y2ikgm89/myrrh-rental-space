import { Suspense } from 'react'
import { loadAdminAuditLogSearchParams } from '@/shared/lib/nuqs'
import { Card, CardContent, CardHeader, CardTitle } from '@/admin/components/ui/card'
import { Badge } from '@/admin/components/ui/badge'
import { LoadingState } from '@/admin/components/LoadingState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui/table'
import { Pagination } from '@/admin/components/ui'
import { getAuditLogs, getAuditLogStats } from '@/admin/actions/audit-log'
import { formatDateTimeShort } from '@/shared/lib/utils'
import { AuditAction, getAuditActionFilterOrAll } from '@/shared/lib/validations/enums'
import { AuditLogFilters } from './_components/AuditLogFilters'

export const metadata = {
  title: '監査ログ | 管理画面',
}

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AuditLogsPage({ searchParams }: Props) {
  const params = await loadAdminAuditLogSearchParams(searchParams)

  const [logsResult, statsResult] = await Promise.all([
    getAuditLogs({
      page: params.page,
      perPage: params.perPage,
      action: getAuditActionFilterOrAll(params.action),
      resource: params.resource || undefined,
      userId: params.userId || undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
    }),
    getAuditLogStats(),
  ])

  const logs = logsResult.success && 'data' in logsResult ? logsResult.data : { logs: [], total: 0, page: 1, totalPages: 1 }
  const stats = statsResult.success && 'data' in statsResult ? statsResult.data : { total: 0, today: 0, securityEvents: 0, byAction: {} }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">監査ログ</h1>
        <p className="text-muted-foreground">システム操作の履歴を確認</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総ログ数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本日</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">セキュリティイベント</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.securityEvents.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">作成操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats.byAction.CREATE ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ログ一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LoadingState variant="inline" />}>
            <AuditLogFilters />
          </Suspense>

          <div className="mt-4 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日時</TableHead>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>アクション</TableHead>
                  <TableHead>リソース</TableHead>
                  <TableHead>リソースID</TableHead>
                  <TableHead>IPアドレス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      ログが見つかりません
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.logs.map((log: (typeof logs.logs)[number]) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTimeShort(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        {log.user?.name || log.user?.email || '(システム)'}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={log.action} />
                      </TableCell>
                      <TableCell>{log.resource}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.resourceId?.slice(0, 8) || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.metadata?.ipAddress || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {logs.totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                currentPage={logs.page}
                totalPages={logs.totalPages}
                total={logs.total}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ActionBadge({ action }: { action: AuditAction }) {
  const variants: Record<AuditAction, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    CREATE: 'default',
    UPDATE: 'secondary',
    DELETE: 'destructive',
    PUBLISH: 'default',
    UNPUBLISH: 'outline',
    LOGIN_SUCCESS: 'default',
    LOGIN_FAILED: 'destructive',
    PERMISSION_DENIED: 'destructive',
    PASSWORD_CHANGE: 'secondary',
    ROLE_CHANGE: 'secondary',
  }

  const labels: Record<AuditAction, string> = {
    CREATE: '作成',
    UPDATE: '更新',
    DELETE: '削除',
    PUBLISH: '公開',
    UNPUBLISH: '非公開',
    LOGIN_SUCCESS: 'ログイン成功',
    LOGIN_FAILED: 'ログイン失敗',
    PERMISSION_DENIED: '権限拒否',
    PASSWORD_CHANGE: 'パスワード変更',
    ROLE_CHANGE: 'ロール変更',
  }

  return <Badge variant={variants[action]}>{labels[action]}</Badge>
}
