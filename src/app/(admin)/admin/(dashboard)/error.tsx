"use client";

/**
 * 管理画面用エラーページ
 *
 * 管理画面でのエラーをキャッチ。
 * サイドバーレイアウトは維持される。
 */

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/admin/components/ui";
import { logger } from "@/shared/lib/logger";

export default function AdminError({ error, unstable_retry }: ErrorInfo) {
  const digest = "digest" in error ? String(error.digest) : undefined;

  useEffect(() => {
    logger.error("Admin error boundary triggered", {
      error: error.message,
      digest,
    });
  }, [error, digest]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center">
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="mb-3 text-xl font-bold text-foreground">
          エラーが発生しました
        </h1>

        <p className="mb-6 text-sm text-muted-foreground">
          管理画面でエラーが発生しました。
          <br />
          再度お試しいただくか、ダッシュボードにお戻りください。
        </p>

        {digest && (
          <p className="mb-4 rounded bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            Error ID: {digest}
          </p>
        )}

        {process.env["NODE_ENV"] === "development" && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              エラー詳細（開発環境のみ）
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-foreground p-3 text-xs text-background">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => unstable_retry()}>再試行</Button>
          <Button variant="outline" asChild>
            <Link href="/admin">ダッシュボードへ</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
