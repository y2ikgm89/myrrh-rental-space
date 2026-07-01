import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタッフ追加 | 管理画面",
};

export default async function NewStaffPage() {
  await connection();
  await requireAdminPermission("user", "read");
  redirect("/admin/staff");
}
