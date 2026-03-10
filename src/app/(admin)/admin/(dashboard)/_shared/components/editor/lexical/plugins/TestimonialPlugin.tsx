/**
 * Testimonial Plugin
 *
 * @description 顧客口コミブロックの挿入を提供するプラグイン
 *
 * ダイアログでレイアウト（グリッド/リスト）とカラムを選択し、
 * TestimonialContainerNode と初期アイテムを挿入する
 */

"use client";

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { $createParagraphNode } from "lexical";
import {
  $createTestimonialContainerNode,
  $createTestimonialItemNode,
  TestimonialContainerNode,
  type TestimonialLayout,
  type TestimonialColumns,
} from "../nodes/TestimonialNode";
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

type TestimonialPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Constants
// =============================================================================

const LAYOUT_OPTIONS: readonly { value: TestimonialLayout; label: string }[] = [
  { value: "grid", label: "グリッド" },
  { value: "list", label: "リスト" },
];

const COLUMNS_OPTIONS: readonly { value: TestimonialColumns; label: string }[] =
  [
    { value: 1, label: "1列" },
    { value: 2, label: "2列" },
    { value: 3, label: "3列" },
  ];

// =============================================================================
// Component
// =============================================================================

export function TestimonialPlugin({ isOpen, onClose }: TestimonialPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [layout, setLayout] = useState<TestimonialLayout>("grid");
  const [columns, setColumns] = useState<TestimonialColumns>(2);

  // ノードトランスフォーム: 空のコンテナにアイテムを追加
  useEffect(() => {
    return editor.registerNodeTransform(TestimonialContainerNode, (node) => {
      if (node.getChildren().length === 0) {
        const item = $createTestimonialItemNode();
        const para = $createParagraphNode();
        item.append(para);
        node.append(item);
      }
    });
  }, [editor]);

  const handleInsert = () => {
    editor.update(() => {
      const container = $createTestimonialContainerNode({ layout, columns });
      const item1 = $createTestimonialItemNode({
        authorName: "山田太郎",
        rating: 5,
      });
      const para1 = $createParagraphNode();
      item1.append(para1);
      const item2 = $createTestimonialItemNode({
        authorName: "鈴木花子",
        rating: 5,
      });
      const para2 = $createParagraphNode();
      item2.append(para2);
      container.append(item1);
      container.append(item2);
      $insertNodeToNearestRoot(container);
    });
    setLayout("grid");
    setColumns(2);
    onClose();
  };

  const handleClose = () => {
    setLayout("grid");
    setColumns(2);
    onClose();
  };

  const handleLayoutChange = (value: string) => {
    if (value === "grid" || value === "list") {
      setLayout(value);
    }
  };

  const handleColumnsChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (parsed === 1 || parsed === 2 || parsed === 3) {
      setColumns(parsed);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>口コミ・テスティモニアルを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium block">レイアウト</Label>
            <RadioGroup
              value={layout}
              onValueChange={handleLayoutChange}
              className="flex gap-4"
            >
              {LAYOUT_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`testimonial-layout-${option.value}`}
                  />
                  <Label
                    htmlFor={`testimonial-layout-${option.value}`}
                    className="font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
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
