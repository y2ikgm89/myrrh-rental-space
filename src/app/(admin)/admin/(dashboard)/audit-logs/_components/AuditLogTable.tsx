import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { AuditActionBadge } from "@/admin/components/status-badges";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { isRecord } from "@/shared/lib/serialize";
import type { AuditLogItem } from "@/shared/domain/audit-log/queries";

type AuditLogTableProps = {
  logs: AuditLogItem[];
};

export function AuditLogTable({ logs }: AuditLogTableProps) {
  if (logs.length === 0) {
    return <EmptyState message="ログが見つかりません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日時</TableHead>
              <TableHead>ユーザー</TableHead>
              <TableHead>アクション</TableHead>
              <TableHead>リソース</TableHead>
              <TableHead className="hidden md:table-cell">リソースID</TableHead>
              <TableHead className="hidden lg:table-cell">IPアドレス</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDateTimeShort(log.createdAt)}
                </TableCell>
                <TableCell>
                  {log.user?.name ?? log.user?.email ?? "(システム)"}
                </TableCell>
                <TableCell>
                  <AuditActionBadge action={log.action} />
                </TableCell>
                <TableCell>{log.resource}</TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs">
                  {log.resourceId?.slice(0, 8) ?? "-"}
                </TableCell>
                <TableCell className="hidden lg:table-cell font-mono text-xs">
                  {isRecord(log.metadata) &&
                  typeof log.metadata["ipAddress"] === "string"
                    ? log.metadata["ipAddress"]
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
