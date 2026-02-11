'use client'

/**
 * config-forms 共通型 + FormActions
 */

import { useEffect } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/admin/components/ui'
import type { PageSectionData } from '@/admin/actions/page-section'

export interface ConfigFormSavePayload {
  config: Record<string, unknown>
  content?: string
}

export interface ConfigFormProps {
  section: PageSectionData
  onSave: (payload: ConfigFormSavePayload) => void
  isPending: boolean
  onDirtyChange?: (dirty: boolean) => void
}

export function FormActions({
  isDirty,
  isPending,
  onDirtyChange,
}: {
  isDirty: boolean
  isPending: boolean
  onDirtyChange?: (dirty: boolean) => void
}) {
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  return (
    <div className="flex items-center gap-3">
      {isDirty && (
        <span className="text-sm text-warning font-medium">
          未保存の変更があります
        </span>
      )}
      <Button type="submit" disabled={isPending || !isDirty}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? '保存中...' : '保存'}
      </Button>
    </div>
  )
}
