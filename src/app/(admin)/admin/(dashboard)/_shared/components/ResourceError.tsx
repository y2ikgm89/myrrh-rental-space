"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/admin/components/ui/button";
import { logger } from "@/shared/lib/logger";

export default function ResourceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Admin error boundary triggered", {
      error: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-semibold mb-2">エラーが発生しました</h2>
      <p className="text-muted-foreground mb-4 text-center max-w-md">
        データの読み込みに失敗しました。
      </p>
      <Button onClick={reset} variant="outline">
        再試行
      </Button>
    </div>
  );
}
