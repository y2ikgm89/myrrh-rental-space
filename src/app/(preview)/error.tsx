"use client";

/**
 * プレビュー用エラー境界
 *
 * `(preview)/preview/pages/[slug]` は `getPageForEdit()` が admin 権限を要求するため、
 * 未認証ユーザーがアクセスすると `DomainError("FORBIDDEN")` 等が throw される。
 * その際に Next.js のデフォルト error 画面ではなく、管理者に `/admin/login` 経路を
 * 明示する fallback を表示する。
 */

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import Link from "next/link";
import { logger } from "@/shared/lib/logger";

export default function PreviewError({ error, unstable_retry }: ErrorInfo) {
  const digest = "digest" in error ? String(error.digest) : undefined;

  useEffect(() => {
    logger.error("Preview error boundary triggered", {
      error: error.message,
      digest,
    });
  }, [error, digest]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="mb-3 text-xl font-bold tracking-tight text-foreground">
          プレビューを表示できません
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          管理画面のセッションが切れているか、プレビュー対象のページが存在しません。
          <br />
          管理画面にログインし直してから再度お試しください。
        </p>

        {digest && (
          <p className="mb-4 rounded bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            Error ID: {digest}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            再試行
          </button>
          <Link
            href="/admin/login"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            管理画面へ
          </Link>
        </div>
      </div>
    </main>
  );
}
