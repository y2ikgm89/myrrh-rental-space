import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { getUser, deleteUser } from "@/admin/actions/user";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
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
import { Role } from "@/shared/generated/prisma/enums";
import { UserActions } from "../_components/UserActions";

export const metadata = {
  title: "スタッフ詳細 | 管理画面",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StaffDetailPage({ params }: Props) {
  await connection();
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
          <Button size="sm" asChild>
            <Link href={`/admin/staff/${user.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
          <UserActions user={user} />
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                名前
              </dt>
              <dd className="col-span-2">{user.name || "(未設定)"}</dd>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                メールアドレス
              </dt>
              <dd className="col-span-2">{user.email}</dd>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                ロール
              </dt>
              <dd className="col-span-2">
                <RoleBadge role={user.role} />
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                メール認証
              </dt>
              <dd className="col-span-2">
                {user.emailVerified ? (
                  <Badge variant="default">認証済み</Badge>
                ) : (
                  <Badge variant="secondary">未認証</Badge>
                )}
              </dd>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>統計情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                予約数
              </dt>
              <dd className="col-span-2">{user._count.reservations}件</dd>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                投稿数
              </dt>
              <dd className="col-span-2">{user._count.posts}件</dd>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                登録日
              </dt>
              <dd className="col-span-2">{formatDate(user.createdAt, true)}</dd>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-muted-foreground">
                最終更新
              </dt>
              <dd className="col-span-2">{formatDate(user.updatedAt, true)}</dd>
            </div>
          </CardContent>
        </Card>
      </div>

      {user._count.reservations > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>関連予約</CardTitle>
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
            <CardTitle>投稿</CardTitle>
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

      <DangerZone
        deleteLabel="スタッフを削除"
        itemName={user.name ?? user.email}
        onDelete={() => deleteUser(user.id)}
        redirectTo="/admin/staff"
      />
    </AdminDetailLayout>
  );
}

function RoleBadge({ role }: { role: Role }) {
  switch (role) {
    case "ADMIN":
      return <Badge variant="default">管理者</Badge>;
    case "USER":
      return <Badge variant="secondary">スタッフ</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}
