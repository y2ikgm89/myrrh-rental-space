import { notFound } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { deleteUser } from "@/admin/actions/user";
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
import { formatDate } from "@/shared/lib/utils";
import { Role } from "@generated/prisma/enums";
import { UserActions } from "../_components/UserActions";
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
  const user = await getUser(id);

  if (!user) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/staff"
      title={user.name ?? "(未設定)"}
      subtitle={user.email}
      actions={
        <>
          <DetailDeleteButton
            itemName={user.name ?? user.email}
            onDelete={deleteUser.bind(null, user.id)}
            redirectTo="/admin/staff"
          />
          <Button size="sm" asChild>
            <Link href={`/admin/staff/${user.id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
          <UserActions user={user} />
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
              label="メール認証"
              value={
                user.emailVerified ? (
                  <Badge variant="default">認証済み</Badge>
                ) : (
                  <Badge variant="secondary">未認証</Badge>
                )
              }
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

function RoleBadge({ role }: { role: Role }) {
  switch (role) {
    case Role.SUPER_ADMIN:
      return <Badge variant="default">スーパー管理者</Badge>;
    case Role.ADMIN:
      return <Badge variant="default">管理者</Badge>;
    case Role.USER:
      return <Badge variant="secondary">スタッフ</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}
