import { getSpacesForReservation } from '@/admin/actions/reservation'
import { ReservationForm } from '../_components/ReservationForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '新規予約 | Myrrh Rental Space',
}

export default async function NewReservationPage() {
  const spaces = await getSpacesForReservation()

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold">新規予約</h1>
        <p className="text-muted-foreground">
          電話予約や対面予約など、管理者が手動で予約を入力します
        </p>
      </div>

      {/* フォーム */}
      <ReservationForm spaces={spaces} />
    </div>
  )
}
