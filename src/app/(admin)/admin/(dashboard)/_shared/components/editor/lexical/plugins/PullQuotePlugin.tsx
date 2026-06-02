/**
 * PullQuote Plugin
 *
 * @description プルクォート（強調引用）の挿入と構造管理を提供するプラグイン
 *
 * Gutenberg / Notion 準拠の「即挿入してインライン編集」パターン。
 * - INSERT_PULL_QUOTE_COMMAND: 引用テキストのみの最小構造を挿入（出典は任意）
 * - 構造検証トランスフォーマー（引用テキスト必須・出典は任意・順序保証）
 * - 矢印キーでの境界脱出 + 引用テキスト ↔ 出典の往復ナビゲーション
 *
 * スタイル・アクセントカラー・出典の有無は Inspector パネルで編集する。
 */

"use client";

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  type LexicalCommand,
  type LexicalNode,
  mergeRegister,
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createPullQuoteNode,
  $isPullQuoteNode,
  PullQuoteNode,
} from "../nodes/PullQuoteNode";
import {
  $createPullQuoteTextNode,
  $isPullQuoteTextNode,
  PullQuoteTextNode,
} from "../nodes/PullQuoteTextNode";
import {
  $isPullQuoteCitationNode,
  PullQuoteCitationNode,
} from "../nodes/PullQuoteCitationNode";

// =============================================================================
// Commands
// =============================================================================

export const INSERT_PULL_QUOTE_COMMAND: LexicalCommand<void> = createCommand(
  "INSERT_PULL_QUOTE_COMMAND",
);

// =============================================================================
// Utilities
// =============================================================================

/**
 * node が container の内側（自身を含む）にあるか
 */
function $isInside(node: LexicalNode, container: LexicalNode): boolean {
  let current: LexicalNode | null = node;
  while (current) {
    if (current.getKey() === container.getKey()) return true;
    current = current.getParent();
  }
  return false;
}

/**
 * 矢印キーで PullQuote 境界を脱出する。
 *
 * - 引用テキスト末尾で下キー → 出典があれば出典先頭へ、無ければブロック直後へ脱出
 * - 出典末尾で下キー → ブロック直後へ脱出
 * - 出典先頭で上キー → 引用テキスト末尾へ
 * - 引用テキスト先頭で上キー → ブロック直前へ脱出
 */
function $onEscape(direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  let pullQuoteNode: PullQuoteNode | null = null;
  let current = anchorNode.getParent();
  while (current) {
    if ($isPullQuoteNode(current)) {
      pullQuoteNode = current;
      break;
    }
    current = current.getParent();
  }
  if (!pullQuoteNode) return false;

  const textNode = pullQuoteNode.getChildren().find($isPullQuoteTextNode);
  const citationNode = pullQuoteNode
    .getChildren()
    .find($isPullQuoteCitationNode);

  const inText = textNode ? $isInside(anchorNode, textNode) : false;
  const inCitation = citationNode ? $isInside(anchorNode, citationNode) : false;

  const isAtStart = selection.anchor.offset === 0;
  const isAtEnd = selection.anchor.offset === anchorNode.getTextContentSize();

  if (direction === "up" && isAtStart) {
    if (inCitation && textNode) {
      // 出典先頭 → 引用テキスト末尾へ
      const lastChild = textNode.getLastChild();
      if (lastChild) {
        lastChild.selectEnd();
        return true;
      }
    }
    if (inText) {
      // 引用テキスト先頭 → ブロック直前へ脱出
      const paragraph = $createParagraphNode();
      pullQuoteNode.insertBefore(paragraph);
      paragraph.select();
      return true;
    }
  }

  if (direction === "down" && isAtEnd) {
    if (inText && citationNode) {
      // 引用テキスト末尾 → 出典先頭へ
      const firstChild = citationNode.getFirstChild();
      if (firstChild) {
        firstChild.selectStart();
        return true;
      }
    }
    if (inText || inCitation) {
      // 引用テキスト末尾（出典なし）/ 出典末尾 → ブロック直後へ脱出
      const paragraph = $createParagraphNode();
      pullQuoteNode.insertAfter(paragraph);
      paragraph.select();
      return true;
    }
  }

  return false;
}

// =============================================================================
// Component
// =============================================================================

export function PullQuotePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (
      !editor.hasNodes([
        PullQuoteNode,
        PullQuoteTextNode,
        PullQuoteCitationNode,
      ])
    ) {
      throw new Error(
        "PullQuotePlugin: PullQuoteNode, PullQuoteTextNode, PullQuoteCitationNode が登録されていません",
      );
    }

    return mergeRegister(
      // INSERT_PULL_QUOTE_COMMAND — 引用テキストのみの最小構造を挿入（出典は任意）
      editor.registerCommand(
        INSERT_PULL_QUOTE_COMMAND,
        () => {
          editor.update(() => {
            const pullQuote = $createPullQuoteNode();
            const textNode = $createPullQuoteTextNode();
            const textParagraph = $createParagraphNode();
            textNode.append(textParagraph);
            pullQuote.append(textNode);

            $insertNodeToNearestRoot(pullQuote);

            textParagraph.select();
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),

      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape("up"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape("down"),
        COMMAND_PRIORITY_LOW,
      ),

      // 構造検証: PullQuote（引用テキスト必須・出典は任意・順序は text → citation）
      editor.registerNodeTransform(PullQuoteNode, (node) => {
        let textNode: PullQuoteTextNode | null = null;
        let citationNode: PullQuoteCitationNode | null = null;

        for (const child of node.getChildren()) {
          if (child instanceof PullQuoteTextNode) {
            // 引用テキストは 1 つだけ残す
            if (textNode) child.remove();
            else textNode = child;
          } else if (child instanceof PullQuoteCitationNode) {
            // 出典は 1 つだけ残す
            if (citationNode) child.remove();
            else citationNode = child;
          } else {
            // 想定外の子は除去
            child.remove();
          }
        }

        // 引用テキストが無ければ先頭に追加
        if (!textNode) {
          const newText = $createPullQuoteTextNode();
          newText.append($createParagraphNode());
          const first = node.getFirstChild();
          if (first) first.insertBefore(newText);
          else node.append(newText);
          textNode = newText;
        }

        // 出典は引用テキストの後ろに並べる
        if (
          citationNode &&
          citationNode.getIndexWithinParent() < textNode.getIndexWithinParent()
        ) {
          textNode.insertAfter(citationNode);
        }
      }),

      // 構造検証: PullQuoteTextNode（空なら段落を補う）
      editor.registerNodeTransform(PullQuoteTextNode, (node) => {
        if (node.getChildren().length === 0) {
          node.append($createParagraphNode());
        }
      }),

      // 構造検証: PullQuoteCitationNode（空なら段落を補う）
      editor.registerNodeTransform(PullQuoteCitationNode, (node) => {
        if (node.getChildren().length === 0) {
          node.append($createParagraphNode());
        }
      }),
    );
  }, [editor]);

  return null;
}
