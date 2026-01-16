/**
 * サイト設定ページ
 *
 * Server ComponentでデータをフェッチしClient Componentに渡す
 * Next.js App Router推奨パターン
 *
 * @see docs/plans/settings-tab-refactoring.md
 */

import { Suspense } from 'react'
import { getSettings } from '@/actions/admin/settings'
import { SettingsPageClient } from './_components'

// =============================================================================
// Loading Component
// =============================================================================

function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="space-y-4">
        <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}

// =============================================================================
// Content Component (Server Component)
// =============================================================================

async function SettingsContent() {
  // Note: Error handling is done via error.tsx boundary (Next.js App Router pattern)
  const settings = await getSettings()

  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">設定が見つかりません</p>
        <p className="text-sm text-muted-foreground mt-2">
          初期設定を作成してください
        </p>
      </div>
    )
  }

  return <SettingsPageClient initialSettings={settings} />
}

// =============================================================================
// Page Component
// =============================================================================

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsContent />
    </Suspense>
  )
}
