/**
 * ダッシュボードヘッダー
 *
 * 静的コンテンツ + 現在日付表示
 * connection()を使用して非決定論的操作を明示
 */

import { connection } from 'next/server'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

export async function DashboardHeader() {
  // 非決定論的操作（new Date()）を行う前にconnection()を呼び出し
  await connection()
  const today = new Date()

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">ダッシュボード</h1>
      <p className="text-muted-foreground">
        {format(today, 'yyyy年M月d日 (EEEE)', { locale: ja })}
      </p>
    </div>
  )
}
