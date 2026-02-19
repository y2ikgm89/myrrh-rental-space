import { notFound } from "next/navigation";
import { getUser } from "@/admin/actions/user";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { UserForm } from "../../_components/UserForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { connection } from "next/server";

export const metadata = {
  title: "スタッフ編集 | 管理画面",
};

type Props = {
  params: Promise<{ id: string }>;
};

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
      <Card>
        <CardHeader>
          <CardTitle>スタッフ情報</CardTitle>
          <CardDescription>
            スタッフ情報を編集します。パスワードを変更しない場合は空欄のままにしてください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm mode="edit" user={user} />
        </CardContent>
      </Card>
    </AdminDetailLayout>
  );
}
