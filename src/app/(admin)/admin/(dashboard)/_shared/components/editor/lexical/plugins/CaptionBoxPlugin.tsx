/**
 * CaptionBox Plugin
 *
 * @description キャプションボックスの挿入と構造検証を提供するプラグイン
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
  mergeRegister,
  type LexicalCommand,
  type LexicalEditor,
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createCaptionBoxNode,
  $createCaptionBoxTitleNode,
  $createCaptionBoxContentNode,
  $isCaptionBoxNode,
  $isCaptionBoxTitleNode,
  $isCaptionBoxContentNode,
  CaptionBoxNode,
} from "../nodes/CaptionBoxNode";

// =============================================================================
// Commands
// =============================================================================

export const INSERT_CAPTION_BOX_COMMAND: LexicalCommand<void> =
  createCommand("INSERT_CAPTION_BOX");

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでCaptionBox境界を脱出
 */
function $onEscape(editor: LexicalEditor, direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const node = selection.anchor.getNode();
  let captionBoxNode: CaptionBoxNode | null = null;
  let current = node.getParent();

  while (current) {
    if ($isCaptionBoxNode(current)) {
      captionBoxNode = current;
      break;
    }
    current = current.getParent();
  }

  if (!captionBoxNode) return false;

  const isAtStart = selection.anchor.offset === 0;
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize();

  if ((direction === "up" && isAtStart) || (direction === "down" && isAtEnd)) {
    const paragraph = $createParagraphNode();
    if (direction === "up") {
      captionBoxNode.insertBefore(paragraph);
    } else {
      captionBoxNode.insertAfter(paragraph);
    }
    paragraph.select();
    return true;
  }

  return false;
}

// =============================================================================
// Component
// =============================================================================

export function CaptionBoxPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      // INSERT_CAPTION_BOX_COMMAND
      editor.registerCommand(
        INSERT_CAPTION_BOX_COMMAND,
        () => {
          editor.update(() => {
            const captionBox = $createCaptionBoxNode();
            const title = $createCaptionBoxTitleNode();
            const content = $createCaptionBoxContentNode();
            const titleParagraph = $createParagraphNode();
            const contentParagraph = $createParagraphNode();

            title.append(titleParagraph);
            content.append(contentParagraph);
            captionBox.append(title);
            captionBox.append(content);

            $insertNodeToNearestRoot(captionBox);

            // Focus title paragraph
            titleParagraph.selectEnd();
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),

      // 矢印キーリスナー
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onEscape(editor, "up"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onEscape(editor, "down"),
        COMMAND_PRIORITY_LOW,
      ),

      // 構造検証: CaptionBoxNode は title + content を持つ必要がある
      editor.registerNodeTransform(CaptionBoxNode, (node) => {
        const children = node.getChildren();
        const hasTitle = children.some($isCaptionBoxTitleNode);
        const hasContent = children.some($isCaptionBoxContentNode);

        if (!hasTitle) {
          const title = $createCaptionBoxTitleNode();
          const paragraph = $createParagraphNode();
          title.append(paragraph);
          const firstChild = node.getFirstChild();
          if (firstChild) {
            firstChild.insertBefore(title);
          } else {
            node.append(title);
          }
        }

        if (!hasContent) {
          const content = $createCaptionBoxContentNode();
          const paragraph = $createParagraphNode();
          content.append(paragraph);
          node.append(content);
        }
      }),
    );
  }, [editor]);

  return null;
}
