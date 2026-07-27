import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireAdminListPage } from "@/admin/helpers/page-auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタッフ編集 | 管理画面",
};

export default async function EditStaffPage() {
  await connection();
  await requireAdminListPage("user");
  redirect("/admin/staff");
}
