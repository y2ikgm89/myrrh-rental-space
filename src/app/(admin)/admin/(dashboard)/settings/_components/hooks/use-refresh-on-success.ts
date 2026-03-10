"use client";

/**
 * useRefreshOnSuccess
 *
 * Server Action成功後にページをリフレッシュするフック
 * Next.js App Routerのベストプラクティスに準拠
 */

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isMutationError } from "@/shared/lib/mutation-result";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

/**
 * Server Action成功後にrouter.refresh()を呼び出すハンドラを返す
 */
export function useRefreshOnSuccess() {
  const router = useRouter();

  /**
   * Server Actionの結果を処理し、成功時にページをリフレッシュ
   */
  const handleResult = (result: unknown, successMessage?: string) => {
    if (isMutationError(result)) {
      toast.error(result.error || "保存に失敗しました");
      return;
    }

    if (successMessage) {
      toast.success(successMessage);
    }

    try {
      router.refresh();
    } catch (error) {
      logger.error("Failed to refresh", {
        error: getErrorMessage(error),
      });
      // リフレッシュ失敗は致命的ではないため、警告のみ
    }
  };

  return { handleResult, refresh: router.refresh.bind(router) };
}
