'use client'

import { format } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Switch,
  Badge,
} from '@/admin/components/ui'
import type { BarListProps } from './types'

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; className: string }> = {
    info: { label: 'お知らせ', className: 'bg-primary/10 text-primary' },
    warning: { label: '重要', className: 'bg-warning/10 text-warning' },
    promo: { label: 'キャンペーン', className: 'bg-success/10 text-success' },
  }

  const { label, className } = config[type] || config.info

  return <Badge className={className}>{label}</Badge>
}

export function BarList({
  bars,
  isPending,
  onEdit,
  onCreate,
  onToggleActive,
  onDelete,
}: BarListProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>お知らせバー一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {bars.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              お知らせバーがありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">状態</TableHead>
                  <TableHead className="w-[100px]">タイプ</TableHead>
                  <TableHead>メッセージ</TableHead>
                  <TableHead className="w-[80px]">優先度</TableHead>
                  <TableHead className="w-[150px]">表示期間</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bars.map((bar) => (
                  <TableRow key={bar.id}>
                    <TableCell>
                      <Switch
                        checked={bar.isActive}
                        onCheckedChange={() => onToggleActive(bar.id)}
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={bar.type} />
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {bar.message}
                    </TableCell>
                    <TableCell>{bar.priority}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bar.startAt || bar.endAt ? (
                        <>
                          {bar.startAt && format(new Date(bar.startAt), 'MM/dd HH:mm')}
                          {bar.startAt && bar.endAt && ' 〜 '}
                          {bar.endAt && format(new Date(bar.endAt), 'MM/dd HH:mm')}
                        </>
                      ) : (
                        '常時'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(bar)}
                          disabled={isPending}
                        >
                          編集
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDelete(bar.id)}
                          disabled={isPending}
                        >
                          削除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
