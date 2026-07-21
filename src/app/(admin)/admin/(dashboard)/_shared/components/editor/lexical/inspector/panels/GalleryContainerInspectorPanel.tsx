/**
 * Gallery Container Inspector Panel
 *
 * @description GalleryContainerNodeのプロパティ編集パネル。
 * 画像項目（{@link GalleryItemNode}）の追加・削除もここで行う
 * （挿入時は1枚のみで初期化されるため、増減する唯一の手段）。
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  $isGalleryContainerNode,
  $isGalleryItemNode,
  $createGalleryItemNode,
  type GalleryContainerNode,
  type GalleryColumns,
  type GalleryStyle,
  galleryColumnsState,
  galleryStyleState,
} from "../../nodes/GalleryNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Button, Label } from "@/admin/components/ui";
import { RadioGroup, RadioGroupItem } from "@/admin/components/ui/radio-group";

// =============================================================================
// Constants
// =============================================================================

const COLUMN_OPTIONS: readonly { value: GalleryColumns; label: string }[] = [
  { value: 2, label: "2列" },
  { value: 3, label: "3列" },
  { value: 4, label: "4列" },
];

const STYLE_OPTIONS: readonly { value: GalleryStyle; label: string }[] = [
  { value: "grid", label: "グリッド" },
  { value: "masonry", label: "メイソンリー" },
];

const MIN_GALLERY_ITEMS = 1;
const MAX_GALLERY_ITEMS = 24;

// =============================================================================
// Types
// =============================================================================

type GalleryContainerInspectorPanelProps = {
  nodeKey: string;
  node: GalleryContainerNode;
};

// =============================================================================
// Component
// =============================================================================

export function GalleryContainerInspectorPanel({
  nodeKey,
  node,
}: GalleryContainerInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isGalleryContainerNode);

  const { columns, galleryStyle, itemCount } = editor.read(() => ({
    columns: $getState(node, galleryColumnsState),
    galleryStyle: $getState(node, galleryStyleState),
    itemCount: node.getChildren().filter($isGalleryItemNode).length,
  }));

  const handleAddItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isGalleryItemNode);
      if (items.length >= MAX_GALLERY_ITEMS) return;
      n.append($createGalleryItemNode());
    });
  };

  const handleRemoveLastItem = () => {
    updateNode((n) => {
      const items = n.getChildren().filter($isGalleryItemNode);
      if (items.length <= MIN_GALLERY_ITEMS) return;
      items[items.length - 1]?.remove();
    });
  };

  const handleColumnsChange = (value: string) => {
    const num = parseInt(value, 10);
    if (num === 2 || num === 3 || num === 4) {
      updateNode((n) => {
        $setState(n, galleryColumnsState, num);
      });
    }
  };

  const handleStyleChange = (value: string) => {
    if (value === "grid" || value === "masonry") {
      updateNode((n) => {
        $setState(n, galleryStyleState, value);
      });
    }
  };

  return (
    <div>
      <InspectorHeader title="画像ギャラリー" />

      <InspectorSection title="画像">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">現在 {itemCount} 枚</p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleAddItem}
              disabled={itemCount >= MAX_GALLERY_ITEMS}
            >
              <IconPlus className="mr-1.5 h-4 w-4" aria-hidden />
              画像を追加
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleRemoveLastItem}
              disabled={itemCount <= MIN_GALLERY_ITEMS}
            >
              <IconMinus className="mr-1.5 h-4 w-4" aria-hidden />
              最後の画像を削除
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            各画像の内容は本文中の画像を選択して編集してください。
          </p>
        </div>
      </InspectorSection>

      <InspectorSection title="レイアウト">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">列数</Label>
            <RadioGroup
              value={String(columns)}
              onValueChange={handleColumnsChange}
              className="flex gap-3"
            >
              {COLUMN_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={String(option.value)}
                    id={`inspector-gallery-columns-${option.value}`}
                  />
                  <Label
                    htmlFor={`inspector-gallery-columns-${option.value}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">スタイル</Label>
            <RadioGroup
              value={galleryStyle}
              onValueChange={handleStyleChange}
              className="flex gap-3"
            >
              {STYLE_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`inspector-gallery-style-${option.value}`}
                  />
                  <Label
                    htmlFor={`inspector-gallery-style-${option.value}`}
                    className="text-xs font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
