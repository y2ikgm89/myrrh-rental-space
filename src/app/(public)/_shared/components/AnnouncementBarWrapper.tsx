/**
 * お知らせバーラッパー（Server Component）
 *
 * DBから有効なお知らせバーとカルーセル設定を取得して表示
 * Next.js 16 PPR対応: 'use cache' ディレクティブでキャッシュ
 * AnnouncementBarCarouselを動的インポートでMotionライブラリを遅延読み込み
 */

import dynamic from 'next/dynamic'
import {
  getActiveAnnouncementBars,
  getAnnouncementBarCarouselSettings,
} from '@/shared/domain/settings/announcement-bar'
import type { CarouselSettings } from './AnnouncementBarCarousel'
import type { ReactElement } from 'react'
import { validateAnimation, validateDesignStyle } from '@/shared/lib/announcement-bar-utils'
import { toISOString } from '@/shared/lib/serialize'

const AnnouncementBarCarousel = dynamic(
  () => import('./AnnouncementBarCarousel').then((mod) => mod.AnnouncementBarCarousel),
  { ssr: true }
)

export async function AnnouncementBarWrapper(): Promise<ReactElement | null> {
  const [bars, dbSettings] = await Promise.all([
    getActiveAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ])

  if (bars.length === 0) {
    return null
  }

  // DB設定をCarouselSettings形式に変換
  const settings: CarouselSettings = {
    animation: validateAnimation(dbSettings.announcementBarAnimation),
    duration: dbSettings.announcementBarDuration,
    autoPlay: dbSettings.announcementBarAutoPlay,
    pauseOnHover: dbSettings.announcementBarPauseOnHover,
    showArrows: dbSettings.announcementBarShowArrows,
    showIndicator: dbSettings.announcementBarShowIndicator,
    designStyle: validateDesignStyle(dbSettings.announcementBarDesignStyle),
    // Common Color Settings
    bgColor: dbSettings.announcementBarBgColor,
    textColor: dbSettings.announcementBarTextColor,
    // Striped Design Settings
    stripeColor: dbSettings.announcementBarStripeColor,
    stripeAnimation: dbSettings.announcementBarStripeAnimation,
    // Gradient Design Settings
    gradientAnimation: dbSettings.announcementBarGradientAnimation,
    // Glass Design Settings
    glassAnimation: dbSettings.announcementBarGlassAnimation,
    // Sticky Settings
    sticky: dbSettings.announcementBarSticky,
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
        startAt: toISOString(bar.startAt) ?? null,
        endAt: toISOString(bar.endAt) ?? null,
      }))}
      settings={settings}
    />
  )
}
