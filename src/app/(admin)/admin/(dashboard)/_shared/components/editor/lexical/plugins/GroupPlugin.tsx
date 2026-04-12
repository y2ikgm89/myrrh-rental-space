/**
 * Group Plugin
 *
 * @description グループ（ボックス装飾コンテナ）の挿入と構造管理
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
  $createGroupNode,
  $isGroupNode,
  GroupNode,
  type GroupStyle,
} from "../nodes/GroupNode";

// =============================================================================
// Commands
// =============================================================================

export type InsertGroupPayload = {
  groupStyle: GroupStyle;
};

export const INSERT_GROUP_COMMAND: LexicalCommand<InsertGroupPayload> =
  createCommand("INSERT_GROUP_COMMAND");

// =============================================================================
// Utilities
// =============================================================================

function $onEscape(editor: LexicalEditor, direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const node = selection.anchor.getNode();
  let groupNode: GroupNode | null = null;
  let current = node.getParent();

  while (current) {
    if ($isGroupNode(current)) {
      groupNode = current;
      break;
    }
    current = current.getParent();
  }

  if (!groupNode) return false;

  const isAtStart = selection.anchor.offset === 0;
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize();

  if ((direction === "up" && isAtStart) || (direction === "down" && isAtEnd)) {
    const paragraph = $createParagraphNode();
    if (direction === "up") {
      groupNode.insertBefore(paragraph);
    } else {
      groupNode.insertAfter(paragraph);
    }
    paragraph.select();
    return true;
  }

  return false;
}

// =============================================================================
// Component
// =============================================================================

export function GroupPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_GROUP_COMMAND,
        (payload) => {
          editor.update(() => {
            const group = $createGroupNode(payload.groupStyle);
            const paragraph = $createParagraphNode();
            group.append(paragraph);
            $insertNodeToNearestRoot(group);
            paragraph.selectEnd();
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
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
      editor.registerNodeTransform(GroupNode, (node) => {
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode();
          node.append(paragraph);
        }
      }),
    );
  }, [editor]);

  return null;
}
