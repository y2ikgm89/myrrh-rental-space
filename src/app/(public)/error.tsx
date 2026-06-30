"use client";

/**
 * 公開ページ用エラーページ
 *
 * 公開ページでのエラーをキャッチ。
 * Header/Footerレイアウトは維持される。
 */

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import { Button } from "@/public/components/design-system/button";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { logger } from "@/shared/lib/errors/logger-core";

export default function PublicError({ error, unstable_retry }: ErrorInfo) {
  const digest = "digest" in error ? String(error.digest) : undefined;

  useEffect(() => {
    logger.error("Public page error boundary triggered", {
      error: error.message,
      digest,
    });
  }, [error, digest]);

  const contactHref = digest
    ? `/contact?subject=${encodeURIComponent("システムエラー")}&body=${encodeURIComponent(`Error ID: ${digest}\n\n（エラー発生時の操作内容をご記入ください）`)}`
    : "/contact?subject=" + encodeURIComponent("システムエラー");

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center px-5 md:px-8">
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

        <h1 className="mb-3 font-heading text-2xl font-light tracking-tight text-foreground">
          エラーが発生しました
        </h1>

        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          申し訳ございません。ページの表示中にエラーが発生しました。
          <br />
          再度お試しいただくか、サポートまでお問い合わせください。
        </p>

        {digest && (
          <p className="mb-6 bg-surface px-3 py-2 font-mono text-xs text-muted-foreground">
            Error ID: {digest}
          </p>
        )}

        {process.env["NODE_ENV"] === "development" && (
          <details className="mb-8 text-left">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              エラー詳細（開発環境のみ）
            </summary>
            <pre className="mt-2 overflow-auto bg-foreground p-3 text-xs text-background">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="editorial"
            size="sm"
            onClick={() => unstable_retry()}
          >
            再試行
          </Button>
          <Button variant="editorial" size="sm" href="/">
            ホームに戻る
          </Button>
          <Button variant="editorial" size="sm" href={toAppRoute(contactHref)}>
            お問い合わせ
          </Button>
        </div>
      </div>
    </div>
  );
}
