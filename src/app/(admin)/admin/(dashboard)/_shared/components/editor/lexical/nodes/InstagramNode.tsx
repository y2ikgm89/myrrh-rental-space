/**
 * Instagram Node
 *
 * @description Instagram投稿を埋め込むDecoratorNode
 */

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
 * postIdが有効かどうかを検証する
 * Instagram shortcodeは英数字とアンダースコア、ハイフンで構成される（通常11文字程度）
 */
function isValidPostId(postId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(postId);
}

// =============================================================================
// State
// =============================================================================

export const postIdState = createState("postId", {
  parse: (v: unknown): string => {
    if (typeof v === "string" && isValidPostId(v)) return v;
    return "";
  },
});

// =============================================================================
// Component
// =============================================================================

function InstagramComponent({
  postId,
  nodeKey,
}: {
  postId: string;
  nodeKey: NodeKey;
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      className="relative my-6 mx-auto max-w-[540px]"
    >
      <iframe
        src={`https://www.instagram.com/p/${postId}/embed`}
        title="Instagram post"
        className="w-full min-h-[500px] rounded-lg border-0"
        scrolling="no"
        allowTransparency
      />
    </div>
  );
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertInstagramElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  if (element instanceof HTMLDivElement) {
    const postId = element.getAttribute("data-instagram-post-id");
    if (postId && isValidPostId(postId)) {
      const node = $createInstagramNode({ postId });
      return { node };
    }
  }

  if (element instanceof HTMLIFrameElement) {
    const src = element.getAttribute("src");
    if (src) {
      // instagram.com/p/xxx/embed 形式
      const embedMatch = src.match(
        /instagram\.com\/p\/([a-zA-Z0-9_-]+)\/embed/,
      );
      if (embedMatch?.[1] && isValidPostId(embedMatch[1])) {
        const node = $createInstagramNode({ postId: embedMatch[1] });
        return { node };
      }
    }
  }
  return null;
}

// =============================================================================
// Node Class
// =============================================================================

export class InstagramNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config("instagram", {
      extends: DecoratorNode,
      stateConfigs: [{ flat: true, stateConfig: postIdState }],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-instagram-post-id")) {
          return {
            conversion: $convertInstagramElement,
            priority: 2,
          };
        }
        return null;
      },
      iframe: () => ({
        conversion: $convertInstagramElement,
        priority: 2, // YouTubeNode (priority: 0), XNode (priority: 1) より高い優先度
      }),
    };
  }

  override exportDOM(): DOMExportOutput {
    const postId = $getState(this, postIdState);
    const div = document.createElement("div");
    div.setAttribute("data-instagram-post-id", postId);

    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", `https://www.instagram.com/p/${postId}/embed`);
    iframe.setAttribute("title", "Instagram post");
    iframe.setAttribute("scrolling", "no");

    div.appendChild(iframe);
    return { element: div };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-instagram-post-id", $getState(this, postIdState));
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  override decorate(): ReactElement {
    return (
      <InstagramComponent
        postId={$getState(this, postIdState)}
        nodeKey={this.getKey()}
      />
    );
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * InstagramNodeを作成する
 *
 * @param params - Instagramのパラメータ
 * @returns InstagramNode インスタンス
 */
export function $createInstagramNode({
  postId,
}: {
  postId: string;
}): InstagramNode {
  // セキュリティ: postIdは英数字とアンダースコア、ハイフンのみ許可（XSS防止）
  if (!isValidPostId(postId)) {
    throw new Error(
      `Invalid postId: ${postId}. Must contain only alphanumeric characters, underscores, and hyphens.`,
    );
  }
  return $setState($create(InstagramNode), postIdState, postId);
}

/**
 * ノードがInstagramNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns InstagramNodeの場合true
 */
export function $isInstagramNode(
  node: LexicalNode | null | undefined,
): node is InstagramNode {
  return node instanceof InstagramNode;
}
