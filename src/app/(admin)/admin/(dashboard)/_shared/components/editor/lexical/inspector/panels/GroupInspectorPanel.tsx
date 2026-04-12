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
import { cn } from "@/shared/lib/cn";

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

  const { currentStyle, currentColor } = editor.getEditorState().read(() => ({
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
        ).map(([category, styles]) => (
          <div key={category} className="space-y-1.5">
            <Label className="text-xs">{CATEGORY_LABELS[category]}</Label>
            <div className="grid grid-cols-5 gap-1">
              {styles.map((style) => (
                <button
                  key={style}
                  type="button"
                  title={GROUP_STYLE_LABELS[style]}
                  onClick={() => handleStyleChange(style)}
                  className={cn(
                    "h-8 rounded border text-[10px] leading-tight transition-shadow",
                    currentStyle === style
                      ? "ring-2 ring-ring ring-offset-1"
                      : "hover:ring-1 hover:ring-border",
                  )}
                  aria-label={GROUP_STYLE_LABELS[style]}
                  aria-pressed={currentStyle === style}
                >
                  <span
                    className="flex h-full w-full items-center justify-center rounded-sm"
                    data-group-style={style}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
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
