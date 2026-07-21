/**
 * Timeline Container Inspector Panel
 *
 * @description TimelineContainerNodeのプロパティ編集パネル。
 * 項目（{@link TimelineItemNode}）の追加・削除もここで行う
 * （挿入時は2件のみで初期化されるため、増減する唯一の手段）。
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  $isTimelineContainerNode,
  $isTimelineItemNode,
  $createTimelineItemNode,
  type TimelineContainerNode,
  type TimelineDirection,
  timelineDirectionState,
  timelineColorState,
} from "../../nodes/TimelineNode";
import {
  isAccentColor,
  ACCENT_COLORS,
  ACCENT_COLOR_LABELS,
} from "../../config/accent-colors";
import type { AccentColor } from "../../config/accent-colors";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Button, Label } from "@/admin/components/ui";
import { RadioGroup, RadioGroupItem } from "@/admin/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";

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

const MIN_TIMELINE_ITEMS = 1;
const MAX_TIMELINE_ITEMS = 24;

// =============================================================================
// Types
// =============================================================================

type TimelineContainerInspectorPanelProps = {
  nodeKey: string;
  node: TimelineContainerNode;
};

// =============================================================================
// Component
// =============================================================================

export function TimelineContainerInspectorPanel({
  nodeKey,
  node,
}: TimelineContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isTimelineContainerNode);

  const { direction, color, itemCount } = editor.read(() => ({
    direction: $getState(node, timelineDirectionState),
    color: $getState(node, timelineColorState),
    itemCount: node.getChildren().filter($isTimelineItemNode).length,
  }));

  const handleAddItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isTimelineItemNode);
      if (items.length >= MAX_TIMELINE_ITEMS) return;
      n.append($createTimelineItemNode());
    });
  };

  const handleRemoveLastItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isTimelineItemNode);
      if (items.length <= MIN_TIMELINE_ITEMS) return;
      items[items.length - 1]?.remove();
    });
  };

  const handleDirectionChange = (value: string) => {
    if (value === "vertical" || value === "horizontal") {
      updateNode((n) => {
        $setState(n, timelineDirectionState, value);
      });
    }
  };

  const handleColorChange = (value: string) => {
    if (isAccentColor(value)) {
      updateNode((n) => {
        $setState(n, timelineColorState, value);
      });
    }
  };

  const accentColorValue: AccentColor = isAccentColor(color)
    ? color
    : "default";

  return (
    <div>
      <InspectorHeader title="タイムライン" />

      <InspectorSection title="項目">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">現在 {itemCount} 件</p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleAddItem}
              disabled={itemCount >= MAX_TIMELINE_ITEMS}
            >
              <IconPlus className="mr-1.5 h-4 w-4" aria-hidden />
              項目を追加
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleRemoveLastItem}
              disabled={itemCount <= MIN_TIMELINE_ITEMS}
            >
              <IconMinus className="mr-1.5 h-4 w-4" aria-hidden />
              最後の項目を削除
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            各項目の内容は本文中の項目を選択して編集してください。
          </p>
        </div>
      </InspectorSection>

      <InspectorSection title="レイアウト">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">方向</Label>
            <RadioGroup
              value={direction}
              onValueChange={handleDirectionChange}
              className="flex gap-3"
            >
              {DIRECTION_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`inspector-timeline-direction-${option.value}`}
                  />
                  <Label
                    htmlFor={`inspector-timeline-direction-${option.value}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">カラー</Label>
            <Select value={accentColorValue} onValueChange={handleColorChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCENT_COLORS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ACCENT_COLOR_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
