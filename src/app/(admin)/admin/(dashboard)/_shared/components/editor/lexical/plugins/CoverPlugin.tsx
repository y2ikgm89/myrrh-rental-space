/**
 * Cover Plugin
 *
 * @description 背景画像カバーブロックの挿入を提供するプラグイン
 *
 * ダイアログで設定を選択し、CoverNode + HeadingNode + ParagraphNode を挿入する
 */

"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { $createHeadingNode } from "@lexical/rich-text";
import { $createParagraphNode } from "lexical";
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
import { RadioGroup, RadioGroupItem } from "@/admin/components/ui/radio-group";
import { IconPhoto, IconPhotoOff, IconTrash } from "@tabler/icons-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import {
  $createCoverNode,
  COVER_MIN_HEIGHTS,
  COVER_CONTENT_ALIGNS,
  COVER_CONTENT_POSITIONS,
  COVER_OVERLAY_OPACITIES,
  isCoverMinHeight,
  isCoverContentAlign,
  isCoverContentPosition,
  type CoverMinHeight,
  type CoverContentAlign,
  type CoverContentPosition,
  type CoverOverlayOpacity,
} from "../nodes/CoverNode";
import {
  ACCENT_COLORS,
  ACCENT_COLOR_LABELS,
  isAccentColor,
  type AccentColor,
} from "../config/accent-colors";
import { useState } from "react";

// =============================================================================
// Types
// =============================================================================

type CoverPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Constants
// =============================================================================

const MIN_HEIGHT_LABELS: Record<CoverMinHeight, string> = {
  sm: "小（200px）",
  md: "中（300px）",
  lg: "大（400px）",
  xl: "特大（500px）",
  full: "全画面",
};

const CONTENT_ALIGN_LABELS: Record<CoverContentAlign, string> = {
  left: "左",
  center: "中央",
  right: "右",
};

const CONTENT_POSITION_LABELS: Record<CoverContentPosition, string> = {
  top: "上",
  center: "中央",
  bottom: "下",
};

// =============================================================================
// Component
// =============================================================================

export function CoverPlugin({ isOpen, onClose }: CoverPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  const [overlayColor, setOverlayColor] = useState<AccentColor>("default");
  const [overlayOpacity, setOverlayOpacity] = useState<CoverOverlayOpacity>(40);
  const [minHeight, setMinHeight] = useState<CoverMinHeight>("md");
  const [contentAlign, setContentAlign] = useState<CoverContentAlign>("center");
  const [contentPosition, setContentPosition] =
    useState<CoverContentPosition>("center");

  const imagePicker = useSingleMediaPicker({
    defaultUsage: "POST",
    showUrlTab: true,
    onSelect: (media) => {
      const selected = media[0];
      if (!selected) return;
      setBackgroundImageUrl(selected.url);
    },
  });

  const resetState = () => {
    setBackgroundImageUrl("");
    setOverlayColor("default");
    setOverlayOpacity(40);
    setMinHeight("md");
    setContentAlign("center");
    setContentPosition("center");
  };

  const handleInsert = () => {
    editor.update(() => {
      const coverNode = $createCoverNode({
        backgroundImageUrl,
        overlayColor,
        overlayOpacity,
        minHeight,
        contentAlign,
        contentPosition,
      });
      const heading = $createHeadingNode("h2");
      const para = $createParagraphNode();
      coverNode.append(heading);
      coverNode.append(para);
      $insertNodeToNearestRoot(coverNode);
    });
    resetState();
    onClose();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleOverlayColorChange = (value: string) => {
    if (isAccentColor(value)) {
      setOverlayColor(value);
    }
  };

  const handleOverlayOpacityChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (
      parsed === 0 ||
      parsed === 10 ||
      parsed === 20 ||
      parsed === 30 ||
      parsed === 40 ||
      parsed === 50 ||
      parsed === 60 ||
      parsed === 70 ||
      parsed === 80
    ) {
      setOverlayOpacity(parsed);
    }
  };

  const handleMinHeightChange = (value: string) => {
    if (isCoverMinHeight(value)) {
      setMinHeight(value);
    }
  };

  const handleContentAlignChange = (value: string) => {
    if (isCoverContentAlign(value)) {
      setContentAlign(value);
    }
  };

  const handleContentPositionChange = (value: string) => {
    if (isCoverContentPosition(value)) {
      setContentPosition(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>カバーブロックを挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">背景画像</Label>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-checker">
              {backgroundImageUrl ? (
                <img
                  src={backgroundImageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <IconPhotoOff className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={backgroundImageUrl ? "outline" : "default"}
                size="sm"
                className="flex-1"
                onClick={() => imagePicker.openPicker()}
              >
                <IconPhoto className="mr-2 h-4 w-4" />
                {backgroundImageUrl ? "画像を差し替え" : "画像を選択"}
              </Button>
              {backgroundImageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBackgroundImageUrl("")}
                  aria-label="背景画像を削除"
                >
                  <IconTrash className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">オーバーレイカラー</Label>
            <Select
              value={overlayColor}
              onValueChange={handleOverlayColorChange}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCENT_COLORS.map((color) => (
                  <SelectItem key={color} value={color}>
                    {ACCENT_COLOR_LABELS[color]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">オーバーレイ透明度</Label>
            <Select
              value={String(overlayOpacity)}
              onValueChange={handleOverlayOpacityChange}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COVER_OVERLAY_OPACITIES.map((opacity) => (
                  <SelectItem key={opacity} value={String(opacity)}>
                    {opacity}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">最小高さ</Label>
            <Select value={minHeight} onValueChange={handleMinHeightChange}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COVER_MIN_HEIGHTS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {MIN_HEIGHT_LABELS[h]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">テキスト水平位置</Label>
            <RadioGroup
              value={contentAlign}
              onValueChange={handleContentAlignChange}
              className="flex gap-4"
            >
              {COVER_CONTENT_ALIGNS.map((align) => (
                <div key={align} className="flex items-center space-x-2">
                  <RadioGroupItem value={align} id={`cover-align-${align}`} />
                  <Label
                    htmlFor={`cover-align-${align}`}
                    className="font-normal cursor-pointer"
                  >
                    {CONTENT_ALIGN_LABELS[align]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">テキスト垂直位置</Label>
            <RadioGroup
              value={contentPosition}
              onValueChange={handleContentPositionChange}
              className="flex gap-4"
            >
              {COVER_CONTENT_POSITIONS.map((pos) => (
                <div key={pos} className="flex items-center space-x-2">
                  <RadioGroupItem value={pos} id={`cover-position-${pos}`} />
                  <Label
                    htmlFor={`cover-position-${pos}`}
                    className="font-normal cursor-pointer"
                  >
                    {CONTENT_POSITION_LABELS[pos]}
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
      {imagePicker.mediaPickerDialog}
    </Dialog>
  );
}
