"use client";

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import { Button } from "@/public/components/design-system/button";
import { logger } from "@/shared/lib/logger";

export default function PostPreviewError({ error, unstable_retry }: ErrorInfo) {
  useEffect(() => {
    logger.error("Post preview error", { error: error.message });
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-5 md:px-8">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 font-heading text-2xl font-light tracking-tight text-foreground">
          エラーが発生しました
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          プレビューの読み込みに失敗しました。
          <br />
          再度お試しいただくか、管理画面にお戻りください。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="editorial" onClick={() => unstable_retry()}>
            再試行
          </Button>
          <Button variant="secondary" href="/admin">
            管理画面に戻る
          </Button>
        </div>
      </div>
    </div>
  );
}
