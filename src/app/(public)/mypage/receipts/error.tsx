"use client";

import {
  errorBoundaryRetry,
  type ErrorBoundaryProps,
} from "@/shared/lib/errors/error-boundary-props";
import { normalizeError } from "@/shared/lib/errors/types";
import { useEffect } from "react";
import { Button } from "@/public/components/design-system/button";
import { logger } from "@/shared/lib/errors/logger-core";

export default function MypageReceiptsError(props: ErrorBoundaryProps) {
  const error = normalizeError(props.error);
  const retry = errorBoundaryRetry(props);
  useEffect(() => {
    logger.error("Mypage receipts error", { error: error.message });
  }, [error]);

  return (
    <div className="flex min-h-[40svh] flex-col items-center justify-center px-5 md:px-8">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 font-heading text-2xl font-light tracking-tight text-foreground">
          エラーが発生しました
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          領収書一覧の読み込みに失敗しました。
          <br />
          再度お試しいただくか、マイページにお戻りください。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="editorial" onClick={() => retry()}>
            再試行
          </Button>
          <Button variant="secondary" href="/mypage">
            マイページに戻る
          </Button>
        </div>
      </div>
    </div>
  );
}
