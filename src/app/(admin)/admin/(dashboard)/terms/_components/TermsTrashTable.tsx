import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { TERMS_TYPE_LABELS } from "@/shared/lib/validations/terms";
import type { AdminTermsListItem } from "@/shared/domain/terms/admin-queries";
import { TermsTrashActionCell } from "./TermsTrashActionCell";
import { formatDateTimeShort } from "@/shared/lib/date-format";

interface TermsTrashTableProps {
  readonly items: AdminTermsListItem[];
}

export function TermsTrashTable({ items }: TermsTrashTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">ゴミ箱は空です</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead>タイプ</TableHead>
              <TableHead className="hidden md:table-cell">スラッグ</TableHead>
              <TableHead className="hidden lg:table-cell">削除日時</TableHead>
              <TableHead className="text-right">同意数</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {TERMS_TYPE_LABELS[item.type] ?? item.type}
                  </Badge>
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                  {item.slug}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {item.deletedAt ? formatDateTimeShort(item.deletedAt) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.agreementsCount}
                </TableCell>
                <TableCell>
                  <TermsTrashActionCell id={item.id} title={item.title} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
