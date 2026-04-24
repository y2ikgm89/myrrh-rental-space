import Link from "next/link";
import Image from "next/image";
import { Fragment, type CSSProperties, type ReactElement } from "react";
import {
  PublicInquiryFormCard,
  type PublicInquiryFormMode,
} from "@/public/components/forms/public-inquiry-form-card";
import { cn } from "@/shared/lib/cn";
import { resolvePageBuilderNodeLayoutBox } from "@/shared/lib/page-builder/layout";
import type { PageBuilderResolvedMediaMap } from "@/shared/lib/page-builder/media";
import { resolvePageBuilderNodeHidden } from "@/shared/lib/page-builder/visibility";
import {
  getPageBuilderEmbedValidationMessage,
  isPageBuilderInternalHref,
  resolvePageBuilderEmbedConfig,
  resolvePageBuilderHref,
} from "@/shared/lib/page-builder/urls";
import type {
  PageBuilderBreakpoint,
  PageBuilderDocument,
  PageBuilderLayoutBox,
  PageBuilderNode,
} from "@/shared/lib/page-builder/schema";

type FreeformPageRendererProps = {
  document: PageBuilderDocument;
  media?: PageBuilderResolvedMediaMap | undefined;
  breakpoint?: PageBuilderBreakpoint;
  formMode?: PublicInquiryFormMode | undefined;
  turnstileSiteKey?: string | null | undefined;
  className?: string;
  selectedNodeId?: string | null;
  selectedNodeIds?: readonly string[] | undefined;
  onNodeSelect?: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  layoutPreview?: {
    nodeId: string;
    box: PageBuilderLayoutBox;
  } | null;
  layoutPreviews?: readonly FreeformPageBuilderLayoutPreview[] | undefined;
};

export type FreeformPageBuilderNodeSelectOptions = {
  additive: boolean;
};

export type FreeformPageBuilderLayoutPreview = {
  nodeId: string;
  box: PageBuilderLayoutBox;
};

type PageBuilderSelectEvent = {
  preventDefault(): void;
  stopPropagation(): void;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
};

const backgroundTokenClasses = {
  background: "bg-background",
  muted: "bg-muted",
  card: "bg-card",
  accent: "bg-accent",
  primary: "bg-primary",
  foreground: "bg-foreground",
  "muted-foreground": "bg-muted",
  border: "bg-border",
  "primary-foreground": "bg-background",
} as const;

const textTokenClasses = {
  foreground: "text-foreground",
  "muted-foreground": "text-muted-foreground",
  "primary-foreground": "text-primary-foreground",
  primary: "text-primary",
  accent: "text-accent-foreground",
  background: "text-background",
  muted: "text-muted-foreground",
  card: "text-card-foreground",
  border: "text-muted-foreground",
} as const;

const borderTokenClasses = {
  border: "border-border",
  primary: "border-primary",
  accent: "border-accent",
  muted: "border-border",
  card: "border-border",
  foreground: "border-foreground",
  background: "border-border",
  "muted-foreground": "border-border",
  "primary-foreground": "border-border",
} as const;

function resolveDimension(value: number | "hug" | "fill"): string {
  if (typeof value === "number") {
    return `${value}px`;
  }

  if (value === "fill") {
    return "100%";
  }

  return "auto";
}

function resolveImageSizes(
  width: number | "hug" | "fill",
): `${number}px` | "100vw" {
  return typeof width === "number" ? `${width}px` : "100vw";
}

