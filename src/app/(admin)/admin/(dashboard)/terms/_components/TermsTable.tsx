import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { TERMS_TYPES } from "@/shared/lib/validations/terms";
import type { TermsWithVersion } from "@/shared/lib/validations/terms";
import { TermsActiveSwitch } from "./TermsActiveSwitch";
import { TermsActionCell } from "./TermsActionCell";
import { TermsTypeSelectDialog } from "./TermsTypeSelectDialog";

type TermsTableProps = {
  terms: TermsWithVersion[];
};

export function TermsTable({ terms }: TermsTableProps) {
  if (terms.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-muted-foreground">
          利用規約がまだ登録されていません
        </p>
        <div className="mt-4">
          <TermsTypeSelectDialog />
        </div>
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
              <TableHead className="hidden md:table-cell">スラッグ</TableHead>
              <TableHead className="hidden md:table-cell">バージョン</TableHead>
              <TableHead className="text-center">有効/無効</TableHead>
              <TableHead className="hidden md:table-cell">予約時必須</TableHead>
              <TableHead className="hidden md:table-cell">フッター</TableHead>
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
                    <TermsActiveSwitch id={term.id} isActive={term.isActive} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {term.requiredAtReservation && (
                      <Badge variant="success">必須</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {term.showInFooter && <Badge variant="default">表示</Badge>}
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
    </div>
  );
}
