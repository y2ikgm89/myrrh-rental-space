'use client'

/**
 * SEOタブ
 *
 * SEO設定を含む
 */

import type { SettingsData } from '@/actions/admin/settings'
import { SeoSection } from '../sections'

interface SeoTabProps {
  settings: SettingsData
}

export function SeoTab({ settings }: SeoTabProps) {
  return (
    <div className="space-y-6">
      <SeoSection settings={settings} />
    </div>
  )
}
