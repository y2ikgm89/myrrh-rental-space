'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/admin/components/ui'
import { toggleLocationPublish } from '@/admin/actions/location'

type PublishSwitchProps = {
  locationId: string
  isPublished: boolean
}

export function PublishSwitch({ locationId, isPublished }: PublishSwitchProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await toggleLocationPublish(locationId, checked)
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
        {isPublished ? '公開' : '非公開'}
      </span>
    </div>
  )
}
