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
  onUpdate: () => void
}

export function SeoTab({ settings, onUpdate }: SeoTabProps) {
  return (
    <div className="space-y-6">
      <SeoSection settings={settings} onUpdate={onUpdate} />
    </div>
  )
}
