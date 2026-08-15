import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { requireStaffDetailPage } from "@/admin/helpers/page-auth";
import { getUser } from "@/admin/queries/user";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { Button } from "@/admin/components/ui/button";
import { RoleBadge } from "@/admin/components/status-badges";
import { AssignedPagesSection } from "../_components/AssignedPagesSection";
import { formatDate } from "@/shared/lib/date-format";
import { getActivePagesForAssignmentPickerQuery } from "@/shared/domain/pages/admin-queries";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();

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
  await connection();

  const { id } = await params;
  const [currentUser, user] = await Promise.all([
    requireStaffDetailPage(id),
    getUser(id),
  ]);

  if (!user) {
    notFound();
  }

  const canEditAssignments = hasPermission(currentUser.role, "user", "update");
  const [assignedPageIds, activePages] =
    user.role === Role.EDITOR
      ? await Promise.all([
          getAssignedPageIdsForUser(user.id),
          getActivePagesForAssignmentPickerQuery(),
        ])
      : [[], []];

  return (
    <AdminDetailLayout
      backHref="/admin/staff"
      title={user.name ?? "(未設定)"}
      subtitle={user.email}
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
              label="ダッシュボード"
              value={user.dashboardEnabled ? "有効" : "無効（グループ未所属）"}
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

      {user.role === Role.EDITOR && (
        <AssignedPagesSection
          key={assignedPageIds.join(",")}
          userId={user.id}
          pages={activePages}
          assignedPageIds={assignedPageIds}
          canEdit={canEditAssignments}
        />
      )}

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
