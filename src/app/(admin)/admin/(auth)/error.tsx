"use client";

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import { logger } from "@/shared/lib/logger";

export default function AuthError({ error, unstable_retry }: ErrorInfo) {
  const digest = "digest" in error ? String(error.digest) : undefined;

  useEffect(() => {
    logger.error("Auth error boundary triggered", {
      error: error.message,
      digest,
    });
  }, [error, digest]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
          エラーが発生しました
        </h1>
        <p className="mb-8 text-muted-foreground">
          申し訳ございません。しばらく時間をおいてから再度お試しください。
        </p>
        {digest && (
          <p className="mb-6 text-sm text-muted-foreground/70">
            エラーID: {digest}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => unstable_retry()}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            再試行する
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/admin/login"
            className="rounded-lg border border-border bg-card px-6 py-3 font-medium text-card-foreground transition-colors hover:bg-accent"
          >
            ログインに戻る
          </a>
        </div>
      </div>
    </div>
  );
}
