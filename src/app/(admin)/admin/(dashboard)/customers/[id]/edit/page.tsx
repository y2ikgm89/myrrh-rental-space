import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/admin/components/ui'
import { getCustomerById } from '@/admin/actions/customer'
import { CustomerEditForm } from '../../_components/CustomerEditForm'
import type { Metadata } from 'next'
import { headers } from "next/headers";

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const customer = await getCustomerById(id)
  if (!customer) return {}

  return {
    title: `${customer.lastName} ${customer.firstName} - 顧客編集 | 管理画面`,
  }
}

export default async function CustomerEditPage({ params }: PageProps) {
  await headers();
  await connection()

  const { id } = await params
  const customer = await getCustomerById(id)
  if (!customer) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/customers/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            詳細に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">顧客情報を編集</h1>
          <p className="text-muted-foreground">
            {customer.lastName} {customer.firstName}
          </p>
        </div>
      </div>

      <CustomerEditForm customer={customer} />
    </div>
  )
}
