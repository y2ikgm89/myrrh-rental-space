/**
 * Image Inspector Panel
 *
 * @description ImageNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isImageNode,
  IMAGE_ALIGNMENTS,
  type ImageAlignment,
  type ImageNode,
  srcState,
  altState,
  widthState,
  heightState,
  alignmentState,
  captionState,
} from "../../nodes/ImageNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label, Textarea } from "@/admin/components/ui";
import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconPhoto,
  IconPhotoOff,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

// =============================================================================
// Constants
// =============================================================================

const ALIGNMENT_ICONS: Record<ImageAlignment, typeof IconAlignLeft> = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
};

const ALIGNMENT_LABELS: Record<ImageAlignment, string> = {
  left: "左寄せ",
  center: "中央",
  right: "右寄せ",
};

// =============================================================================
// Types
// =============================================================================

type ImageInspectorPanelProps = {
  nodeKey: string;
  node: ImageNode;
};

// =============================================================================
// Component
// =============================================================================

export function ImageInspectorPanel({
  nodeKey,
  node,
}: ImageInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isImageNode);

  const { src, alt, width, height, alignment, caption } = editor.read(() => ({
    src: $getState(node, srcState),
    alt: $getState(node, altState),
    width: $getState(node, widthState),
    height: $getState(node, heightState),
    alignment: $getState(node, alignmentState),
    caption: $getState(node, captionState),
  }));

  const imagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "POST",
    onSelect: (media) => {
      const selected = media[0];
      if (!selected) return;
      updateNode((n) => {
        $setState(n, srcState, selected.url);
        $setState(n, altState, selected.alt ?? "");
        $setState(n, widthState, undefined);
        $setState(n, heightState, undefined);
      });
    },
  });

  const handleAltChange = (value: string) =>
    updateNode((n) => {
      $setState(n, altState, value);
    });

  const handleCaptionChange = (value: string) =>
    updateNode((n) => {
      $setState(n, captionState, value);
    });

  const handleWidthChange = (value: string) => {
    const numValue = value ? parseInt(value, 10) : undefined;
    updateNode((n) => {
      $setState(n, widthState, numValue);
    });
  };

  const handleHeightChange = (value: string) => {
    const numValue = value ? parseInt(value, 10) : undefined;
    updateNode((n) => {
      $setState(n, heightState, numValue);
    });
  };

  const handleAlignmentChange = (value: ImageAlignment) => {
    updateNode((n) => {
      $setState(n, alignmentState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="画像" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">画像</Label>
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-checker">
            {src ? (
              <img
                src={src}
                alt={alt}
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <IconPhotoOff className="h-8 w-8" />
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => imagePicker.openPicker()}
          >
            <IconPhoto className="mr-2 h-4 w-4" />
            画像を差し替え
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-image-alt" className="text-xs">
            代替テキスト（ALT）
          </Label>
          <Input
            id="inspector-image-alt"
            value={alt}
            onChange={(e) => handleAltChange(e.target.value)}
            placeholder="画像の説明"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-image-caption" className="text-xs">
            キャプション
          </Label>
          <Textarea
            id="inspector-image-caption"
            value={caption}
            onChange={(e) => handleCaptionChange(e.target.value)}
            placeholder="画像の説明（任意）"
            rows={2}
            className="resize-none text-sm"
          />
        </div>
      </InspectorFields>

      <InspectorSection title="配置">
        <div className="flex gap-1">
          {IMAGE_ALIGNMENTS.map((align) => {
            const Icon = ALIGNMENT_ICONS[align];
            return (
              <Button
                key={align}
                type="button"
                variant={alignment === align ? "default" : "outline"}
                size="sm"
                className="h-8 flex-1"
                onClick={() => handleAlignmentChange(align)}
                title={ALIGNMENT_LABELS[align]}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorFields title="サイズ" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="inspector-image-width" className="text-xs">
              幅（px）
            </Label>
            <Input
              id="inspector-image-width"
              type="number"
              value={width ?? ""}
              onChange={(e) => handleWidthChange(e.target.value)}
              placeholder="自動"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inspector-image-height" className="text-xs">
              高さ（px）
            </Label>
            <Input
              id="inspector-image-height"
              type="number"
              value={height ?? ""}
              onChange={(e) => handleHeightChange(e.target.value)}
              placeholder="自動"
              className="text-sm"
            />
          </div>
        </div>
      </InspectorFields>

      {imagePicker.mediaPickerDialog}
    </div>
  );
}
