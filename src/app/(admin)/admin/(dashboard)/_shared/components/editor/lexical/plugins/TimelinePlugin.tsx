/**
 * Timeline Plugin
 *
 * @description タイムラインの挿入を提供するプラグイン
 *
 * ダイアログで方向（縦/横）を選択し、TimelineContainerNode と初期アイテムを挿入する
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createTimelineContainerNode,
  $createTimelineItemNode,
  TimelineContainerNode,
  type TimelineDirection,
} from "../nodes/TimelineNode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
} from "@/admin/components/ui";
import { RadioGroup, RadioGroupItem } from "@/admin/components/ui/radio-group";

// =============================================================================
// Types
// =============================================================================

type TimelinePluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Constants
// =============================================================================

const DIRECTION_OPTIONS: readonly {
  value: TimelineDirection;
  label: string;
}[] = [
  { value: "vertical", label: "縦（垂直）" },
  { value: "horizontal", label: "横（水平）" },
];

// =============================================================================
// Component
// =============================================================================

export function TimelinePlugin({ isOpen, onClose }: TimelinePluginProps) {
  const [editor] = useLexicalComposerContext();
  const [direction, setDirection] = useState<TimelineDirection>("vertical");

  // ノードトランスフォーム: 空のコンテナにアイテムを追加
  useEffect(() => {
    return editor.registerNodeTransform(TimelineContainerNode, (node) => {
      if (node.getChildren().length === 0) {
        const item = $createTimelineItemNode();
        node.append(item);
      }
    });
  }, [editor]);

  const handleInsert = () => {
    editor.update(() => {
      const container = $createTimelineContainerNode(direction);
      const item1 = $createTimelineItemNode({
        year: "2024",
        label: "ステップ 1",
      });
      const item2 = $createTimelineItemNode({
        year: "2025",
        label: "ステップ 2",
      });
      container.append(item1);
      container.append(item2);
      $insertNodeToNearestRoot(container);
    });
    setDirection("vertical");
    onClose();
  };

  const handleClose = () => {
    setDirection("vertical");
    onClose();
  };

  const handleDirectionChange = (value: string) => {
    if (value === "vertical" || value === "horizontal") {
      setDirection(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>タイムラインを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium block">方向</Label>
            <RadioGroup
              value={direction}
              onValueChange={handleDirectionChange}
              className="flex gap-4"
            >
              {DIRECTION_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`timeline-direction-${option.value}`}
                  />
                  <Label
                    htmlFor={`timeline-direction-${option.value}`}
                    className="font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
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
