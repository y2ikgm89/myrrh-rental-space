import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getReservationById } from '@/admin/actions/reservation'
import { ReservationDetail } from './_components/ReservationDetail'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const reservation = await getReservationById(id)

  if (!reservation) {
    return { title: '予約が見つかりません | Myrrh Rental Space' }
  }

  return {
    title: `予約詳細: ${reservation.customer.lastName}${reservation.customer.firstName} | Myrrh Rental Space`,
  }
}

export default async function ReservationDetailPage({ params }: PageProps) {
  const { id } = await params
  const reservation = await getReservationById(id)

  if (!reservation) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/reservations">
              <ArrowLeft className="mr-2 h-4 w-4" />
              一覧に戻る
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">予約詳細</h1>
            <p className="text-muted-foreground">
              ID: {reservation.id.slice(0, 8)}...
            </p>
          </div>
        </div>
      </div>

      {/* 詳細コンテンツ */}
      <ReservationDetail reservation={reservation} />
    </div>
  )
}
