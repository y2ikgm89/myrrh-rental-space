/**
 * お知らせバーラッパー（Server Component）
 *
 * DBから有効なお知らせバーを取得して表示
 */

import { getActiveAnnouncementBar } from '@/actions/admin/announcement-bar'
import { AnnouncementBar } from './AnnouncementBar'
import type { ReactElement } from 'react'

export async function AnnouncementBarWrapper(): Promise<ReactElement | null> {
  const bar = await getActiveAnnouncementBar()

  if (!bar) {
    return null
  }

  return (
    <AnnouncementBar
      id={bar.id}
      message={bar.message}
      type={bar.type}
      linkUrl={bar.linkUrl}
      linkText={bar.linkText}
      bgColor={bar.bgColor}
      textColor={bar.textColor}
    />
  )
}
