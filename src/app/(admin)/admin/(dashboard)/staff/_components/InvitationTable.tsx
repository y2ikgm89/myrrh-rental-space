import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { RoleBadge } from "@/admin/components/status-badges";
import { InvitationActions } from "./InvitationActions";
import type { InvitationData } from "@/shared/domain/staff-invitations/types";
import { formatDateTimeShort, formatDateShort } from "@/shared/lib/utils";

type InvitationTableProps = {
  invitations: InvitationData[];
};

export function InvitationTable({ invitations }: InvitationTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">招待中</span>
        <Badge variant="secondary">{invitations.length}</Badge>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>メールアドレス</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>ロール</TableHead>
                <TableHead className="hidden md:table-cell">有効期限</TableHead>
                <TableHead className="hidden md:table-cell">招待日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{invitation.name ?? "(未設定)"}</TableCell>
                  <TableCell>
                    <RoleBadge role={invitation.role} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDateTimeShort(invitation.expiresAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatDateShort(invitation.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <InvitationActions invitation={invitation} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
