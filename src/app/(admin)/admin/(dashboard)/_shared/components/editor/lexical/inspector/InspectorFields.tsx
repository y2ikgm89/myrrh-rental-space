/**
 * Inspector Fields
 *
 * @description InspectorSection + フィールドグループのラッパー
 * `<InspectorSection><div className="space-y-3">` パターンを統合
 */

'use client'

import type { ReactNode } from 'react'
import { InspectorSection } from './InspectorSection'

type InspectorFieldsProps = {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function InspectorFields({
  title,
  defaultOpen = true,
  children,
}: InspectorFieldsProps) {
  return (
    <InspectorSection title={title} defaultOpen={defaultOpen}>
      <div className="space-y-3">{children}</div>
    </InspectorSection>
  )
}