function resolveAlignItems(
  value: PageBuilderNode["style"]["alignItems"],
): CSSProperties["alignItems"] {
  if (!value) return undefined;
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

function resolveJustifyContent(
  value: PageBuilderNode["style"]["justifyContent"],
): CSSProperties["justifyContent"] {
  if (!value) return undefined;
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

function resolveGridTemplateColumns(
  value: PageBuilderNode["style"]["gridMinColumnWidth"],
): CSSProperties["gridTemplateColumns"] {
  const minColumnWidth = value ?? 240;
  return `repeat(auto-fit, minmax(min(100%, ${minColumnWidth}px), 1fr))`;
}

function getResolvedLayoutBox(
  node: PageBuilderNode,
  breakpoint: PageBuilderBreakpoint,
  layoutPreview: FreeformPageRendererProps["layoutPreview"],
  layoutPreviews: FreeformPageRendererProps["layoutPreviews"],
): PageBuilderLayoutBox {
  const preview = layoutPreviews?.find((entry) => entry.nodeId === node.id);
  if (preview) {
    return preview.box;
  }

  if (layoutPreview?.nodeId === node.id) {
    return layoutPreview.box;
  }

  return resolvePageBuilderNodeLayoutBox(node, breakpoint);
}

function getNodeInlineStyle(
  node: PageBuilderNode,
  box: PageBuilderLayoutBox,
  parentLayoutMode: PageBuilderNode["layoutMode"] | null,
): CSSProperties {
  const style = node.style;
  const inlineStyle: CSSProperties = {
    width: resolveDimension(box.width),
    height: resolveDimension(box.height),
    opacity: style.opacity,
    padding: style.padding ? `${style.padding}px` : undefined,
    gap: style.gap ? `${style.gap}px` : undefined,
    borderRadius: style.borderRadius ? `${style.borderRadius}px` : undefined,
    borderWidth: style.borderWidth ? `${style.borderWidth}px` : undefined,
    borderStyle: style.borderWidth ? "solid" : undefined,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    fontWeight: style.fontWeight,
    textAlign: style.textAlign,
  };

  if (parentLayoutMode === "absolute" && node.type !== "root") {
    inlineStyle.position = "absolute";
    inlineStyle.left = `${box.x}px`;
    inlineStyle.top = `${box.y}px`;
    inlineStyle.zIndex = box.zIndex;
  }

  if (
    node.type === "root" ||
    node.type === "frame" ||
    node.type === "stack" ||
    node.type === "grid"
  ) {
    inlineStyle.display = node.layoutMode === "grid" ? "grid" : "flex";
    if (node.layoutMode === "grid") {
      inlineStyle.gridTemplateColumns = resolveGridTemplateColumns(
        style.gridMinColumnWidth,
      );
    } else {
      inlineStyle.flexDirection = style.direction === "row" ? "row" : "column";
    }
    inlineStyle.alignItems = resolveAlignItems(style.alignItems);
    inlineStyle.justifyContent = resolveJustifyContent(style.justifyContent);
    if (node.type === "root") {
      inlineStyle.position = "relative";
      inlineStyle.minHeight = "100%";
    }
    if (node.layoutMode === "absolute") {
      inlineStyle.position = "relative";
      inlineStyle.minHeight = inlineStyle.minHeight ?? "120px";
    }
  }

  return inlineStyle;
}

function createPlaceholderStyle(
  inlineStyle: CSSProperties,
  minHeight: number,
): CSSProperties {
  return {
    ...inlineStyle,
    minHeight:
      inlineStyle.height === undefined || inlineStyle.height === "auto"
        ? `${minHeight}px`
        : inlineStyle.minHeight,
  };
}

function renderNode(
  document: PageBuilderDocument,
  media: PageBuilderResolvedMediaMap,
  nodeId: string,
  breakpoint: PageBuilderBreakpoint,
  formMode: PublicInquiryFormMode,
  turnstileSiteKey: string | null,
  parentLayoutMode: PageBuilderNode["layoutMode"] | null,
  selectedNodeId: string | null | undefined,
  selectedNodeIds: readonly string[] | undefined,
  onNodeSelect:
    | ((nodeId: string, options?: FreeformPageBuilderNodeSelectOptions) => void)
    | undefined,
  layoutPreview: FreeformPageRendererProps["layoutPreview"],
  layoutPreviews: FreeformPageRendererProps["layoutPreviews"],
): ReactElement | null {
  const node = document.nodes[nodeId];
  if (!node || resolvePageBuilderNodeHidden(node, breakpoint)) {
    return null;
  }

  const box = getResolvedLayoutBox(
    node,
    breakpoint,
    layoutPreview,
    layoutPreviews,
  );
  const inlineStyle = getNodeInlineStyle(node, box, parentLayoutMode);
  const classes = cn(
    node.style.backgroundToken
      ? backgroundTokenClasses[node.style.backgroundToken]
      : undefined,
    node.style.textToken ? textTokenClasses[node.style.textToken] : undefined,
    node.style.borderToken
      ? borderTokenClasses[node.style.borderToken]
      : undefined,
    onNodeSelect ? "cursor-pointer" : undefined,
  );

  const handleSelect =
    onNodeSelect === undefined
      ? undefined
      : (event: PageBuilderSelectEvent) => {
          event.preventDefault();
          event.stopPropagation();
          onNodeSelect(node.id, {
            additive: event.metaKey || event.ctrlKey || event.shiftKey,
          });
        };

  const children = node.children.map((childId) => (
    <Fragment key={childId}>
      {renderNode(
        document,
        media,
        childId,
        breakpoint,
        formMode,
        turnstileSiteKey,
        node.layoutMode,
        selectedNodeId,
        selectedNodeIds,
        onNodeSelect,
        layoutPreview,
        layoutPreviews,
      )}
    </Fragment>
  ));

  if (node.type === "text") {
    const Tag = node.content.tag;
    return (
      <Tag
        key={node.id}
        className={classes}
        style={inlineStyle}
        onClick={handleSelect}
        data-page-builder-node-id={node.id}
      >
        {node.content.text}
      </Tag>
    );
  }

  if (node.type === "image") {
    const asset =
      node.content.mediaId === null
        ? null
        : (media[node.content.mediaId] ?? null);
    const imageWrapperStyle: CSSProperties = {
      ...inlineStyle,
      position: inlineStyle.position ?? "relative",
      overflow: "hidden",
      minHeight:
        box.height === "hug" || inlineStyle.height === "auto"
          ? "180px"
          : inlineStyle.minHeight,
    };
    const imageStyle: CSSProperties = {
      objectFit: node.content.objectFit,
    };

    if (asset === null) {
      return (
        <div
          key={node.id}
          className={cn(
            "flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground",
            classes,
          )}
          style={createPlaceholderStyle(inlineStyle, 180)}
          onClick={handleSelect}
          data-page-builder-node-id={node.id}
        >
          画像が未選択です
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className={classes}
        style={imageWrapperStyle}
        onClick={handleSelect}
        data-page-builder-node-id={node.id}
      >
        <Image
          src={asset.url}
          alt={node.content.alt || asset.alt || ""}
          fill
          sizes={resolveImageSizes(box.width)}
          unoptimized
          className="block"
          style={imageStyle}
        />
      </div>
    );
  }

  if (node.type === "button") {
    const href = resolvePageBuilderHref(node.content.url);
    const variantClasses =
      node.content.variant === "primary"
        ? "bg-primary text-primary-foreground"
        : node.content.variant === "secondary"
          ? "border border-border bg-card text-card-foreground"
          : "border border-border bg-transparent text-foreground";
    const buttonClasses = cn(
      "inline-flex items-center justify-center rounded-md px-4 py-3 text-sm font-medium",
      variantClasses,
      classes,
    );

    if (href === null) {
      return (
        <div
          key={node.id}
          className={buttonClasses}
          style={inlineStyle}
          onClick={handleSelect}
          data-page-builder-node-id={node.id}
          aria-disabled="true"
        >
          {node.content.label}
        </div>
      );
    }

    if (onNodeSelect === undefined && isPageBuilderInternalHref(href)) {
      return (
        <Link
          key={node.id}
          href={href}
          className={buttonClasses}
          style={inlineStyle}
          data-page-builder-node-id={node.id}
        >
          {node.content.label}
        </Link>
      );
    }

    return (
      <a
        key={node.id}
        href={href}
        className={buttonClasses}
        style={inlineStyle}
        onClick={handleSelect}
        data-page-builder-node-id={node.id}
      >
        {node.content.label}
      </a>
    );
  }

  if (node.type === "divider") {
    return (
      <div
        key={node.id}
        className={cn("w-full border-t", classes)}
        style={inlineStyle}
        onClick={handleSelect}
        data-page-builder-node-id={node.id}
      />
    );
  }

  if (node.type === "spacer") {
    return (
      <div
        key={node.id}
        className={classes}
        style={inlineStyle}
        onClick={handleSelect}
        data-page-builder-node-id={node.id}
      />
    );
  }

  if (node.type === "embed") {
    const embedConfig = resolvePageBuilderEmbedConfig(
      node.content.provider,
      node.content.url,
    );

    if (embedConfig === null) {
      return (
        <div
          key={node.id}
          className={cn(
            "flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground",
            classes,
          )}
          style={createPlaceholderStyle(inlineStyle, 220)}
          onClick={handleSelect}
          data-page-builder-node-id={node.id}
        >
          {getPageBuilderEmbedValidationMessage(node.content.provider)}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card/40",
          classes,
        )}
        style={createPlaceholderStyle(inlineStyle, embedConfig.minHeight)}
        onClick={handleSelect}
        data-page-builder-node-id={node.id}
      >
        <iframe
          src={embedConfig.src}
          title={embedConfig.title}
          allow={embedConfig.allow}
          allowFullScreen={embedConfig.allowFullScreen}
          loading={embedConfig.loading}
          referrerPolicy={embedConfig.referrerPolicy}
          scrolling={embedConfig.scrolling}
          className="h-full w-full border-0"
          style={onNodeSelect ? { pointerEvents: "none" } : undefined}
        />
      </div>
    );
  }

  if (node.type === "form") {
    return (
      <div
        key={node.id}
        className={classes}
        style={inlineStyle}
        onClick={handleSelect}
        data-page-builder-node-id={node.id}
      >
        <div style={onNodeSelect ? { pointerEvents: "none" } : undefined}>
          <PublicInquiryFormCard
            mode={formMode}
            turnstileSiteKey={turnstileSiteKey}
            title={node.content.title ?? "お問い合わせフォーム"}
            description={
              node.content.description ??
              "ご相談内容を入力いただくと、通常1営業日以内に担当者よりご連絡します。"
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div
      key={node.id}
      className={classes}
      style={inlineStyle}
      onClick={handleSelect}
      data-page-builder-node-id={node.id}
    >
      {children}
    </div>
  );
}

export function FreeformPageRenderer({
  document,
  media = {},
  breakpoint = "desktop",
  formMode,
  turnstileSiteKey = null,
  className,
  selectedNodeId,
  selectedNodeIds,
  onNodeSelect,
  layoutPreview,
  layoutPreviews,
}: FreeformPageRendererProps): ReactElement {
  const resolvedFormMode = formMode ?? (onNodeSelect ? "disabled" : "live");
  const root = renderNode(
    document,
    media,
    document.rootId,
    breakpoint,
    resolvedFormMode,
    turnstileSiteKey,
    null,
    selectedNodeId,
    selectedNodeIds,
    onNodeSelect,
    layoutPreview,
    layoutPreviews,
  );

  return (
    <div
      className={cn(
        "w-full",
        backgroundTokenClasses[document.canvas.backgroundToken],
        document.canvas.width === "boxed" ? "mx-auto max-w-7xl" : undefined,
        className,
      )}
    >
      {root}
    </div>
  );
}
