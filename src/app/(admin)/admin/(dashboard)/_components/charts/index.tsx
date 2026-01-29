'use client'

/**
 * Charts barrel export
 *
 * ReservationChartをdynamic importで遅延ロード
 * Rechartsバンドルはダッシュボード表示時のみ読み込み
 */

import dynamic from 'next/dynamic'

export const ReservationChart = dynamic(
  () => import('./ReservationChart').then((mod) => mod.ReservationChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 animate-pulse rounded-lg bg-muted" />
    ),
  }
)
