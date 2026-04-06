"use client";

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/shared/lib/logger";

export default function ReservationEditError({
  error,
  unstable_retry,
}: ErrorInfo) {
  useEffect(() => {
    logger.error("Mypage reservation edit error", {
      error: error.message,
    });
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-5 md:px-8">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 font-heading text-2xl font-light tracking-tight text-foreground">
          エラーが発生しました
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          予約編集ページの読み込みに失敗しました。
          <br />
          再度お試しいただくか、一覧にお戻りください。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="border border-accent bg-transparent px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            再試行
          </button>
          <Link
            href="/mypage/reservations"
            className="border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            予約一覧に戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
