/**
 * Testimonial Container Inspector Panel
 *
 * @description TestimonialContainerNodeのプロパティ編集パネル。
 * 項目（{@link TestimonialItemNode}）の追加・削除もここで行う
 * （挿入時は2件のみで初期化されるため、増減する唯一の手段）。
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  $isTestimonialContainerNode,
  $isTestimonialItemNode,
  $createTestimonialItemNode,
  type TestimonialContainerNode,
  type TestimonialLayout,
  type TestimonialColumns,
  testimonialLayoutState,
  testimonialColumnsState,
  testimonialAccentColorState,
  TESTIMONIAL_LAYOUTS,
} from "../../nodes/TestimonialNode";
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

const LAYOUT_LABELS: Record<TestimonialLayout, string> = {
  grid: "グリッド",
  list: "リスト",
};

const COLUMNS_OPTIONS: readonly { value: TestimonialColumns; label: string }[] =
  [
    { value: 1, label: "1列" },
    { value: 2, label: "2列" },
    { value: 3, label: "3列" },
  ];

const MIN_TESTIMONIAL_ITEMS = 1;
const MAX_TESTIMONIAL_ITEMS = 24;

// =============================================================================
// Types
// =============================================================================

type TestimonialContainerInspectorPanelProps = {
  nodeKey: string;
  node: TestimonialContainerNode;
};

// =============================================================================
// Component
// =============================================================================

export function TestimonialContainerInspectorPanel({
  nodeKey,
  node,
}: TestimonialContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isTestimonialContainerNode);

  const { layout, columns, accentColor, itemCount } = editor.read(() => ({
    layout: $getState(node, testimonialLayoutState),
    columns: $getState(node, testimonialColumnsState),
    accentColor: $getState(node, testimonialAccentColorState),
    itemCount: node.getChildren().filter($isTestimonialItemNode).length,
  }));

  const handleAddItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isTestimonialItemNode);
      if (items.length >= MAX_TESTIMONIAL_ITEMS) return;
      n.append($createTestimonialItemNode());
    });
  };

  const handleRemoveLastItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isTestimonialItemNode);
      if (items.length <= MIN_TESTIMONIAL_ITEMS) return;
      items[items.length - 1]?.remove();
    });
  };

  const handleLayoutChange = (value: string) => {
    if (value === "grid" || value === "list") {
      updateNode((n) => {
        $setState(n, testimonialLayoutState, value);
      });
    }
  };

  const handleColumnsChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (parsed === 1 || parsed === 2 || parsed === 3) {
      updateNode((n) => {
        $setState(n, testimonialColumnsState, parsed);
      });
    }
  };

  const handleColorChange = (value: string) => {
    if (isAccentColor(value)) {
      updateNode((n) => {
        $setState(n, testimonialAccentColorState, value);
      });
    }
  };

  const accentColorValue: AccentColor = isAccentColor(accentColor)
    ? accentColor
    : "default";

  return (
    <div>
      <InspectorHeader title="口コミ・テスティモニアル" />

      <InspectorSection title="証言">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">現在 {itemCount} 件</p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleAddItem}
              disabled={itemCount >= MAX_TESTIMONIAL_ITEMS}
            >
              <IconPlus className="mr-1.5 h-4 w-4" aria-hidden />
              証言を追加
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleRemoveLastItem}
              disabled={itemCount <= MIN_TESTIMONIAL_ITEMS}
            >
              <IconMinus className="mr-1.5 h-4 w-4" aria-hidden />
              最後の証言を削除
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            各証言の内容は本文中の証言を選択して編集してください。
          </p>
        </div>
      </InspectorSection>

      <InspectorSection title="レイアウト">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">表示形式</Label>
            <RadioGroup
              value={layout}
              onValueChange={handleLayoutChange}
              className="flex gap-3"
            >
              {TESTIMONIAL_LAYOUTS.map((l) => (
                <div key={l} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={l}
                    id={`inspector-testimonial-layout-${l}`}
                  />
                  <Label
                    htmlFor={`inspector-testimonial-layout-${l}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {LAYOUT_LABELS[l]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">カラム数</Label>
            <Select value={String(columns)} onValueChange={handleColumnsChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
