import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { RoleBadge } from "@/admin/components/status-badges";
import { UserActions } from "./UserActions";
import { formatDateShort } from "@/shared/lib/utils";
import type { getUsers } from "@/admin/actions/user";

type StaffUser = Awaited<ReturnType<typeof getUsers>>["users"][number];

type StaffTableProps = {
  users: StaffUser[];
};

export function StaffTable({ users }: StaffTableProps) {
  if (users.length === 0) {
    return <EmptyState message="スタッフが見つかりません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名前</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead className="hidden md:table-cell">予約数</TableHead>
              <TableHead className="hidden md:table-cell">記事数</TableHead>
              <TableHead className="hidden lg:table-cell">登録日</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
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
                <TableCell>
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
