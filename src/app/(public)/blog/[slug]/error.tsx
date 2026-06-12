"use client";
import type { ReactElement } from "react";

export default function BlogPostError({
  reset,
}: {
  error: Error;
  reset: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">記事の読み込みに失敗しました</p>
      <button type="button" onClick={reset} className="text-sm underline">
        再試行する
      </button>
    </div>
  );
}
