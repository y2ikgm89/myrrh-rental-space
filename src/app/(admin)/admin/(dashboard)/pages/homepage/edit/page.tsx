/**
 * ホームページセクション編集
 *
 * DnDでセクション順序変更、セクション別設定編集
 * 旧: /admin/settings?tab=homepage → 新: /admin/pages/homepage/edit
 */

import { HomepageTab } from '@/app/(admin)/admin/(dashboard)/settings/_components/homepage/HomepageTab'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'ホームページ編集',
}

export default function HomepageEditPage(): ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ホームページ編集</h1>
        <p className="text-muted-foreground">
          セクションの順序変更・設定編集
        </p>
      </div>
      <HomepageTab />
    </div>
  )
}
