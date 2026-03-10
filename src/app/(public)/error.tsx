"use client";

/**
 * 公開ページ用エラーページ
 *
 * 公開ページでのエラーをキャッチ。
 * Header/Footerレイアウトは維持される。
 */

import { useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logger } from "@/shared/lib/logger";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PublicError({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    logger.error("Public page error boundary triggered", {
      error: error.message,
      digest: error.digest,
    });
  }, [error]);

  const handleReset = () => {
    startTransition(() => {
      reset();
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 md:px-8">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <svg
            className="mx-auto h-16 w-16 text-muted-foreground/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="mb-3 font-heading text-2xl font-bold tracking-tight text-foreground">
          エラーが発生しました
        </h1>

        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          申し訳ございません。ページの表示中にエラーが発生しました。
          <br />
          再度お試しいただくか、ホームページにお戻りください。
        </p>

        {error.digest && (
          <p className="mb-6 rounded-lg bg-surface px-3 py-2 font-mono text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}

        {process.env["NODE_ENV"] === "development" && (
          <details className="mb-8 text-left">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              エラー詳細（開発環境のみ）
            </summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-foreground p-3 text-xs text-background">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={handleReset}
            className="rounded-full border border-primary-dark bg-transparent px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            再試行
          </button>
          <Link
            href="/"
            className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
