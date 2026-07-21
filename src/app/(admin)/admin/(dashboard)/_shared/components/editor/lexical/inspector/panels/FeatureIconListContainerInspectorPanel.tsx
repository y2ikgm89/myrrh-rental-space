/**
 * FeatureIconListContainer Inspector Panel
 *
 * @description FeatureIconListContainerNodeのプロパティ編集パネル。
 * 項目（{@link FeatureIconItemNode}）の追加・削除もここで行う
 * （挿入時は2件のみで初期化されるため、増減する唯一の手段）。
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  $isFeatureIconListContainerNode,
  $isFeatureIconItemNode,
  $createFeatureIconItemNode,
  type FeatureIconListContainerNode,
  type FeatureIconListColumns,
  type IconSize,
  ICON_SIZES,
  featureIconListColumnsState,
  featureIconListAccentColorState,
  featureIconListIconSizeState,
} from "../../nodes/FeatureIconListNode";
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

const COLUMNS_OPTIONS: readonly {
  value: FeatureIconListColumns;
  label: string;
}[] = [
  { value: 1, label: "1列" },
  { value: 2, label: "2列" },
  { value: 3, label: "3列" },
];

const ICON_SIZE_LABELS: Record<IconSize, string> = {
  sm: "小 (sm)",
  md: "中 (md)",
  lg: "大 (lg)",
};

const MIN_FEATURE_ICON_ITEMS = 1;
const MAX_FEATURE_ICON_ITEMS = 24;

// =============================================================================
// Types
// =============================================================================

type FeatureIconListContainerInspectorPanelProps = {
  nodeKey: string;
  node: FeatureIconListContainerNode;
};

// =============================================================================
// Component
// =============================================================================

export function FeatureIconListContainerInspectorPanel({
  nodeKey,
  node,
}: FeatureIconListContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isFeatureIconListContainerNode);

  const { columns, accentColor, iconSize, itemCount } = editor.read(() => ({
    columns: $getState(node, featureIconListColumnsState),
    accentColor: $getState(node, featureIconListAccentColorState),
    iconSize: $getState(node, featureIconListIconSizeState),
    itemCount: node.getChildren().filter($isFeatureIconItemNode).length,
  }));

  const handleAddItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isFeatureIconItemNode);
      if (items.length >= MAX_FEATURE_ICON_ITEMS) return;
      n.append($createFeatureIconItemNode());
    });
  };

  const handleRemoveLastItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isFeatureIconItemNode);
      if (items.length <= MIN_FEATURE_ICON_ITEMS) return;
      items[items.length - 1]?.remove();
    });
  };

  const handleColumnsChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (parsed === 1 || parsed === 2 || parsed === 3) {
      updateNode((n) => {
        $setState(n, featureIconListColumnsState, parsed);
      });
    }
  };

  const handleColorChange = (value: string) => {
    if (isAccentColor(value)) {
      updateNode((n) => {
        $setState(n, featureIconListAccentColorState, value);
      });
    }
  };

  const handleIconSizeChange = (value: string) => {
    if (value === "sm" || value === "md" || value === "lg") {
      updateNode((n) => {
        $setState(n, featureIconListIconSizeState, value);
      });
    }
  };

  const accentColorValue: AccentColor = isAccentColor(accentColor)
    ? accentColor
    : "default";

  return (
    <div>
      <InspectorHeader title="設備・特徴リスト" />

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
              disabled={itemCount >= MAX_FEATURE_ICON_ITEMS}
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
              disabled={itemCount <= MIN_FEATURE_ICON_ITEMS}
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
            <Label className="text-xs">アクセントカラー</Label>
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

          <div className="space-y-2">
            <Label className="text-xs">アイコンサイズ</Label>
            <Select value={iconSize} onValueChange={handleIconSizeChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {ICON_SIZE_LABELS[size]}
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
