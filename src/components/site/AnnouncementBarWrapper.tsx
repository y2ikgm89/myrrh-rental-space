/**
 * お知らせバーラッパー（Server Component）
 *
 * DBから有効なお知らせバーとカルーセル設定を取得して表示
 */

import { getActiveAnnouncementBars } from '@/actions/admin/announcement-bar'
import { getAnnouncementBarCarouselSettings } from '@/actions/admin/settings'
import { AnnouncementBarCarousel } from './AnnouncementBarCarousel'
import type { CarouselSettings } from './AnnouncementBarCarousel'
import type { ReactElement } from 'react'

export async function AnnouncementBarWrapper(): Promise<ReactElement | null> {
  const [bars, dbSettings] = await Promise.all([
    getActiveAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ])

  if (bars.length === 0) {
    return null
  }

  // DB設定をCarouselSettings形式に変換
  // 不正な値の場合はデフォルト値'fade'にフォールバック
  const validAnimations = ['fade', 'slideX', 'slideY'] as const
  const animation = validAnimations.includes(dbSettings.announcementBarAnimation as typeof validAnimations[number])
    ? (dbSettings.announcementBarAnimation as 'fade' | 'slideX' | 'slideY')
    : 'fade'

  const settings: CarouselSettings = {
    animation,
    duration: dbSettings.announcementBarDuration,
    autoPlay: dbSettings.announcementBarAutoPlay,
    pauseOnHover: dbSettings.announcementBarPauseOnHover,
    showArrows: dbSettings.announcementBarShowArrows,
    showIndicator: dbSettings.announcementBarShowIndicator,
  }

  return (
    <AnnouncementBarCarousel
      bars={bars.map((bar) => ({
        id: bar.id,
        message: bar.message,
        type: bar.type,
        linkUrl: bar.linkUrl,
        linkText: bar.linkText,
        bgColor: bar.bgColor,
        textColor: bar.textColor,
      }))}
      settings={settings}
    />
  )
}
