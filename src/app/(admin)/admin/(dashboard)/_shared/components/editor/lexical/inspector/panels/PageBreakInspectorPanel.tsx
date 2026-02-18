/**
 * PageBreak Inspector Panel
 *
 * @description PageBreakNodeの情報表示パネル（情報のみ）
 */

'use client'

import { InspectorHeader } from '../InspectorHeader'
import { InspectorSection } from '../InspectorSection'

export function PageBreakInspectorPanel() {
  return (
    <div>
      <InspectorHeader title="ページ区切り" />

      <InspectorSection title="情報">
        <p className="text-xs text-muted-foreground">
          印刷時にこの位置でページが区切られます。
        </p>
      </InspectorSection>
    </div>
  )
}
