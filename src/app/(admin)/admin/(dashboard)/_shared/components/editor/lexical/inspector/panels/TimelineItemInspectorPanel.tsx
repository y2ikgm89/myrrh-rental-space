/**
 * Timeline Item Inspector Panel
 *
 * @description TimelineItemNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isTimelineItemNode,
  type TimelineItemNode,
  timelineYearState,
  timelineLabelState,
} from "../../nodes/TimelineNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type TimelineItemInspectorPanelProps = {
  nodeKey: string;
  node: TimelineItemNode;
};

// =============================================================================
// Component
// =============================================================================

export function TimelineItemInspectorPanel({
  nodeKey,
  node,
}: TimelineItemInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isTimelineItemNode);

  const { year, label } = editor.read(() => ({
    year: $getState(node, timelineYearState),
    label: $getState(node, timelineLabelState),
  }));

  const handleYearChange = (value: string) => {
    updateNode((n) => {
      $setState(n, timelineYearState, value);
    });
  };

  const handleLabelChange = (value: string) => {
    updateNode((n) => {
      $setState(n, timelineLabelState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="タイムラインアイテム" />

      <InspectorSection title="コンテンツ">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">年・ラベル</Label>
            <Input
              value={year}
              onChange={(e) => handleYearChange(e.target.value)}
              placeholder="2024"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">見出し</Label>
            <Input
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="ステップのタイトル"
              className="text-sm"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
