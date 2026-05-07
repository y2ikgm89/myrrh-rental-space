/**
 * Cover Inspector Panel
 *
 * @description CoverNode のプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isCoverNode,
  type CoverNode,
  backgroundImageUrlState,
  overlayColorState,
  overlayOpacityState,
  minHeightState,
  contentAlignState,
  contentPositionState,
  COVER_MIN_HEIGHTS,
  COVER_CONTENT_ALIGNS,
  COVER_CONTENT_POSITIONS,
  COVER_OVERLAY_OPACITIES,
  isCoverMinHeight,
  isCoverContentAlign,
  isCoverContentPosition,
  isCoverOverlayOpacity,
  type CoverMinHeight,
  type CoverContentAlign,
  type CoverContentPosition,
} from "../../nodes/CoverNode";
import {
  ACCENT_COLORS,
  ACCENT_COLOR_LABELS,
  isAccentColor,
} from "../../config/accent-colors";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { Button } from "@/admin/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/admin/components/ui/radio-group";
import { IconPhoto, IconPhotoOff, IconTrash } from "@tabler/icons-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

// =============================================================================
// Types
// =============================================================================

type CoverInspectorPanelProps = {
  nodeKey: string;
  node: CoverNode;
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

export function CoverInspectorPanel({
  nodeKey,
  node,
}: CoverInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isCoverNode);

  const backgroundImageUrl = editor
    .getEditorState()
    .read(() => $getState(node, backgroundImageUrlState));
  const overlayColor = editor
    .getEditorState()
    .read(() => $getState(node, overlayColorState));
  const overlayOpacity = editor
    .getEditorState()
    .read(() => $getState(node, overlayOpacityState));
  const minHeight = editor
    .getEditorState()
    .read(() => $getState(node, minHeightState));
  const contentAlign = editor
    .getEditorState()
    .read(() => $getState(node, contentAlignState));
  const contentPosition = editor
    .getEditorState()
    .read(() => $getState(node, contentPositionState));

  const imagePicker = useSingleMediaPicker({
    defaultUsage: "POST",
    showUrlTab: true,
    onSelect: (media) => {
      const selected = media[0];
      if (!selected) return;
      updateNode((n) => {
        $setState(n, backgroundImageUrlState, selected.url);
      });
    },
  });

  const handleBgUrlClear = () => {
    updateNode((n) => {
      $setState(n, backgroundImageUrlState, "");
    });
  };

  const handleOverlayColorChange = (value: string) => {
    if (isAccentColor(value)) {
      updateNode((n) => {
        $setState(n, overlayColorState, value);
      });
    }
  };

  const handleOverlayOpacityChange = (value: string) => {
    const parsed = parseInt(value, 10);
    if (isCoverOverlayOpacity(parsed)) {
      updateNode((n) => {
        $setState(n, overlayOpacityState, parsed);
      });
    }
  };

  const handleMinHeightChange = (value: string) => {
    if (isCoverMinHeight(value)) {
      updateNode((n) => {
        $setState(n, minHeightState, value);
      });
    }
  };

  const handleContentAlignChange = (value: string) => {
    if (isCoverContentAlign(value)) {
      updateNode((n) => {
        $setState(n, contentAlignState, value);
      });
    }
  };

  const handleContentPositionChange = (value: string) => {
    if (isCoverContentPosition(value)) {
      updateNode((n) => {
        $setState(n, contentPositionState, value);
      });
    }
  };

  return (
    <div>
      <InspectorHeader title="カバー" />

      <InspectorSection title="背景画像">
        <div className="space-y-2">
          <Label className="text-xs">画像</Label>
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
                onClick={handleBgUrlClear}
                aria-label="背景画像を削除"
              >
                <IconTrash className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="オーバーレイ">
        <div className="space-y-2">
          <Label className="text-xs">カラー</Label>
          <Select value={overlayColor} onValueChange={handleOverlayColorChange}>
            <SelectTrigger className="h-8 text-sm">
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
          <Label className="text-xs">透明度</Label>
          <Select
            value={String(overlayOpacity)}
            onValueChange={handleOverlayOpacityChange}
          >
            <SelectTrigger className="h-8 text-sm">
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
      </InspectorSection>

      <InspectorSection title="レイアウト">
        <div className="space-y-2">
          <Label className="text-xs">最小高さ</Label>
          <Select value={minHeight} onValueChange={handleMinHeightChange}>
            <SelectTrigger className="h-8 text-sm">
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
          <Label className="text-xs">テキスト水平位置</Label>
          <RadioGroup
            value={contentAlign}
            onValueChange={handleContentAlignChange}
            className="flex gap-3"
          >
            {COVER_CONTENT_ALIGNS.map((align) => (
              <div key={align} className="flex items-center space-x-1.5">
                <RadioGroupItem
                  value={align}
                  id={`inspector-cover-align-${align}`}
                />
                <Label
                  htmlFor={`inspector-cover-align-${align}`}
                  className="text-xs font-normal cursor-pointer"
                >
                  {CONTENT_ALIGN_LABELS[align]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">テキスト垂直位置</Label>
          <RadioGroup
            value={contentPosition}
            onValueChange={handleContentPositionChange}
            className="flex gap-3"
          >
            {COVER_CONTENT_POSITIONS.map((pos) => (
              <div key={pos} className="flex items-center space-x-1.5">
                <RadioGroupItem
                  value={pos}
                  id={`inspector-cover-position-${pos}`}
                />
                <Label
                  htmlFor={`inspector-cover-position-${pos}`}
                  className="text-xs font-normal cursor-pointer"
                >
                  {CONTENT_POSITION_LABELS[pos]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </InspectorSection>

      {imagePicker.mediaPickerDialog}
    </div>
  );
}
