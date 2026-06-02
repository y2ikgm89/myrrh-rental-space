/**
 * Group Inspector Panel
 *
 * @description GroupNodeのスタイル・カラー編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isGroupNode,
  type GroupNode,
  type GroupStyle,
  GROUP_STYLE_CATEGORIES,
  GROUP_STYLE_LABELS,
  groupStyleState,
  groupColorState,
  isGroupStyle,
} from "../../nodes/GroupNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
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

const CATEGORY_LABELS = {
  border: "ボーダー",
  background: "背景",
  decoration: "装飾",
} as const;

// =============================================================================
// Types
// =============================================================================

type GroupInspectorPanelProps = {
  nodeKey: string;
  node: GroupNode;
};

// =============================================================================
// Component
// =============================================================================

export function GroupInspectorPanel({
  nodeKey,
  node,
}: GroupInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isGroupNode);

  const { currentStyle, currentColor } = editor.read(() => ({
    currentStyle: $getState(node, groupStyleState),
    currentColor: $getState(node, groupColorState),
  }));

  const handleStyleChange = (value: string) => {
    if (isGroupStyle(value)) {
      updateNode((n) => {
        $setState(n, groupStyleState, value);
      });
    }
  };

  return (
    <div>
      <InspectorHeader title="グループ" />

      <InspectorSection title="スタイル">
        {(
          Object.entries(GROUP_STYLE_CATEGORIES) as [
            keyof typeof GROUP_STYLE_CATEGORIES,
            readonly GroupStyle[],
          ][]
        ).map(([category, styles]) => {
          const activeInCategory = styles.includes(currentStyle)
            ? currentStyle
            : undefined;
          return (
            <div key={category} className="space-y-1">
              <Label className="text-xs">{CATEGORY_LABELS[category]}</Label>
              <Select
                value={activeInCategory ?? ""}
                onValueChange={handleStyleChange}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {styles.map((style) => (
                    <SelectItem key={style} value={style}>
                      {GROUP_STYLE_LABELS[style]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
        <p className="text-xs leading-relaxed text-muted-foreground">
          複数の効果を重ねたい場合は、グループの中にさらにグループを入れてください。
        </p>
      </InspectorSection>

      <InspectorSection title="カラー">
        <ColorSwatchPicker
          value={currentColor}
          onChange={(color) =>
            updateNode((n) => {
              $setState(n, groupColorState, color);
            })
          }
        />
      </InspectorSection>
    </div>
  );
}
