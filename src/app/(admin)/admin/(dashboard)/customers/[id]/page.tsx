import { notFound } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { getCustomerById } from "@/admin/queries/customer";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { Button } from "@/admin/components/ui/button";
import { CustomerDetail } from "./_components/CustomerDetail";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { deleteCustomer } from "@/admin/actions/customer";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
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
        <>
          <DetailDeleteButton
            itemName={`${customer.lastName} ${customer.firstName}`}
            onDelete={deleteCustomer.bind(null, customer.id)}
            redirectTo="/admin/customers"
            successMessage="顧客を削除しました"
          />
          <Button size="sm" asChild>
            <Link href={`/admin/customers/${customer.id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <CustomerDetail customer={customer} />
    </AdminDetailLayout>
  );
}
