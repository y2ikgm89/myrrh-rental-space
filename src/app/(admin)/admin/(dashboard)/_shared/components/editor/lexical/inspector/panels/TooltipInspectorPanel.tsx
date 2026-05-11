/**
 * Tooltip Inspector Panel
 *
 * @description TooltipNode（abbr + title）の表示文言とツールチップをブロック設定から編集する。
 */

"use client";

import { useEffect, useState } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isTooltipNode,
  tooltipBaseTextState,
  tooltipTextState,
  type TooltipNode,
} from "../../nodes/TooltipNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";
import { Textarea } from "@/admin/components/ui/textarea";

type TooltipInspectorPanelProps = {
  nodeKey: string;
  node: TooltipNode;
};

export function TooltipInspectorPanel({
  nodeKey,
  node,
}: TooltipInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isTooltipNode);

  const [baseText, setBaseText] = useState(() =>
    editor.read(() => $getState(node, tooltipBaseTextState)),
  );
  const [tooltipText, setTooltipText] = useState(() =>
    editor.read(() => $getState(node, tooltipTextState)),
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setBaseText($getState(node, tooltipBaseTextState));
        setTooltipText($getState(node, tooltipTextState));
      });
    });
  }, [editor, node]);

  const handleBaseChange = (value: string) => {
    updateNode((n) => {
      $setState(n, tooltipBaseTextState, value);
    });
  };

  const handleTooltipChange = (value: string) => {
    updateNode((n) => {
      $setState(n, tooltipTextState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="ツールチップ" />

      <InspectorFields title="テキスト">
        <div className="space-y-2">
          <Label htmlFor="inspector-tooltip-base" className="text-xs">
            表示テキスト
          </Label>
          <Input
            id="inspector-tooltip-base"
            value={baseText}
            onChange={(e) => handleBaseChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inspector-tooltip-body" className="text-xs">
            ツールチップ（title）
          </Label>
          <Textarea
            id="inspector-tooltip-body"
            value={tooltipText}
            onChange={(e) => handleTooltipChange(e.target.value)}
            rows={3}
            className="min-h-[72px] text-sm resize-y"
          />
        </div>
      </InspectorFields>
    </div>
  );
}
