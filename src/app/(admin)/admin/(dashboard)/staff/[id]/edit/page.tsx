import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUser } from "@/admin/queries/user";
import { UserForm } from "../../_components/UserForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
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
  await connection();
  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/staff/${user.id}`}
      backLabel="詳細に戻る"
      title="スタッフ情報を編集"
      subtitle={user.email}
    >
      <DetailSection
        title="スタッフ情報"
        description="スタッフ情報を編集します。パスワードを変更しない場合は空欄のままにしてください。"
      >
        <UserForm mode="edit" user={user} />
      </DetailSection>
    </AdminDetailLayout>
  );
}
