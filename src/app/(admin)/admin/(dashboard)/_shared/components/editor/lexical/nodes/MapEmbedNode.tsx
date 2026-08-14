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
import { isAllowedLexicalIframeHostname } from "@/shared/lib/html/lexical-html-sanitize-config";

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
  const embedUrl = iframe?.getAttribute("src") ?? "";
  if (!isAllowedLexicalIframeHostname(embedUrl)) return null;
  const mapNode = $create(MapEmbedNode);
  $setState(mapNode, embedUrlState, embedUrl);
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
      <div className="relative aspect-video w-full">
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

  // 修正: 従来は `div` タグを無条件 (要素チェックなし) にマッチさせていたため、
  // Lexical の importDOM 選定アルゴリズム (`getConversionFunction`) が
  // 同一 priority の他 div ベースカスタムノード (ButtonNode 等) を EDITOR_NODES
  // 登録順で後勝ちに上書きしてしまい、無関係な <div> の HTML round-trip が
  // サイレントに破壊されていた。GalleryContainerNode/PageBreakNode と同じ
  // 「outer 関数で属性チェック → 非マッチは null」パターンに揃える。
  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-map")) {
          return {
            conversion: $convertMapEmbedElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const div = document.createElement("div");
    const label = $getState(this, mapLabelState);
    div.setAttribute("data-map", "true");
    if (label) {
      div.setAttribute("data-map-label", label);
      const labelEl = document.createElement("p");
      labelEl.setAttribute("data-map-label-text", "");
      labelEl.textContent = label;
      div.appendChild(labelEl);
    }
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", $getState(this, embedUrlState));
    iframe.setAttribute("title", label || "Google マップ");
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

  /**
   * block DOM を出す DecoratorNode は block として扱わせる（監査 F-26）。
   *
   * Lexical の DecoratorNode 既定は `isInline() === true`。inline のままだと
   * `$insertNodes` が ParagraphNode の**子**として splice するので、exportDOM は
   * `<p>前半<div>…</div>後半</p>` を出す。保存パイプラインの enrich が DOMParser で
   * 再パースするため、HTML 仕様どおり `<div>` の直前で `<p>` が閉じられ、
   * **画像より後ろの本文が `<p>` の外へ出て段落スタイルを失い、末尾に空段落が残る**。
   * 編集画面は Lexical が DOM を programmatic に組むので再パースが起きず、
   * 管理者には正常に見える。
   */
  override isInline(): false {
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
