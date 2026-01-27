import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getCustomers } from '@/admin/actions/customer'
import { CustomerFilters } from './_components/CustomerFilters'
import { CustomerTable } from './_components/CustomerTable'
import { Pagination, Button } from '@/admin/components/ui'
import { LoadingState } from '@/admin/components/LoadingState'
import { parseCustomerStatusFilter } from '@/shared/lib/validations/enums'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '顧客管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  status?: string
  search?: string
  page?: string
}>

type PageProps = {
  searchParams: SearchParams
}

async function CustomerList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = parseCustomerStatusFilter(params.status)
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1

  const result = await getCustomers({ status, search }, { page, limit: 10 })

  return (
    <>
      <CustomerTable customers={result.customers} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}

export default async function CustomersPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">顧客管理</h1>
          <p className="text-muted-foreground">
            顧客情報の確認・ステータス管理を行います
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/customers/new">
            <Plus className="mr-2 h-4 w-4" />
            新規顧客
          </Link>
        </Button>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <CustomerFilters />
      </Suspense>

      {/* 顧客一覧 */}
      <Suspense fallback={<LoadingState />}>
        <CustomerList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
