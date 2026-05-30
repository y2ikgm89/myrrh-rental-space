"use client";

import { formatMonthDayTime } from "@/shared/lib/date-format";
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
} from "@/admin/components/ui";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import type { BarListProps } from "./types";

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
        <Button onClick={onCreate}>新規作成</Button>
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
                        onCheckedChange={(checked) =>
                          onToggleActive(bar.id, checked)
                        }
                        disabled={isPending}
                      />
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      <span className="inline-flex items-center gap-1.5">
                        <PortableTextSpans
                          spans={bar.message}
                          iconClassName="h-4 w-4"
                        />
                      </span>
                    </TableCell>
                    <TableCell>{bar.priority}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {bar.startAt || bar.endAt ? (
                        <>
                          {bar.startAt && formatMonthDayTime(bar.startAt)}
                          {bar.startAt && bar.endAt && " 〜 "}
                          {bar.endAt && formatMonthDayTime(bar.endAt)}
                        </>
                      ) : (
                        "常時"
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
                          variant="destructive-ghost"
                          size="sm"
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
  );
}
