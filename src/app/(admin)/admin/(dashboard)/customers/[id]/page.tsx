import { notFound } from 'next/navigation'
import { getCustomerById } from '@/admin/actions/customer'
import { CustomerDetail } from './_components/CustomerDetail'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const customer = await getCustomerById(id)

  if (!customer) {
    return {
      title: '顧客が見つかりません | Myrrh Rental Space',
    }
  }

  return {
    title: `${customer.lastName} ${customer.firstName} | 顧客管理 | Myrrh Rental Space`,
  }
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params
  const customer = await getCustomerById(id)

  if (!customer) {
    notFound()
  }

  return <CustomerDetail customer={customer} />
}
