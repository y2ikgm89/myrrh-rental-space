import { LocationForm } from "../_components/LocationForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "場所新規作成 | Myrrh Rental Space",
};

export default async function NewLocationPage() {
  await connection();
  return (
    <AdminDetailLayout
      backHref="/admin/spaces?tab=locations"
      title="場所新規作成"
      subtitle="新しい場所（建物・施設）を作成します"
    >
      <LocationForm mode="create" />
    </AdminDetailLayout>
  );
}

