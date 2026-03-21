/**
 * Layout Plugin
 *
 * @description カラムレイアウトの挿入コマンドとキーボードナビ。
 * 子ノード数と `templateColumnsState` の整合は `registerLayoutNodeTransforms` のみが行う。
 *
 * 挿入位置は `@lexical/utils` の `$insertNodeToNearestRoot` に委譲（公式 JSDocどおり shadow root 境界で分割し、
 * キャレットに応じてカラム内ネストも可能）。列テンプレ変更は `$setState`（ツールバー / インスペクターのみ）。
 *
 * @see https://github.com/facebook/lexical/tree/main/packages/lexical-playground/src/nodes/LayoutContainerNode.ts
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  createCommand,
  mergeRegister,
  type LexicalCommand,
} from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $isLayoutContainerNode,
} from "../nodes/LayoutContainerNode";
import { $isLayoutItemNode } from "../nodes/LayoutItemNode";
import {
  $createPopulatedLayoutContainer,
  $hasLexicalAncestorWithKey,
} from "../lib/layout-insert";
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
import {
  LAYOUT_BREAKPOINT_MAX_PX,
  LAYOUT_NARROW_TEMPLATES,
  LAYOUT_TEMPLATES,
} from "../config/layout-templates";
import {
  $onHorizontalLayoutNavigation,
  $onVerticalEscapeLayout,
  $selectEndOfFirstLayoutItemBlock,
} from "./layout-navigation";
import { registerLayoutNodeTransforms } from "./register-layout-node-transforms";

// =============================================================================
// Commands
// =============================================================================

export type InsertLayoutPayload = {
  templateColumns: string;
  templateColumnsNarrow: string;
};

export const INSERT_LAYOUT_COMMAND: LexicalCommand<InsertLayoutPayload> =
  createCommand("INSERT_LAYOUT_COMMAND");

// =============================================================================
// Types
// =============================================================================

type LayoutPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Component
// =============================================================================

export function LayoutPlugin({ isOpen, onClose }: LayoutPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [selectedTemplate, setSelectedTemplate] = useState("1fr 1fr");
  const [selectedNarrow, setSelectedNarrow] = useState("1fr");

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_LAYOUT_COMMAND,
        (payload) => {
          editor.update(() => {
            const container = $createPopulatedLayoutContainer(
              payload.templateColumns,
              payload.templateColumnsNarrow,
            );
            const layoutKey = container.getKey();
            $insertNodeToNearestRoot(container);

            const sel = $getSelection();
            const caretInsideNewLayout =
              $isRangeSelection(sel) &&
              $hasLexicalAncestorWithKey(sel.anchor.getNode(), layoutKey);

            if (!caretInsideNewLayout) {
              const laidOut = $getNodeByKey(layoutKey);
              if ($isLayoutContainerNode(laidOut)) {
                const firstItem = laidOut.getFirstChild();
                if ($isLayoutItemNode(firstItem)) {
                  $selectEndOfFirstLayoutItemBlock(firstItem);
                }
              }
            }
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),

      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        () => $onVerticalEscapeLayout("up"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        () => $onVerticalEscapeLayout("down"),
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        () => $onHorizontalLayoutNavigation("left"),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        () => $onHorizontalLayoutNavigation("right"),
        COMMAND_PRIORITY_HIGH,
      ),

      registerLayoutNodeTransforms(editor),
    );
  }, [editor]);

  const handleInsert = () => {
    editor.dispatchCommand(INSERT_LAYOUT_COMMAND, {
      templateColumns: selectedTemplate,
      templateColumnsNarrow: selectedNarrow,
    });
    setSelectedTemplate("1fr 1fr");
    setSelectedNarrow("1fr");
    onClose();
  };

  const handleClose = () => {
    setSelectedTemplate("1fr 1fr");
    setSelectedNarrow("1fr");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>カラムレイアウトを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium block">
              広い画面の列（既定）
            </Label>
            <Select
              value={selectedTemplate}
              onValueChange={setSelectedTemplate}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUT_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value} textValue={t.label}>
                    <span className="flex flex-col gap-0.5 text-left">
                      <span>{t.label}</span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {t.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium block">
              狭い画面の列（〜{LAYOUT_BREAKPOINT_MAX_PX}px）
            </Label>
            <Select value={selectedNarrow} onValueChange={setSelectedNarrow}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUT_NARROW_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value} textValue={t.label}>
                    <span className="flex flex-col gap-0.5 text-left">
                      <span>{t.label}</span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {t.description}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
