import { Fragment } from "react";
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
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { isRecord } from "@/shared/lib/serialize";
import type { AuditLogItem } from "@/shared/domain/audit-log/queries";

type AuditLogTableProps = {
  logs: AuditLogItem[];
};

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "-";
  return JSON.stringify(value, null, 2);
}

function AuditJsonPreview({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}...`;
}

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
              <TableHead className="hidden xl:table-cell">Seq</TableHead>
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
              <Fragment key={log.id}>
                <TableRow>
                  <TableCell className="hidden font-mono text-xs xl:table-cell">
                    {log.sequence}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTimeShort(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    {log.user?.name ?? log.user?.email ?? "(システム)"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <AuditActionBadge action={log.action} />
                  </TableCell>
                  <TableCell>{log.resource}</TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {log.resourceId?.slice(0, 8) ?? "-"}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">
                    {isRecord(log.metadata) &&
                    typeof log.metadata["ipAddress"] === "string"
                      ? log.metadata["ipAddress"]
                      : "-"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/20 p-0">
                    <details className="group">
                      <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                        詳細を表示
                      </summary>
                      <div className="grid gap-3 border-t px-4 py-4 lg:grid-cols-3">
                        <div className="lg:col-span-3">
                          <span className="text-xs font-medium text-muted-foreground">
                            完全なリソースID:
                          </span>{" "}
                          <span className="font-mono text-xs">
                            {log.resourceId ?? "-"}
                          </span>
                        </div>
                        <div className="grid gap-2 rounded-md border bg-background p-3 font-mono text-xs lg:col-span-3">
                          <div>
                            <span className="text-muted-foreground">
                              sequence:
                            </span>{" "}
                            {log.sequence}
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              previousHash:
                            </span>{" "}
                            <span title={log.previousHash}>
                              {shortHash(log.previousHash)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              entryHash:
                            </span>{" "}
                            <span title={log.entryHash}>
                              {shortHash(log.entryHash)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">hash:</span>{" "}
                            {log.hashAlgorithm} / {log.hashKeyId} / v
                            {log.chainVersion}
                          </div>
                        </div>
                        <AuditJsonPreview label="旧値" value={log.oldValue} />
                        <AuditJsonPreview label="新値" value={log.newValue} />
                        <AuditJsonPreview
                          label="メタデータ"
                          value={log.metadata}
                        />
                      </div>
                    </details>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
