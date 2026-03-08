/**
 * X (Twitter) Node
 *
 * @description X（Twitter）投稿を埋め込むDecoratorNode
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

// =============================================================================
// Validation
// =============================================================================

/**
 * tweetIdが有効かどうかを検証する
 * Twitter Snowflake IDは15-19桁の数字
 */
function isValidTweetId(tweetId: string): boolean {
  return /^\d{15,19}$/.test(tweetId);
}

// =============================================================================
// State
// =============================================================================

export const tweetIdState = createState("tweetId", {
  parse: (v: unknown): string => {
    if (typeof v === "string" && isValidTweetId(v)) return v;
    return "";
  },
});

// =============================================================================
// Component
// =============================================================================

function XComponent({
  tweetId,
  nodeKey,
}: {
  tweetId: string;
  nodeKey: NodeKey;
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      className="relative my-6 mx-auto max-w-xl"
    >
      <iframe
        src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`}
        title="X (Twitter) post"
        className="w-full min-h-[400px] rounded-lg border-0"
        scrolling="no"
      />
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertXElement(element: HTMLElement): null | DOMConversionOutput {
  if (element instanceof HTMLIFrameElement) {
    const src = element.getAttribute("src");
    if (src) {
      // platform.twitter.com/embed/Tweet.html?id=xxx 形式
      const embedMatch = src.match(
        /platform\.twitter\.com\/embed\/Tweet\.html\?id=(\d+)/,
      );
      if (embedMatch?.[1]) {
        const node = $createXNode({ tweetId: embedMatch[1] });
        return { node };
      }
    }
  }
  return null;
}

// =============================================================================
// Node Class
// =============================================================================

export class XNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("x", {
      extends: DecoratorNode,
      stateConfigs: [{ flat: true, stateConfig: tweetIdState }],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      iframe: () => ({
        conversion: $convertXElement,
        priority: 1, // YouTubeNode (priority: 0) より高い優先度
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const tweetId = $getState(this, tweetIdState);
    const div = document.createElement("div");
    div.setAttribute("data-x-tweet", "true");

    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "src",
      `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`,
    );
    iframe.setAttribute("title", "X (Twitter) post");
    iframe.setAttribute("scrolling", "no");

    div.appendChild(iframe);
    return { element: div };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-x-tweet", "true");
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <XComponent
        tweetId={$getState(this, tweetIdState)}
        nodeKey={this.getKey()}
      />
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * XNodeを作成する
 *
 * @param params - Xのパラメータ
 * @returns XNode インスタンス
 */
export function $createXNode({ tweetId }: { tweetId: string }): XNode {
  // セキュリティ: tweetIdは数字のみ許可（XSS防止）
  if (!isValidTweetId(tweetId)) {
    throw new Error(`Invalid tweetId: ${tweetId}. Must be 15-19 digits.`);
  }
  return $setState($create(XNode), tweetIdState, tweetId);
}

/**
 * ノードがXNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns XNodeの場合true
 */
export function $isXNode(node: LexicalNode | null | undefined): node is XNode {
  return node instanceof XNode;
}
