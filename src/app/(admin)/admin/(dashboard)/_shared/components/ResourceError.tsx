"use client";

import { useEffect } from "react";
import type { ErrorInfo } from "next/error";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";

export default function ResourceError({ error, unstable_retry }: ErrorInfo) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[400px] p-8"
    >
      <IconAlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-semibold mb-2">エラーが発生しました</h2>
      <p className="text-muted-foreground mb-4 text-center max-w-md">
        データの読み込みに失敗しました。
      </p>
      <Button onClick={() => unstable_retry()} variant="outline">
        再試行
      </Button>
    </div>
  );
}
