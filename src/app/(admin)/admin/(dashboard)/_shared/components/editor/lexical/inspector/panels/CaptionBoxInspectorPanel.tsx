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
  type CaptionBoxNode,
} from "../../nodes/CaptionBoxNode";
import { type AccentColor } from "../../config/accent-colors";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { ColorSwatchPicker } from "../ColorSwatchPicker";
import { useNodeUpdater } from "../hooks/use-node-updater";

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

  const currentColor = editor
    .getEditorState()
    .read(() => $getState(node, captionBoxColorState));

  const handleColorChange = (color: AccentColor) => {
    updateNode((n) => {
      $setState(n, captionBoxColorState, color);
    });
  };

  return (
    <div>
      <InspectorHeader title="キャプションボックス" />

      <InspectorSection title="スタイル">
        <ColorSwatchPicker
          value={currentColor}
          onChange={handleColorChange}
          label="アクセントカラー"
        />
      </InspectorSection>
    </div>
  );
}
