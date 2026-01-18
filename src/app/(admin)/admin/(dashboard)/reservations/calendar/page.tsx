import { Suspense } from 'react'
import Link from 'next/link'
import { List } from 'lucide-react'
import {
  getReservationsForCalendar,
  getSpacesForCalendar,
} from '@/admin/actions/reservation'
import { getCalendarDateRange, getValidCalendarView } from '@/admin/lib/calendar'
import { getReservationStatusFilterOrAll } from '@/shared/lib/validations/enums'
import { CalendarViewWrapper } from '../_components/calendar'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '予約カレンダー | Myrrh Rental Space',
}

type SearchParams = Promise<{
  view?: string
  date?: string
  spaceId?: string
  status?: string
}>

interface PageProps {
  searchParams: SearchParams
}

function CalendarSkeleton() {
  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
      <div className="flex-1 animate-pulse rounded-lg bg-gray-100" />
    </div>
  )
}

async function CalendarData({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const view = getValidCalendarView(params.view, 'week')
  const date = params.date ? new Date(params.date) : new Date()
  const spaceId = params.spaceId || undefined
  const status = getReservationStatusFilterOrAll(params.status)

  const dateRange = getCalendarDateRange(date, view)

  const [events, spaces] = await Promise.all([
    getReservationsForCalendar(dateRange.start, dateRange.end, spaceId, status),
    getSpacesForCalendar(),
  ])

  return <CalendarViewWrapper initialEvents={events} spaces={spaces} />
}

export default async function ReservationCalendarPage({
  searchParams,
}: PageProps) {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">予約カレンダー</h1>
          <p className="text-muted-foreground">
            予約をカレンダー形式で確認・管理します
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/reservations">
            <List className="mr-2 h-4 w-4" />
            リスト表示
          </Link>
        </Button>
      </div>

      {/* カレンダー */}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<CalendarSkeleton />}>
          <CalendarData searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
