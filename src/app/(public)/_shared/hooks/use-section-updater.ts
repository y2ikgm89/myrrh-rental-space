'use client'

/**
 * セクション更新フック
 *
 * ホームページセクションの設定を更新するためのフック
 * useTransitionでServer Actionを呼び出し、成功/失敗時のトースト表示を行う
 */

import { useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateSectionConfig } from '@/public/actions/section-update'
type UseSectionUpdaterOptions = {
  sectionId: string
}

type UseSectionUpdaterReturn = {
  updateConfig: (config: Record<string, unknown>, title?: string) => void
  isPending: boolean
}

/**
 * セクション更新フック
 *
 * @param options - セクションID
 * @returns updateConfig関数とpending状態
 *
 * @example
 * ```tsx
 * const { updateConfig, isPending } = useSectionUpdater({
 *   sectionId: section.id,
 * })
 *
 * const handleSubmit = (data: HeroConfig) => {
 *   updateConfig(data)
 * }
 * ```
 */
export function useSectionUpdater({
  sectionId,
}: UseSectionUpdaterOptions): UseSectionUpdaterReturn {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const updateConfig = useCallback(
    (config: Record<string, unknown>, title?: string) => {
      startTransition(async () => {
        const result = await updateSectionConfig({
          sectionId,
          config,
          title,
        })

        if (result.success) {
          toast.success(result.message)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      })
    },
    [sectionId, router]
  )

  return { updateConfig, isPending }
}
