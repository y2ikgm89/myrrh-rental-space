/**
 * Pricing Plan Inspector Panel
 *
 * @description PricingPlanNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isPricingPlanNode,
  type PricingPlanNode,
  planNameState,
  planPriceState,
  planPeriodState,
  planFeaturedState,
  planColorState,
} from "../../nodes/PricingTableNode";
import {
  isAccentColor,
  ACCENT_COLORS,
  ACCENT_COLOR_LABELS,
} from "../../config/accent-colors";
import type { AccentColor } from "../../config/accent-colors";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label, Switch } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";

// =============================================================================
// Types
// =============================================================================

type PricingPlanInspectorPanelProps = {
  nodeKey: string;
  node: PricingPlanNode;
};

// =============================================================================
// Component
// =============================================================================

export function PricingPlanInspectorPanel({
  nodeKey,
  node,
}: PricingPlanInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isPricingPlanNode);

  const { name, price, period, featured, color } = editor
    .getEditorState()
    .read(() => ({
      name: $getState(node, planNameState),
      price: $getState(node, planPriceState),
      period: $getState(node, planPeriodState),
      featured: $getState(node, planFeaturedState),
      color: $getState(node, planColorState),
    }));

  const handleNameChange = (value: string) => {
    updateNode((n) => {
      $setState(n, planNameState, value);
    });
  };

  const handlePriceChange = (value: string) => {
    updateNode((n) => {
      $setState(n, planPriceState, value);
    });
  };

  const handlePeriodChange = (value: string) => {
    updateNode((n) => {
      $setState(n, planPeriodState, value);
    });
  };

  const handleFeaturedChange = (checked: boolean) => {
    updateNode((n) => {
      $setState(n, planFeaturedState, checked);
    });
  };

  const handleColorChange = (value: string) => {
    if (isAccentColor(value)) {
      updateNode((n) => {
        $setState(n, planColorState, value);
      });
    }
  };

  const accentColorValue: AccentColor = isAccentColor(color)
    ? color
    : "default";

  return (
    <div>
      <InspectorHeader title="料金プラン" />

      <InspectorSection title="基本情報">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">プラン名</Label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="スタンダード"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">価格</Label>
            <Input
              value={price}
              onChange={(e) => handlePriceChange(e.target.value)}
              placeholder="¥9,800"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">期間</Label>
            <Input
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              placeholder="月"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="表示設定">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="inspector-plan-featured" className="text-xs">
              おすすめ
            </Label>
            <Switch
              id="inspector-plan-featured"
              checked={featured}
              onCheckedChange={handleFeaturedChange}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">カラー</Label>
            <Select value={accentColorValue} onValueChange={handleColorChange}>
              <SelectTrigger className="h-8 text-sm">
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
