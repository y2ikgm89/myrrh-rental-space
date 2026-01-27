import { Suspense } from 'react'
import Link from 'next/link'
import { Calendar, Plus } from 'lucide-react'
import { getReservations } from '@/admin/actions/reservation'
import { ReservationFilters } from './_components/ReservationFilters'
import { ReservationTable } from './_components/ReservationTable'
import { Pagination, Button } from '@/admin/components/ui'
import { LoadingState } from '@/admin/components/LoadingState'
import { parseReservationStatusFilter } from '@/shared/lib/validations/enums'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '予約管理 | Myrrh Rental Space',
}

type SearchParams = Promise<{
  status?: string
  search?: string
  page?: string
}>

type PageProps = {
  searchParams: SearchParams
}

async function ReservationList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = parseReservationStatusFilter(params.status)
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1

  const result = await getReservations(
    { status, search },
    { page, limit: 10 }
  )

  return (
    <>
      <ReservationTable reservations={result.reservations} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}

export default async function ReservationsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">予約管理</h1>
          <p className="text-muted-foreground">
            予約の確認・ステータス変更・キャンセル処理を行います
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/admin/reservations/new">
              <Plus className="mr-2 h-4 w-4" />
              新規予約
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/reservations/calendar">
              <Calendar className="mr-2 h-4 w-4" />
              カレンダー表示
            </Link>
          </Button>
        </div>
      </div>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <ReservationFilters />
      </Suspense>

      {/* 予約一覧 */}
      <Suspense fallback={<LoadingState />}>
        <ReservationList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
