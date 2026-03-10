import { CustomerForm } from "../_components/CustomerForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "新規顧客 | Myrrh Rental Space",
};

export default async function NewCustomerPage() {
  await connection();
  return (
    <AdminDetailLayout
      backHref="/admin/customers"
      title="新規顧客"
      subtitle="新しい顧客情報を登録します"
    >
      <CustomerForm />
    </AdminDetailLayout>
  );
}
