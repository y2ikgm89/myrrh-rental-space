import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { getCustomerById } from "@/admin/queries/customer";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { Button } from "@/admin/components/ui/button";
import { CustomerDetail } from "./_components/CustomerDetail";
import { CustomerDetailActions } from "./_components/CustomerDetailActions";
import { AnonymizeCustomerButton } from "./_components/AnonymizeCustomerButton";
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
        <>
          <AnonymizeCustomerButton
            customerId={customer.id}
            displayName={`${customer.lastName} ${customer.firstName}`}
            redirectTo="/admin/customers"
          />
          <CustomerDetailActions
            key={customer.id}
            customer={{
              id: customer.id,
              lastName: customer.lastName,
              firstName: customer.firstName,
              email: customer.email,
              flagReasons: customer.flagReasons,
            }}
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
      <CustomerDetail key={customer.id} customer={customer} />
    </AdminDetailLayout>
  );
}
