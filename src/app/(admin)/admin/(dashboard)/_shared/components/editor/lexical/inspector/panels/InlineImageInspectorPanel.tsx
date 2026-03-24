/**
 * Inline Image Inspector Panel
 *
 * @description InlineImageNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import {
  $isInlineImageNode,
  INLINE_IMAGE_POSITIONS,
  type InlineImagePosition,
  type InlineImageNode,
  inlineSrcState,
  inlineAltTextState,
  inlinePositionState,
  inlineWidthState,
} from "../../nodes/InlineImageNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";
import { Button } from "@/admin/components/ui/button";
import { AlignLeft, AlignRight, Maximize } from "lucide-react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

// =============================================================================
// Constants
// =============================================================================

const POSITION_ICONS: Record<InlineImagePosition, typeof AlignLeft> = {
  left: AlignLeft,
  right: AlignRight,
  full: Maximize,
};

const POSITION_LABELS: Record<InlineImagePosition, string> = {
  left: "左フロート",
  right: "右フロート",
  full: "全幅",
};

// =============================================================================
// Types
// =============================================================================

type InlineImageInspectorPanelProps = {
  nodeKey: string;
  node: InlineImageNode;
};

// =============================================================================
// Component
// =============================================================================

export function InlineImageInspectorPanel({
  nodeKey,
  node,
}: InlineImageInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isInlineImageNode);

  const { src, altText, position, width } = editor
    .getEditorState()
    .read(() => ({
      src: $getState(node, inlineSrcState),
      altText: $getState(node, inlineAltTextState),
      position: $getState(node, inlinePositionState),
      width: $getState(node, inlineWidthState),
    }));

  const handleAltTextChange = (value: string) =>
    updateNode((n) => {
      $setState(n, inlineAltTextState, value);
    });

  const handlePositionChange = (value: InlineImagePosition) =>
    updateNode((n) => {
      $setState(n, inlinePositionState, value);
    });

  const handleWidthChange = (value: string) => {
    const numValue = value ? parseInt(value, 10) : 200;
    updateNode((n) => {
      $setState(n, inlineWidthState, numValue > 0 ? numValue : 200);
    });
  };

  return (
    <div>
      <InspectorHeader title="インライン画像" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">URL</Label>
          <p className="text-xs text-muted-foreground truncate">{src}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-inline-image-alt" className="text-xs">
            代替テキスト（ALT）
          </Label>
          <Input
            id="inspector-inline-image-alt"
            value={altText}
            onChange={(e) => handleAltTextChange(e.target.value)}
            placeholder="画像の説明"
            className="h-8 text-sm"
          />
        </div>
      </InspectorFields>

      <InspectorSection title="配置">
        <div className="flex gap-1">
          {INLINE_IMAGE_POSITIONS.map((pos) => {
            const Icon = POSITION_ICONS[pos];
            return (
              <Button
                key={pos}
                type="button"
                variant={position === pos ? "default" : "outline"}
                size="sm"
                className="h-8 flex-1"
                onClick={() => handlePositionChange(pos)}
                title={POSITION_LABELS[pos]}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorFields title="幅" defaultOpen={position !== "full"}>
        <div className="space-y-2">
          <Label htmlFor="inspector-inline-image-width" className="text-xs">
            幅（px）
          </Label>
          <Input
            id="inspector-inline-image-width"
            type="number"
            value={width}
            onChange={(e) => handleWidthChange(e.target.value)}
            placeholder="200"
            disabled={position === "full"}
            className="h-8 text-sm"
          />
          {position === "full" && (
            <p className="text-xs text-muted-foreground">
              全幅モードでは幅設定は無効です
            </p>
          )}
        </div>
      </InspectorFields>
    </div>
  );
}
