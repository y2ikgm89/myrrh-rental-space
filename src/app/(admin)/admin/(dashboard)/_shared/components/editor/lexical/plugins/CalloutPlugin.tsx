/**
 * Callout Plugin
 *
 * @description コールアウト（注意書き）の挿入を提供するプラグイン
 *
 * ダイアログでタイプを選択し、Calloutノードを挿入
 */

"use client";

import { useEffect, useState } from "react";
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
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createCalloutNode,
  $isCalloutNode,
  isCalloutType,
  CalloutNode,
  type CalloutType,
  CALLOUT_TYPES,
} from "../nodes/CalloutNode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
} from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { CALLOUT_TYPE_LABELS } from "../config/node-labels";

// =============================================================================
// Commands
// =============================================================================

export type InsertCalloutPayload = {
  calloutType: CalloutType;
};

export const INSERT_CALLOUT_COMMAND: LexicalCommand<InsertCalloutPayload> =
  createCommand("INSERT_CALLOUT_COMMAND");

// =============================================================================
// Callout Templates
// =============================================================================

// =============================================================================
// Utilities
// =============================================================================

/**
 * 矢印キーでCallout境界を脱出
 */
function $onEscape(direction: "up" | "down"): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const node = selection.anchor.getNode();
  let calloutNode: CalloutNode | null = null;
  let current = node.getParent();

  while (current) {
    if ($isCalloutNode(current)) {
      calloutNode = current;
      break;
    }
    current = current.getParent();
  }

  if (!calloutNode) return false;

  const isAtStart = selection.anchor.offset === 0;
  const isAtEnd =
    selection.anchor.offset === selection.anchor.getNode().getTextContentSize();

  if ((direction === "up" && isAtStart) || (direction === "down" && isAtEnd)) {
    const paragraph = $createParagraphNode();
    if (direction === "up") {
      calloutNode.insertBefore(paragraph);
    } else {
      calloutNode.insertAfter(paragraph);
    }
    paragraph.select();
    return true;
  }

  return false;
}

// =============================================================================
// Types
// =============================================================================

type CalloutPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Component
// =============================================================================

export function CalloutPlugin({ isOpen, onClose }: CalloutPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [selectedType, setSelectedType] = useState<CalloutType>("info");

  // コマンドリスナー登録
  useEffect(() => {
    return mergeRegister(
      // INSERT_CALLOUT_COMMAND
      editor.registerCommand(
        INSERT_CALLOUT_COMMAND,
        (payload) => {
          editor.update(() => {
            const callout = $createCalloutNode(payload.calloutType);
            const paragraph = $createParagraphNode();
            callout.append(paragraph);

            $insertNodeToNearestRoot(callout);

            // Callout内の段落を選択
            paragraph.selectEnd();
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

      // 構造検証トランスフォーマー: Callout
      editor.registerNodeTransform(CalloutNode, (node) => {
        // 空のCalloutに段落を追加
        if (node.getChildren().length === 0) {
          const paragraph = $createParagraphNode();
          node.append(paragraph);
        }
      }),
    );
  }, [editor]);

  const handleInsert = () => {
    editor.dispatchCommand(INSERT_CALLOUT_COMMAND, {
      calloutType: selectedType,
    });
    setSelectedType("info");
    onClose();
  };

  const handleClose = () => {
    setSelectedType("info");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>コールアウトを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <Label className="text-sm font-medium mb-3 block">種類を選択</Label>
          <Select
            value={selectedType}
            onValueChange={(value) => {
              if (isCalloutType(value)) setSelectedType(value);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALLOUT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CALLOUT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
