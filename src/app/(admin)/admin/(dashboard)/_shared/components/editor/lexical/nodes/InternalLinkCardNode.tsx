/**
 * Internal Link Card Node
 *
 * @description サイト内コンテンツ（記事 / お知らせ / スペース / イベント）への
 * リンクカードを表す DecoratorNode。
 *
 * 外部リンクカード（{@link BookmarkNode}）が OGP スナップショットをノードに保存するのに対し、
 * 本ノードは参照 `{ contentType, contentId }` のみを保存する。`exportDOM` は空の
 * プレースホルダー `<a data-internal-link-card>` を出力し、公開描画時に
 * `resolveInternalLinkCards`（`@/shared/lib/lexical/resolve-internal-link-cards`）が
 * DB から最新のタイトル / サムネ / URL を解決してカード本体へ差し替える。
 * 参照先が削除 / 非公開なら自動で非表示になる（404 カードを防ぐ）。
 */

"use client";

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
import { IconLink } from "@tabler/icons-react";
import { parseString } from "../config/type-guards";
import {
  type LinkCardContentType,
  LINK_CARD_TYPE_LABELS,
  isLinkCardContentType,
} from "@/shared/domain/link-cards/content-types";

// =============================================================================
// State
// =============================================================================

export const internalLinkCardContentTypeState = createState("contentType", {
  parse: (v: unknown): LinkCardContentType =>
    typeof v === "string" && isLinkCardContentType(v) ? v : "post",
});

export const internalLinkCardContentIdState = createState("contentId", {
  parse: parseString,
});

// =============================================================================
// Editor preview component
// =============================================================================

function InternalLinkCardComponent({
  contentType,
  contentId,
}: {
  contentType: LinkCardContentType;
  contentId: string;
}): ReactElement {
  return (
    <div
      data-internal-link-card
      className="my-6 flex items-center gap-3 rounded-lg border bg-muted/40 p-4"
    >
      <IconLink
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {LINK_CARD_TYPE_LABELS[contentType]}
          （公開ページで最新情報に展開されます）
        </p>
        <p className="truncate text-sm font-medium">{contentId}</p>
      </div>
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertInternalLinkCardElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const contentTypeAttr = element.getAttribute("data-content-type") ?? "";
  const contentType = isLinkCardContentType(contentTypeAttr)
    ? contentTypeAttr
    : "post";
  const contentId = element.getAttribute("data-content-id") ?? "";
  return { node: $createInternalLinkCardNode({ contentType, contentId }) };
}

// =============================================================================
// Node Class
// =============================================================================

export class InternalLinkCardNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("internal-link-card", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: internalLinkCardContentTypeState },
        { flat: true, stateConfig: internalLinkCardContentIdState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      a: (element: HTMLElement) => {
        if (element.hasAttribute("data-internal-link-card")) {
          return { conversion: $convertInternalLinkCardElement, priority: 2 };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const contentType = $getState(this, internalLinkCardContentTypeState);
    const contentId = $getState(this, internalLinkCardContentIdState);
    const link = document.createElement("a");
    link.setAttribute("data-internal-link-card", "true");
    link.setAttribute("data-content-type", contentType);
    link.setAttribute("data-content-id", contentId);
    link.setAttribute("href", "#");
    return { element: link };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-internal-link-card", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <InternalLinkCardComponent
        contentType={$getState(this, internalLinkCardContentTypeState)}
        contentId={$getState(this, internalLinkCardContentIdState)}
      />
    );
  }
}

// =============================================================================
// Factory / Guard
// =============================================================================

export function $createInternalLinkCardNode({
  contentType,
  contentId,
}: {
  contentType: LinkCardContentType;
  contentId: string;
}): InternalLinkCardNode {
  const node = $create(InternalLinkCardNode);
  $setState(node, internalLinkCardContentTypeState, contentType);
  $setState(node, internalLinkCardContentIdState, contentId);
  return node;
}

export function $isInternalLinkCardNode(
  node: LexicalNode | null | undefined,
): node is InternalLinkCardNode {
  return node instanceof InternalLinkCardNode;
}
