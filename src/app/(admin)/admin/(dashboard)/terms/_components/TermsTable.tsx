import {
  Badge,
  PublishSwitch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { TERMS_TYPE_LABELS } from "@/shared/lib/validations/terms";
import type { AdminTermsListItem } from "@/shared/domain/terms/admin-queries";
import { updateTermsPublished } from "@/admin/actions/terms";
import { TermsActionCell } from "./TermsActionCell";

interface TermsTableProps {
  readonly items: AdminTermsListItem[];
}

export function TermsTable({ items }: TermsTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          まだ規約が登録されていません
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead>タイプ</TableHead>
              <TableHead>スラッグ</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>同意必須</TableHead>
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
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {item.slug}
                </TableCell>
                <TableCell>
                  <PublishSwitch
                    id={item.id}
                    isPublished={item.isPublished}
                    onToggle={updateTermsPublished}
                    resourceLabel={`${item.title} の公開状態`}
                    label={{ published: "公開中", unpublished: "下書き" }}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {item.requiredAtReservation && (
                      <Badge variant="outline" className="text-xs">
                        予約
                      </Badge>
                    )}
                    {item.requiredAtInquiry && (
                      <Badge variant="outline" className="text-xs">
                        問合せ
                      </Badge>
                    )}
                    {item.requiredAtSignup && (
                      <Badge variant="outline" className="text-xs">
                        登録
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.agreementsCount}
                </TableCell>
                <TableCell>
                  <TermsActionCell id={item.id} title={item.title} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
