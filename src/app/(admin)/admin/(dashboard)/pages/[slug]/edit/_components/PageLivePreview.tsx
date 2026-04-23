"use client";

import { useState } from "react";
import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import { getPagePreviewHref } from "@/shared/lib/preview-routes";

type PreviewViewport = "desktop" | "mobile";

interface PageLivePreviewProps {
  readonly slug: string;
  readonly revision: number;
}

export function PageLivePreview({ slug, revision }: PageLivePreviewProps) {
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedPreviewHref, setLoadedPreviewHref] = useState<string | null>(
    null,
  );

  const previewHref = `${getPagePreviewHref(slug)}?v=${revision}-${refreshKey}`;
  const isLoading = loadedPreviewHref !== previewHref;

  return (
    <aside className="hidden xl:flex xl:sticky xl:top-4 xl:flex-col xl:gap-3">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              ライブプレビュー
            </p>
            <p className="text-xs text-muted-foreground">
              保存した内容が自動反映されます。未保存の変更は含まれません。
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={viewport === "desktop" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewport("desktop")}
              aria-label="デスクトップ幅で表示"
            >
              <IconDeviceDesktop className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewport === "mobile" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewport("mobile")}
              aria-label="モバイル幅で表示"
            >
              <IconDeviceMobile className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label="プレビューを再読み込み"
            >
              <IconRefresh className="h-4 w-4" />
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="プレビューを別タブで開く"
              >
                <IconExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="bg-muted/30 p-3">
          <div className="flex h-[calc(100vh-220px)] min-h-[560px] items-start justify-center overflow-auto rounded-xl border border-border bg-background p-3">
            <div
              className={cn(
                "relative shrink-0 overflow-hidden rounded-lg border border-border bg-background shadow-xl transition-[width] duration-200",
                viewport === "mobile" ? "w-[390px]" : "w-full min-w-[360px]",
              )}
            >
              {isLoading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-xs text-muted-foreground backdrop-blur-sm">
                  プレビューを読み込み中...
                </div>
              ) : null}
              <iframe
                key={previewHref}
                title={`/${slug} preview`}
                src={previewHref}
                className="h-[calc(100vh-250px)] min-h-[520px] w-full bg-background"
                onLoad={() => setLoadedPreviewHref(previewHref)}
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
