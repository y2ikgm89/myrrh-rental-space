'use client'

/**
 * useRefreshOnSuccess
 *
 * Server Action成功後にページをリフレッシュするフック
 * Next.js App Routerのベストプラクティスに準拠
 */

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface ActionResult {
  success: boolean
  error?: string
  message?: string
}

/**
 * Server Action成功後にrouter.refresh()を呼び出すハンドラを返す
 */
export function useRefreshOnSuccess() {
  const router = useRouter()

  /**
   * Server Actionの結果を処理し、成功時にページをリフレッシュ
   */
  const handleResult = (result: ActionResult) => {
    if (result.success) {
      if (result.message) {
        toast.success(result.message)
      }
      try {
        router.refresh()
      } catch (error) {
        console.error('Failed to refresh:', error)
        // リフレッシュ失敗は致命的ではないため、警告のみ
      }
    } else {
      toast.error(result.error || '保存に失敗しました')
    }
  }

  return { handleResult, refresh: router.refresh.bind(router) }
}
