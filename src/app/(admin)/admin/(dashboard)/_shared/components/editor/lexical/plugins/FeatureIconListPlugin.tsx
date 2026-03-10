/**
 * FeatureIconList Plugin
 *
 * @description 設備・特徴アイコンリストブロックの挿入を提供するプラグイン
 *
 * ダイアログでカラム数・アクセントカラー・アイコンサイズを選択し、
 * FeatureIconListContainerNode と初期アイテムを挿入する
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { $createParagraphNode } from "lexical";
import {
  $createFeatureIconListContainerNode,
  $createFeatureIconItemNode,
  FeatureIconListContainerNode,
  type FeatureIconListColumns,
  type IconSize,
  ICON_SIZES,
} from "../nodes/FeatureIconListNode";
import {
  type AccentColor,
  ACCENT_COLORS,
  ACCENT_COLOR_LABELS,
} from "../config/accent-colors";
import { isAccentColor } from "../config/accent-colors";
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

// =============================================================================
// Types
// =============================================================================

type FeatureIconListPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

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

// =============================================================================
// Component
// =============================================================================

export function FeatureIconListPlugin({
  isOpen,
  onClose,
}: FeatureIconListPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [columns, setColumns] = useState<FeatureIconListColumns>(2);
  const [accentColor, setAccentColor] = useState<AccentColor>("default");
  const [iconSize, setIconSize] = useState<IconSize>("md");

  // ノードトランスフォーム: 空のコンテナにアイテムを追加
  useEffect(() => {
    return editor.registerNodeTransform(
      FeatureIconListContainerNode,
      (node) => {
        if (node.getChildren().length === 0) {
          const item = $createFeatureIconItemNode();
          const para = $createParagraphNode();
          item.append(para);
          node.append(item);
        }
      },
    );
  }, [editor]);

  const handleInsert = () => {
    editor.update(() => {
      const container = $createFeatureIconListContainerNode({
        columns,
        accentColor,
        iconSize,
      });
      const item1 = $createFeatureIconItemNode({ iconName: "Wifi" });
      const para1 = $createParagraphNode();
      item1.append(para1);
      const item2 = $createFeatureIconItemNode({ iconName: "ParkingCircle" });
      const para2 = $createParagraphNode();
      item2.append(para2);
      container.append(item1);
      container.append(item2);
      $insertNodeToNearestRoot(container);
    });
    setColumns(2);
    setAccentColor("default");
    setIconSize("md");
    onClose();
  };

  const handleClose = () => {
    setColumns(2);
    setAccentColor("default");
    setIconSize("md");
    onClose();
  };

  const handleColumnsChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (parsed === 1 || parsed === 2 || parsed === 3) {
      setColumns(parsed);
    }
  };

  const handleColorChange = (value: string) => {
    if (isAccentColor(value)) {
      setAccentColor(value);
    }
  };

  const handleIconSizeChange = (value: string) => {
    if (value === "sm" || value === "md" || value === "lg") {
      setIconSize(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>設備・特徴リストを挿入</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium block">カラム数</Label>
            <Select value={String(columns)} onValueChange={handleColumnsChange}>
              <SelectTrigger className="h-9">
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
            <Label className="text-sm font-medium block">
              アクセントカラー
            </Label>
            <Select value={accentColor} onValueChange={handleColorChange}>
              <SelectTrigger className="h-9">
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
            <Label className="text-sm font-medium block">アイコンサイズ</Label>
            <Select value={iconSize} onValueChange={handleIconSizeChange}>
              <SelectTrigger className="h-9">
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
