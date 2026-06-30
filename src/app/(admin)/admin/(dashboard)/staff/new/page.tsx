import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { UserForm } from "../_components/UserForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { getInvitableRoles, isDashboardRole } from "@/shared/lib/admin-roles";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタッフを追加 | 管理画面",
};

export default async function NewStaffPage() {
  const user = await requireAdminPermission("user", "create");

  // 付与可能ロールが 0 件（= 追加権限なし）の場合はスタッフ一覧へリダイレクト
  if (!isDashboardRole(user.role)) {
    redirect("/admin/staff");
  }
  const invitableRoles = getInvitableRoles(user.role);
  if (invitableRoles.length === 0) {
    redirect("/admin/staff");
  }

  return (
    <AdminDetailLayout
      backHref="/admin/staff"
      title="スタッフを追加"
      subtitle="Google アカウントのメールアドレスを登録し、IAP 側の許可と合わせて管理アクセスを付与します"
    >
      <Card>
        <CardHeader>
          <CardTitle>スタッフ情報</CardTitle>
          <CardDescription>
            登録後、管理画面の案内メールを送信します。アプリ用パスワードは発行しません
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm mode="create" editableRoles={invitableRoles} />
        </CardContent>
      </Card>
    </AdminDetailLayout>
  );
}
