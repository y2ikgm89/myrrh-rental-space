import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  PublishSwitch,
} from "@/admin/components/ui";
import { toggleTermsActive } from "@/admin/actions/terms";
import { TERMS_TYPES } from "@/shared/lib/validations/terms";
import type { TermsWithVersion } from "@/shared/lib/validations/terms";
import { EmptyState } from "@/admin/components/EmptyState";
import { TermsActionCell } from "./TermsActionCell";

type TermsTableProps = {
  terms: TermsWithVersion[];
};

export function TermsTable({ terms }: TermsTableProps) {
  if (terms.length === 0) {
    return (
      <EmptyState
        message="利用規約がまだ登録されていません"
        action={{ label: "規約を追加", href: "/admin/terms/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>タイトル</TableHead>
            <TableHead className="hidden md:table-cell">スラッグ</TableHead>
            <TableHead className="hidden md:table-cell">バージョン</TableHead>
            <TableHead className="text-center">有効/無効</TableHead>
            <TableHead className="hidden text-right md:table-cell">
              スペース数
            </TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map((term) => {
            const typeLabel =
              TERMS_TYPES.find((t) => t.value === term.type)?.label ??
              String(term.type);
            return (
              <TableRow key={term.id}>
                <TableCell>
                  <div className="font-medium">{term.title}</div>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {typeLabel}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <code className="text-sm text-muted-foreground">
                    {term.slug}
                  </code>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {term.currentVersion ? (
                    <span className="text-sm">
                      v{term.currentVersion.version}
                    </span>
                  ) : (
                    <span className="text-sm text-warning">(未公開)</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <PublishSwitch
                    id={term.id}
                    isPublished={term.isActive}
                    onToggle={toggleTermsActive}
                    label={{ published: "有効", unpublished: "無効" }}
                  />
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  <Badge variant="secondary">{term._count.spaces}件</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <TermsActionCell
                    id={term.id}
                    title={term.title}
                    spacesCount={term._count.spaces}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
