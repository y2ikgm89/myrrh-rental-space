import { connection } from "next/server";
import { getUserStats } from "@/admin/queries/user";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";

export async function StaffStats() {
  await connection();
  const stats = await getUserStats();

  return (
    <div className="grid gap-4 grid-cols-1 @sm/main:grid-cols-2 @3xl/main:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">総スタッフ数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">管理者以上</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.superAdmins + stats.admins}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">編集・閲覧</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.editors + stats.viewers}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            新規（30日以内）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.recentStaff}</div>
        </CardContent>
      </Card>
    </div>
  );
}
