import { Suspense } from 'react'
import { getReservations } from '@/actions/admin/reservation'
import { ReservationFilters } from './_components/ReservationFilters'
import { ReservationTable } from './_components/ReservationTable'
import { Pagination } from '@/components/admin/ui'
import type { ReservationStatus } from '@/generated/prisma/client/enums'
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
  const status = params.status as ReservationStatus | 'ALL' | undefined
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
      </div>

      {/* フィルター */}
      <Suspense fallback={<div>読み込み中...</div>}>
        <ReservationFilters />
      </Suspense>

      {/* 予約一覧 */}
      <Suspense
        fallback={
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        }
      >
        <ReservationList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
