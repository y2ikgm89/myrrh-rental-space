import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { InviteForm } from "../_components/InviteForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { verifyAdminSession } from "@/shared/lib/admin-auth";
import { getInvitableRoles, isDashboardRole } from "@/shared/lib/admin-roles";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタッフを招待 | 管理画面",
};

export default async function InviteStaffPage() {
  const user = await verifyAdminSession();

  // 招待可能ロールが 0 件（= 招待権限なし）の場合はスタッフ一覧へリダイレクト
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
      title="スタッフを招待"
      subtitle="メールでスタッフを招待します"
    >
      <Card>
        <CardHeader>
          <CardTitle>招待情報</CardTitle>
          <CardDescription>
            招待するスタッフのメールアドレスとロールを入力してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm invitableRoles={invitableRoles} />
        </CardContent>
      </Card>
    </AdminDetailLayout>
  );
}
