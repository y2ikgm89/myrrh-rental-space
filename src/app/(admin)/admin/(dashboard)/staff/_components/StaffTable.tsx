import Link from "next/link";
import { Table, TableBody, TableCell, TableRow } from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { RoleBadge } from "@/admin/components/status-badges";
import { UserActions } from "./UserActions";
import { StaffTableHeader } from "./StaffTableHeader";
import type { UserData } from "@/shared/domain/users/types";
import { formatDateShort } from "@/shared/lib/utils";

type StaffTableProps = {
  users: UserData[];
};

export function StaffTable({ users }: StaffTableProps) {
  if (users.length === 0) {
    return <EmptyState message="スタッフが見つかりません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <StaffTableHeader />
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Link
                    href={`/admin/staff/${user.id}`}
                    className="font-medium hover:underline"
                  >
                    {user.name ?? "(未設定)"}
                  </Link>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <RoleBadge role={user.role} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {user._count.reservations}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {user._count.posts}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {formatDateShort(user.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <UserActions user={user} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
