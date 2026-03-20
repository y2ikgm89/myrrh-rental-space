/**
 * Inspector Sidebar
 *
 * @description 選択中ノードのプロパティ編集サイドバー
 */

"use client";

import {
  useSelectedNode,
  type SelectedNodeInfo,
} from "./hooks/use-selected-node";
import { useInspectorSidebar } from "./inspector-sidebar-context";
import {
  ButtonInspectorPanel,
  ImageInspectorPanel,
  CalloutInspectorPanel,
  BookmarkInspectorPanel,
  PullQuoteInspectorPanel,
  CollapsibleInspectorPanel,
  StepsInspectorPanel,
  TabsInspectorPanel,
  LayoutInspectorPanel,
  YouTubeInspectorPanel,
  VimeoInspectorPanel,
  XInspectorPanel,
  InstagramInspectorPanel,
  PageBreakInspectorPanel,
  MapEmbedInspectorPanel,
  CodeInspectorPanel,
  AudioInspectorPanel,
  FileInspectorPanel,
  FigmaInspectorPanel,
  SpotifyInspectorPanel,
  GalleryContainerInspectorPanel,
  GalleryItemInspectorPanel,
  TimelineContainerInspectorPanel,
  TimelineItemInspectorPanel,
  PricingPlanInspectorPanel,
  PricingFeatureInspectorPanel,
  InlineImageInspectorPanel,
  TestimonialContainerInspectorPanel,
  TestimonialItemInspectorPanel,
  FeatureIconListContainerInspectorPanel,
  FeatureIconListItemInspectorPanel,
  CoverInspectorPanel,
  TableInspectorPanel,
  TableCellInspectorPanel,
} from "./panels";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { Button } from "@/admin/components/ui/button";

const INSPECTOR_PANEL_ID = "lexical-block-inspector-panel";

// =============================================================================
// Panel Renderer
// =============================================================================

/**
 * Discriminated Unionにより型ガードなしで型安全にパネルをレンダリング
 */
function renderPanel(info: SelectedNodeInfo) {
  if (!info) return null;

  switch (info.nodeType) {
    case "button":
      return <ButtonInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "image":
      return <ImageInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "callout":
      return <CalloutInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "bookmark":
      return <BookmarkInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "pullQuote":
      return (
        <PullQuoteInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "collapsible":
      return (
        <CollapsibleInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "steps":
      return <StepsInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "tabs":
      return <TabsInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "layout":
      return <LayoutInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "youtube":
      return <YouTubeInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "vimeo":
      return <VimeoInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "x":
      return <XInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "instagram":
      return (
        <InstagramInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "pageBreak":
      return <PageBreakInspectorPanel />;
    case "mapEmbed":
      return <MapEmbedInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "code":
      return <CodeInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "audio":
      return <AudioInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "file":
      return <FileInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "figma":
      return <FigmaInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "spotify":
      return <SpotifyInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "galleryContainer":
      return (
        <GalleryContainerInspectorPanel
          nodeKey={info.nodeKey}
          node={info.node}
        />
      );
    case "galleryItem":
      return (
        <GalleryItemInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "timelineContainer":
      return (
        <TimelineContainerInspectorPanel
          nodeKey={info.nodeKey}
          node={info.node}
        />
      );
    case "timelineItem":
      return (
        <TimelineItemInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "pricingPlan":
      return (
        <PricingPlanInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "pricingFeature":
      return (
        <PricingFeatureInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "inlineImage":
      return (
        <InlineImageInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
    case "testimonialContainer":
      return (
        <TestimonialContainerInspectorPanel
          nodeKey={info.nodeKey}
          node={info.node}
        />
      );
    case "testimonialItem":
      return (
        <TestimonialItemInspectorPanel
          nodeKey={info.nodeKey}
          node={info.node}
        />
      );
    case "featureIconListContainer":
      return (
        <FeatureIconListContainerInspectorPanel
          nodeKey={info.nodeKey}
          node={info.node}
        />
      );
    case "featureIconItem":
      return (
        <FeatureIconListItemInspectorPanel
          nodeKey={info.nodeKey}
          node={info.node}
        />
      );
    case "cover":
      return <CoverInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "table":
      return <TableInspectorPanel nodeKey={info.nodeKey} node={info.node} />;
    case "tableCell":
      return (
        <TableCellInspectorPanel nodeKey={info.nodeKey} node={info.node} />
      );
  }
}

// =============================================================================
// Component
// =============================================================================

export function InspectorSidebar() {
  const selectedNode = useSelectedNode();
  const { isExpanded, expand, collapse } = useInspectorSidebar();

  return (
    <aside
      id={INSPECTOR_PANEL_ID}
      aria-label="ブロック設定パネル"
      className={
        isExpanded
          ? "shrink-0 w-64 border-l border-border bg-background flex flex-col h-full transition-[width] duration-200 ease-out min-w-0"
          : "shrink-0 w-11 border-l border-border bg-background flex flex-col items-center pt-2 h-full transition-[width] duration-200 ease-out"
      }
    >
      {isExpanded ? (
        <>
          <div className="shrink-0 flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
            <span className="text-xs font-medium text-foreground truncate pl-1">
              ブロック設定
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-expanded={true}
              onClick={collapse}
              title="ブロック設定パネルを閉じる"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
              <span className="sr-only">ブロック設定パネルを閉じる</span>
            </Button>
          </div>
          {selectedNode ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              {renderPanel(selectedNode)}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4 min-h-0">
              <Settings2 className="h-8 w-8 mb-2 opacity-50" aria-hidden />
              <p className="text-sm text-center">
                ブロックを選択すると
                <br />
                設定を編集できます
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-expanded={false}
            onClick={expand}
            title="ブロック設定パネルを開く（Ctrl+Shift+0）"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="sr-only">ブロック設定パネルを開く</span>
          </Button>
          <Settings2
            className="h-4 w-4 mt-3 text-muted-foreground opacity-60"
            aria-hidden
          />
        </>
      )}
    </aside>
  );
}
