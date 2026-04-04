/**
 * CaptionBox Inspector Panel
 *
 * @description CaptionBoxNodeのアクセントカラー編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isCaptionBoxNode,
  captionBoxColorState,
  captionBoxStyleState,
  CAPTION_BOX_STYLES,
  isCaptionBoxStyle,
  type CaptionBoxNode,
} from "../../nodes/CaptionBoxNode";
import { type AccentColor } from "../../config/accent-colors";
import { CAPTION_BOX_STYLE_LABELS } from "../../config/node-labels";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Label } from "@/admin/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";

type CaptionBoxInspectorPanelProps = {
  nodeKey: string;
  node: CaptionBoxNode;
};

export function CaptionBoxInspectorPanel({
  nodeKey,
  node,
}: CaptionBoxInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isCaptionBoxNode);

  const { currentStyle, currentColor } = editor.getEditorState().read(() => ({
    currentStyle: $getState(node, captionBoxStyleState),
    currentColor: $getState(node, captionBoxColorState),
  }));

  const handleStyleChange = (value: string) => {
    if (isCaptionBoxStyle(value)) {
      updateNode((n) => {
        $setState(n, captionBoxStyleState, value);
      });
    }
  };

  const handleColorChange = (color: AccentColor) => {
    updateNode((n) => {
      $setState(n, captionBoxColorState, color);
    });
  };

  return (
    <div>
      <InspectorHeader title="キャプションボックス" />

      <InspectorSection title="スタイル">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">レイアウト</Label>
            <Select value={currentStyle} onValueChange={handleStyleChange}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTION_BOX_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {CAPTION_BOX_STYLE_LABELS[style]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ColorSwatchPicker
            value={currentColor}
            onChange={handleColorChange}
            label="アクセントカラー"
          />
        </div>
      </InspectorSection>
    </div>
  );
}
