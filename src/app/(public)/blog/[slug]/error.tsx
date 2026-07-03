"use client";

import type { ErrorInfo } from "next/error";
import type { ReactElement } from "react";

export default function BlogPostError({
  unstable_retry,
}: ErrorInfo): ReactElement {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4">
      <h1 className="font-heading text-2xl font-light tracking-tight text-foreground">
        記事の読み込みに失敗しました
      </h1>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="text-sm underline"
      >
        再試行する
      </button>
    </div>
  );
}
