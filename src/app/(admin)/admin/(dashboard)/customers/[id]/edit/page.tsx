import { notFound } from "next/navigation";
import { getCustomerById } from "@/admin/queries/customer";
import { CustomerEditForm } from "../../_components/CustomerEditForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) return {};

  return {
    title: `${customer.lastName} ${customer.firstName} - 顧客編集 | 管理画面`,
  };
}

export default async function CustomerEditPage({ params }: PageProps) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/customers/${id}`}
      backLabel="詳細に戻る"
      title="顧客情報を編集"
      subtitle={`${customer.lastName} ${customer.firstName}`}
    >
      <CustomerEditForm key={customer.id} customer={customer} />
    </AdminDetailLayout>
  );
}
