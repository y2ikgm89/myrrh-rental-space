'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from './switch'
import type { ActionResult } from '@/shared/types/server-actions'

// =============================================================================
// Types
// =============================================================================

type PublishSwitchProps<TData = unknown> = {
  id: string
  isPublished: boolean
  onToggle: (id: string, checked: boolean) => Promise<ActionResult<TData>>
  label?: { published: string; unpublished: string }
}

// =============================================================================
// PublishSwitch Component
// =============================================================================

export function PublishSwitch<TData = unknown>({
  id,
  isPublished,
  onToggle,
  label = { published: '公開', unpublished: '非公開' },
}: PublishSwitchProps<TData>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await onToggle(id, checked)
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error || 'エラーが発生しました')
      }
    })
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Switch
        checked={isPublished}
        onCheckedChange={handleChange}
        disabled={isPending}
      />
      <span className="text-xs text-muted-foreground">
        {isPublished ? label.published : label.unpublished}
      </span>
    </div>
  )
}
