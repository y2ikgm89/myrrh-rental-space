/**
 * X (Twitter) Node
 *
 * @description X（Twitter）投稿を埋め込むDecoratorNode
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

  // 修正: 従来は `iframe` タグを無条件 (src チェックなし) にマッチさせていたため、
  // Lexical の importDOM 選定アルゴリズム (`getConversionFunction`) が候補として
  // 常に非 null を返し、priority がより高い InstagramNode に無条件で敗れて
  // X の HTML round-trip がサイレントに破壊されていた。MapEmbedNode と同じ
  // 「outer 関数で src チェック → 非マッチは null」パターンに揃える。
  static override importDOM(): DOMConversionMap | null {
    return {
      iframe: (element: HTMLElement) => {
        const src = element.getAttribute("src") ?? "";
        if (!/platform\.twitter\.com\/embed\/Tweet\.html\?id=\d+/.test(src)) {
          return null;
        }
        return {
          conversion: $convertXElement,
          priority: 1, // YouTubeNode/VimeoNode (priority: 0) より高い優先度
        };
      },
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
