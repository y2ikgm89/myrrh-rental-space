import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getReservationById, getSpacesForReservation } from '@/admin/actions/reservation'
import { ReservationEditForm } from '../../_components/ReservationEditForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

type PageProps = {
  params: Params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { id } = await params
  const reservation = await getReservationById(id)

  if (!reservation) {
    return { title: '予約が見つかりません | Myrrh Rental Space' }
  }

  return {
    title: `予約編集: ${reservation.customer.lastName}${reservation.customer.firstName} | Myrrh Rental Space`,
  }
}

export default async function ReservationEditPage({ params }: PageProps) {
  await connection()
  const { id } = await params

  const [reservation, spaces] = await Promise.all([
    getReservationById(id),
    getSpacesForReservation(),
  ])

  if (!reservation) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/reservations/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            詳細に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">予約編集</h1>
          <p className="text-muted-foreground">
            {reservation.customer.lastName} {reservation.customer.firstName} 様の予約
          </p>
        </div>
      </div>

      {/* 編集フォーム */}
      <ReservationEditForm reservation={reservation} spaces={spaces} />
    </div>
  )
}
