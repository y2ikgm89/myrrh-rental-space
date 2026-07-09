/**
 * MapEmbed Node
 *
 * @description Google マップを埋め込む DecoratorNode
 */

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { parseString } from "../config/type-guards";

// =============================================================================
// State
// =============================================================================

export const embedUrlState = createState("embedUrl", {
  parse: parseString,
});

export const mapLabelState = createState("mapLabel", {
  parse: parseString,
});

// =============================================================================
// Utilities
// =============================================================================

/**
 * Google Maps URL を埋め込み URL に変換する
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only accept Google Maps embed URLs (from "Share > Embed a map")
    if (
      (parsed.hostname.includes("google.com") ||
        parsed.hostname.includes("maps.google")) &&
      parsed.pathname.includes("/maps/embed")
    ) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertMapEmbedElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  if (!element.hasAttribute("data-map")) return null;
  const iframe = element.querySelector("iframe");
  const mapNode = $create(MapEmbedNode);
  if (iframe) {
    $setState(mapNode, embedUrlState, iframe.getAttribute("src") ?? "");
  }
  $setState(
    mapNode,
    mapLabelState,
    element.getAttribute("data-map-label") ?? "",
  );
  return { node: mapNode };
}

// =============================================================================
// Component
// =============================================================================

function MapEmbedComponent({
  embedUrl,
  label,
}: {
  embedUrl: string;
  label: string;
}) {
  return (
    <div data-map="true" className="flex flex-col gap-1">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        <iframe
          src={embedUrl}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={label || "Google マップ"}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Node Class
// =============================================================================

export class MapEmbedNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("mapEmbed", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: embedUrlState },
        { flat: true, stateConfig: mapLabelState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: () => ({
        conversion: $convertMapEmbedElement,
        priority: 1,
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const div = document.createElement("div");
    const label = $getState(this, mapLabelState);
    div.setAttribute("data-map", "true");
    if (label) div.setAttribute("data-map-label", label);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", $getState(this, embedUrlState));
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    div.appendChild(iframe);
    return { element: div };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-map", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <MapEmbedComponent
        embedUrl={$getState(this, embedUrlState)}
        label={$getState(this, mapLabelState)}
      />
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * MapEmbedNode を作成する
 */
export function $createMapEmbedNode(
  embedUrl: string,
  mapLabel = "",
): MapEmbedNode {
  const node = $create(MapEmbedNode);
  $setState(node, embedUrlState, embedUrl);
  $setState(node, mapLabelState, mapLabel);
  return node;
}

/**
 * ノードが MapEmbedNode かどうかを判定する
 */
export function $isMapEmbedNode(
  node: LexicalNode | null | undefined,
): node is MapEmbedNode {
  return node instanceof MapEmbedNode;
}
