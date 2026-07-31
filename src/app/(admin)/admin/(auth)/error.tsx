"use client";

import {
  errorBoundaryDigest,
  errorBoundaryRetry,
  type ErrorBoundaryProps,
} from "@/shared/lib/errors/error-boundary-props";
import { normalizeError } from "@/shared/lib/errors/types";
import { useEffect } from "react";
import { logger } from "@/shared/lib/errors/logger-core";

export default function AuthError(props: ErrorBoundaryProps) {
  const error = normalizeError(props.error);
  const retry = errorBoundaryRetry(props);
  const digest = errorBoundaryDigest(props.error);

  useEffect(() => {
    logger.error("Auth error boundary triggered", {
      error: error.message,
      digest,
    });
  }, [error, digest]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
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
            onClick={() => retry()}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            再試行する
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/admin"
            className="rounded-lg border border-border bg-card px-6 py-3 font-medium text-card-foreground transition-colors hover:bg-accent"
          >
            管理画面に戻る
          </a>
        </div>
      </div>
    </div>
  );
}
