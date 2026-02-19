import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSpacesForReservation } from '@/admin/actions/reservation'
import { ReservationForm } from '../_components/ReservationForm'
import { Button } from '@/admin/components/ui'
import type { Metadata } from 'next'
import { connection } from "next/server";

export const metadata: Metadata = {
  title: '新規予約 | Myrrh Rental Space',
}

export default async function NewReservationPage() {
  await connection();
  const spaces = await getSpacesForReservation()

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/reservations">
            <ArrowLeft className="mr-2 h-4 w-4" />
            一覧に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">新規予約</h1>
          <p className="text-muted-foreground">
            電話予約や対面予約など、管理者が手動で予約を入力します
          </p>
        </div>
      </div>

      {/* フォーム */}
      <ReservationForm spaces={spaces} />
    </div>
  )
}
