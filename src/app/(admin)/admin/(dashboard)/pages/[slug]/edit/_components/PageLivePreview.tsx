"use client";

import { useState } from "react";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconExternalLink,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconRefresh,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import { getPagePreviewHref } from "@/shared/lib/preview-routes";

type PreviewViewportId = "mobile" | "tablet" | "laptop" | "desktop" | "wide";

type PreviewViewportConfig = {
  readonly id: PreviewViewportId;
  readonly label: string;
  readonly width: number;
  readonly description: string;
};

const PREVIEW_VIEWPORTS: ReadonlyArray<PreviewViewportConfig> = [
  { id: "mobile", label: "390", width: 390, description: "Mobile" },
  { id: "tablet", label: "768", width: 768, description: "Tablet" },
  { id: "laptop", label: "1024", width: 1024, description: "Laptop" },
  { id: "desktop", label: "1280", width: 1280, description: "Desktop" },
  { id: "wide", label: "1440", width: 1440, description: "Wide" },
];

const DEFAULT_PREVIEW_VIEWPORT: PreviewViewportConfig = {
  id: "desktop",
  label: "1280",
  width: 1280,
  description: "Desktop",
};

function getViewportConfig(id: PreviewViewportId): PreviewViewportConfig {
  const viewport = PREVIEW_VIEWPORTS.find((candidate) => candidate.id === id);
  return viewport ?? DEFAULT_PREVIEW_VIEWPORT;
}

function ViewportIcon({ id }: { id: PreviewViewportId }) {
  if (id === "mobile") {
    return <IconDeviceMobile className="h-3.5 w-3.5" />;
  }

  if (id === "tablet") {
    return <IconDeviceTablet className="h-3.5 w-3.5" />;
  }

  return <IconDeviceDesktop className="h-3.5 w-3.5" />;
}

interface PageLivePreviewProps {
  readonly slug: string;
  readonly revision: number;
  readonly compact?: boolean;
  readonly navigatorOpen?: boolean;
  readonly inspectorOpen?: boolean;
  readonly onNavigatorToggle?: () => void;
  readonly onInspectorToggle?: () => void;
  readonly isFocusMode?: boolean;
  readonly onFocusModeToggle?: () => void;
}

export function PageLivePreview({
  slug,
  revision,
  compact = false,
  navigatorOpen,
  inspectorOpen,
  onNavigatorToggle,
  onInspectorToggle,
  isFocusMode = false,
  onFocusModeToggle,
}: PageLivePreviewProps) {
  const [viewport, setViewport] = useState<PreviewViewportId>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedPreviewHref, setLoadedPreviewHref] = useState<string | null>(
    null,
  );

  const previewHref = `${getPagePreviewHref(slug)}?v=${revision}-${refreshKey}`;
  const activeViewport = getViewportConfig(viewport);
  const isLoading = loadedPreviewHref !== previewHref;
  const stageHeightClass = compact
    ? "h-[70vh] min-h-[560px]"
    : "h-[calc(100vh-20rem)] min-h-[720px]";
  const iframeHeightClass = compact
    ? "h-[calc(70vh-8rem)] min-h-[520px]"
    : "h-[calc(100vh-27rem)] min-h-[640px]";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/90">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            Preview Canvas
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              実幅プレビュー
            </p>
            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
              {activeViewport.description} / {activeViewport.width}px
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            保存済みのページを本番ルート相当で描画します。必要に応じて canvas
            を広げてレイアウト差分を確認できます。
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-1">
            {PREVIEW_VIEWPORTS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant={viewport === option.id ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[11px]"
                onClick={() => setViewport(option.id)}
                aria-label={`${option.description} 幅で表示`}
              >
                <ViewportIcon id={option.id} />
                {option.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1">
            {onNavigatorToggle ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[11px]"
                onClick={onNavigatorToggle}
              >
                {navigatorOpen ? (
                  <IconLayoutSidebarLeftCollapse className="h-3.5 w-3.5" />
                ) : (
                  <IconLayoutSidebarLeftExpand className="h-3.5 w-3.5" />
                )}
                構成
              </Button>
            ) : null}

            {onInspectorToggle ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[11px]"
                onClick={onInspectorToggle}
              >
                {inspectorOpen ? (
                  <IconLayoutSidebarRightCollapse className="h-3.5 w-3.5" />
                ) : (
                  <IconLayoutSidebarRightExpand className="h-3.5 w-3.5" />
                )}
                Inspector
              </Button>
            ) : null}

            {onFocusModeToggle ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-[11px]"
                onClick={onFocusModeToggle}
              >
                {isFocusMode ? (
                  <IconArrowsMinimize className="h-3.5 w-3.5" />
                ) : (
                  <IconArrowsMaximize className="h-3.5 w-3.5" />
                )}
                集中
              </Button>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[11px]"
              onClick={() => setRefreshKey((current) => current + 1)}
            >
              <IconRefresh className="h-3.5 w-3.5" />
              再読込
            </Button>

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[11px]"
            >
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="プレビューを別タブで開く"
              >
                <IconExternalLink className="h-3.5 w-3.5" />
                別タブ
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-gradient-to-br from-muted/35 via-background to-muted/15 p-3 sm:p-4">
        <div
          className={cn(
            "flex items-start justify-center overflow-auto rounded-[20px] border border-border/60 bg-muted/20 p-3 sm:p-4",
            stageHeightClass,
          )}
        >
          <div className="mx-auto flex min-w-full justify-center">
            <div
              className="relative shrink-0 overflow-hidden rounded-[18px] border border-border/70 bg-background shadow-2xl"
              style={{ width: `${activeViewport.width}px` }}
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
                className={cn("w-full bg-background", iframeHeightClass)}
                onLoad={() => setLoadedPreviewHref(previewHref)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
