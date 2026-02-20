import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { getCustomerById, deleteCustomer } from "@/admin/actions/customer";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import { Button } from "@/admin/components/ui/button";
import { CustomerDetail } from "./_components/CustomerDetail";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    return {
      title: "顧客が見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${customer.lastName} ${customer.firstName} | 顧客管理 | Myrrh Rental Space`,
  };
}

export default async function CustomerDetailPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/customers"
      title={`${customer.lastName} ${customer.firstName}`}
      subtitle={customer.email}
      actions={
        <Button size="sm" asChild>
          <Link href={`/admin/customers/${customer.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            編集
          </Link>
        </Button>
      }
    >
      <CustomerDetail customer={customer} />
      <DangerZone
        deleteLabel="顧客を削除"
        itemName={`${customer.lastName} ${customer.firstName}`}
        onDelete={deleteCustomer.bind(null, customer.id)}
        redirectTo="/admin/customers"
      />
    </AdminDetailLayout>
  );
}
