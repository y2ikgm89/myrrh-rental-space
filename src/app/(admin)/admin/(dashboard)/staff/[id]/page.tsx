import { notFound } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { deleteUser } from "@/admin/actions/user";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { getUser } from "@/admin/queries/user";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { Button } from "@/admin/components/ui/button";
import { Badge } from "@/admin/components/ui/badge";
import { RoleBadge } from "@/admin/components/status-badges";
import { formatDate } from "@/shared/lib/date-format";
import { canModifyUser } from "@/shared/lib/admin-roles";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser(id);
  if (!user) {
    return { title: "スタッフ詳細 | 管理画面" };
  }
  return {
    title: `${user.name ?? user.email} | スタッフ管理 | Myrrh Rental Space`,
  };
}

export default async function StaffDetailPage({ params }: Props) {
  const { id } = await params;
  const [currentUser, user] = await Promise.all([
    requireAdminPermission("user", "read"),
    getUser(id),
  ]);

  if (!user) {
    notFound();
  }

  const canModifyTarget = canModifyUser(currentUser.role, user.role);
  const canEdit =
    hasPermission(currentUser.role, "user", "update") && canModifyTarget;
  const canDelete =
    currentUser.id !== user.id &&
    hasPermission(currentUser.role, "user", "delete") &&
    canModifyTarget;

  return (
    <AdminDetailLayout
      backHref="/admin/staff"
      title={user.name ?? "(未設定)"}
      subtitle={user.email}
      actions={
        <>
          {canDelete ? (
            <DetailDeleteButton
              itemName={user.name ?? user.email}
              onDelete={deleteUser.bind(null, user.id)}
              redirectTo="/admin/staff"
            />
          ) : null}
          {canEdit ? (
            <Button size="sm" asChild>
              <Link href={`/admin/staff/${user.id}/edit`}>
                <IconPencil className="mr-2 h-4 w-4" />
                編集
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <DetailSection title="基本情報">
          <div className="space-y-4">
            <DetailField label="名前" value={user.name ?? "(未設定)"} />
            <DetailField label="メールアドレス" value={user.email} />
            <DetailField
              label="ロール"
              value={<RoleBadge role={user.role} />}
            />
            <DetailField
              label="認証方式"
              value={<Badge variant="default">Google IAP</Badge>}
            />
            <DetailField
              label="IAP許可"
              value="同じGoogleアカウントをIAP許可グループに追加してください"
            />
          </div>
        </DetailSection>

        <DetailSection title="統計情報">
          <div className="space-y-4">
            <DetailField
              label="予約数"
              value={`${user._count.reservations}件`}
            />
            <DetailField label="投稿数" value={`${user._count.posts}件`} />
            <DetailField
              label="登録日"
              value={formatDate(user.createdAt, true)}
            />
            <DetailField
              label="最終更新"
              value={formatDate(user.updatedAt, true)}
            />
          </div>
        </DetailSection>
      </div>

      {user._count.reservations > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">関連予約</CardTitle>
            <CardDescription>
              このスタッフに関連付けられた予約があります
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href={`/admin/reservations?userId=${user.id}`}>
                予約一覧を表示
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {user._count.posts > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">投稿</CardTitle>
            <CardDescription>
              このスタッフが作成した投稿があります
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href={`/admin/posts?authorId=${user.id}`}>
                記事一覧を表示
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </AdminDetailLayout>
  );
}
