/**
 * 管理画面ダッシュボード
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ダッシュボード',
}

export default function AdminDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">ダッシュボード</h2>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="今月の予約"
          value="0"
          change="+0%"
          trend="up"
        />
        <StatCard
          title="今月の売上"
          value="¥0"
          change="+0%"
          trend="up"
        />
        <StatCard
          title="新規お問い合わせ"
          value="0"
          change="+0%"
          trend="neutral"
        />
        <StatCard
          title="アクティブスペース"
          value="0"
          change=""
          trend="neutral"
        />
      </div>

      {/* 最近の予約 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          最近の予約
        </h3>
        <p className="text-gray-500">予約データがありません</p>
      </div>

      {/* 最近のお問い合わせ */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          最近のお問い合わせ
        </h3>
        <p className="text-gray-500">お問い合わせデータがありません</p>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  change,
  trend,
}: {
  title: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
      {change && (
        <p
          className={`text-sm mt-2 ${
            trend === 'up'
              ? 'text-green-600'
              : trend === 'down'
                ? 'text-red-600'
                : 'text-gray-500'
          }`}
        >
          {change}
        </p>
      )}
    </div>
  )
}
