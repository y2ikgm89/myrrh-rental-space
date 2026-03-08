/**
 * Vimeo Node
 *
 * @description Vimeo動画を埋め込むDecoratorNode
 */

"use client";

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
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

export const vimeoVideoIdState = createState("videoId", {
  parse: parseString,
});

// =============================================================================
// Utilities
// =============================================================================

/**
 * Vimeo URLからビデオIDを抽出する
 */
export function extractVimeoId(url: string): string | null {
  const match = url.match(
    /vimeo\.com(?:\/(?:channels\/\w+|groups\/[^/]+\/videos|video))?\/(\d+)/,
  );
  return match?.[1] ?? null;
}

// =============================================================================
// Component
// =============================================================================

function VimeoComponent({
  videoId,
  nodeKey,
}: {
  videoId: string;
  nodeKey: NodeKey;
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      className="relative my-6 aspect-video w-full max-w-3xl mx-auto"
    >
      <iframe
        src={`https://player.vimeo.com/video/${videoId}`}
        title="Vimeo video"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full rounded-lg"
      />
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertVimeoElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  if (element instanceof HTMLIFrameElement) {
    const src = element.getAttribute("src");
    if (src) {
      const match = src.match(/player\.vimeo\.com\/video\/(\d+)/);
      if (match?.[1]) {
        const node = $createVimeoNode({ videoId: match[1] });
        return { node };
      }
    }
  }
  return null;
}

// =============================================================================
// Node Class
// =============================================================================

export class VimeoNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("vimeo", {
      extends: DecoratorNode,
      stateConfigs: [{ flat: true, stateConfig: vimeoVideoIdState }],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      iframe: () => ({
        conversion: $convertVimeoElement,
        priority: 0,
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const videoId = $getState(this, vimeoVideoIdState);
    const div = document.createElement("div");
    div.setAttribute("data-vimeo", "true");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", `https://player.vimeo.com/video/${videoId}`);
    iframe.setAttribute("title", "Vimeo video");
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");

    div.appendChild(iframe);
    return { element: div };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-vimeo", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <VimeoComponent
        videoId={$getState(this, vimeoVideoIdState)}
        nodeKey={this.getKey()}
      />
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * VimeoNodeを作成する
 *
 * @param params - Vimeoのパラメータ
 * @returns VimeoNode インスタンス
 */
export function $createVimeoNode({ videoId }: { videoId: string }): VimeoNode {
  return $setState($create(VimeoNode), vimeoVideoIdState, videoId);
}

/**
 * ノードがVimeoNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns VimeoNodeの場合true
 */
export function $isVimeoNode(
  node: LexicalNode | null | undefined,
): node is VimeoNode {
  return node instanceof VimeoNode;
}
