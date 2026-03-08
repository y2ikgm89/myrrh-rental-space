import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { InviteForm } from "../_components/InviteForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタッフを招待 | 管理画面",
};

export default async function InviteStaffPage() {
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
          <InviteForm />
        </CardContent>
      </Card>
    </AdminDetailLayout>
  );
}

