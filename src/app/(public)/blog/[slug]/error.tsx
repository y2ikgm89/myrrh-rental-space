"use client";

import {
  errorBoundaryRetry,
  type ErrorBoundaryProps,
} from "@/shared/lib/errors/error-boundary-props";
import type { ReactElement } from "react";

export default function BlogPostError(props: ErrorBoundaryProps): ReactElement {
  const retry = errorBoundaryRetry(props);
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4">
      <h1 className="font-heading text-2xl font-light tracking-tight text-foreground">
        記事の読み込みに失敗しました
      </h1>
      <button
        type="button"
        onClick={() => retry()}
        className="text-sm underline"
      >
        再試行する
      </button>
    </div>
  );
}
