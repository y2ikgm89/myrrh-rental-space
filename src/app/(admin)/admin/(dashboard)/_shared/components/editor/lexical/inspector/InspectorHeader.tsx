/**
 * Inspector Header
 *
 * @description パネル共通のヘッダーコンポーネント
 */

'use client'

// =============================================================================
// Types
// =============================================================================

type InspectorHeaderProps = {
  title: string
}

// =============================================================================
// Component
// =============================================================================

export function InspectorHeader({ title }: InspectorHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-border">
      <h3 className="font-semibold text-sm">{title}</h3>
    </div>
  )
}
