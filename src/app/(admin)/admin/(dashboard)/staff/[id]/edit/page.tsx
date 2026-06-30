import { notFound, redirect } from "next/navigation";
import { getUser } from "@/admin/queries/user";
import { UserForm } from "../../_components/UserForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import {
  canModifyUser,
  getInvitableRoles,
  isDashboardRole,
} from "@/shared/lib/admin-roles";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser(id);
  if (!user) {
    return { title: "スタッフ編集 | 管理画面" };
  }
  return {
    title: `${user.name ?? user.email} 編集 | スタッフ管理 | Myrrh Rental Space`,
  };
}

export default async function EditStaffPage({ params }: Props) {
  const { id } = await params;
  const [currentUser, user] = await Promise.all([
    requireAdminPermission("user", "update"),
    getUser(id),
  ]);

  if (!user) {
    notFound();
  }

  if (!canModifyUser(currentUser.role, user.role)) {
    redirect("/admin/staff");
  }

  const editableRoles = isDashboardRole(currentUser.role)
    ? getInvitableRoles(currentUser.role)
    : [];

  return (
    <AdminDetailLayout
      backHref={`/admin/staff/${user.id}`}
      backLabel="詳細に戻る"
      title="スタッフ情報を編集"
      subtitle={user.email}
    >
      <DetailSection
        title="スタッフ情報"
        description="IAP で許可する Google アカウントのメールアドレスと管理ロールを編集します。"
      >
        <UserForm
          key={user.id}
          mode="edit"
          user={user}
          editableRoles={editableRoles}
        />
      </DetailSection>
    </AdminDetailLayout>
  );
}
