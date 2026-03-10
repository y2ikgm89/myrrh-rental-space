/**
 * Gallery Plugin
 *
 * @description 画像ギャラリーの挿入を提供するプラグイン
 *
 * ダイアログで列数を選択し、空のギャラリーコンテナを挿入する
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $setState } from "lexical";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createGalleryContainerNode,
  $createGalleryItemNode,
  GalleryContainerNode,
  galleryStyleState,
  type GalleryColumns,
  type GalleryStyle,
} from "../nodes/GalleryNode";
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

type GalleryPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

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

// =============================================================================
// Component
// =============================================================================

export function GalleryPlugin({ isOpen, onClose }: GalleryPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [columns, setColumns] = useState<GalleryColumns>(3);
  const [style, setStyle] = useState<GalleryStyle>("grid");

  // ノードトランスフォーム: 空のギャラリーコンテナへの安全網
  // handleInsert では明示的に item を追加するが、外部からコンテナが空になった場合
  // （Undo/Redo 等）に備えてフォールバックとして最低1つの item を保証する
  useEffect(() => {
    return editor.registerNodeTransform(GalleryContainerNode, (node) => {
      if (node.getChildren().length === 0) {
        const item = $createGalleryItemNode();
        node.append(item);
      }
    });
  }, [editor]);

  const handleInsert = () => {
    editor.update(() => {
      const container = $createGalleryContainerNode(columns);
      $setState(container, galleryStyleState, style);
      const item = $createGalleryItemNode();
      container.append(item);
      $insertNodeToNearestRoot(container);
    });
    setColumns(3);
    setStyle("grid");
    onClose();
  };

  const handleClose = () => {
    setColumns(3);
    setStyle("grid");
    onClose();
  };

  const handleColumnsChange = (value: string) => {
    const num = parseInt(value, 10);
    if (num === 2 || num === 3 || num === 4) {
      setColumns(num);
    }
  };

  const handleStyleChange = (value: string) => {
    if (value === "grid" || value === "masonry") {
      setStyle(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>画像ギャラリーを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium block">列数</Label>
            <RadioGroup
              value={String(columns)}
              onValueChange={handleColumnsChange}
              className="flex gap-4"
            >
              {COLUMN_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={String(option.value)}
                    id={`gallery-columns-${option.value}`}
                  />
                  <Label
                    htmlFor={`gallery-columns-${option.value}`}
                    className="font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium block">スタイル</Label>
            <RadioGroup
              value={style}
              onValueChange={handleStyleChange}
              className="flex gap-4"
            >
              {STYLE_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`gallery-style-${option.value}`}
                  />
                  <Label
                    htmlFor={`gallery-style-${option.value}`}
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
