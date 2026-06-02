/**
 * Figma Inspector Panel
 *
 * @description FigmaNode のプロパティ編集パネル
 */

"use client";

import { useEffect, useState } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isFigmaNode,
  figmaEmbedUrlState,
  figmaLabelState,
} from "../../nodes/FigmaNode";
import type { FigmaNode } from "../../nodes/FigmaNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type FigmaInspectorPanelProps = {
  nodeKey: string;
  node: FigmaNode;
};

// =============================================================================
// Component
// =============================================================================

export function FigmaInspectorPanel({
  nodeKey,
  node,
}: FigmaInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isFigmaNode);

  const [embedUrl, setEmbedUrl] = useState(() =>
    editor.read(() => $getState(node, figmaEmbedUrlState)),
  );
  const [label, setLabel] = useState(() =>
    editor.read(() => $getState(node, figmaLabelState)),
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setEmbedUrl($getState(node, figmaEmbedUrlState));
        setLabel($getState(node, figmaLabelState));
      });
    });
  }, [editor, node]);

  const handleLabelChange = (value: string) => {
    updateNode((n) => {
      $setState(n, figmaLabelState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="Figma デザイン" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">埋め込み URL</Label>
          <p className="text-xs text-muted-foreground truncate">{embedUrl}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-figma-label" className="text-xs">
            ラベル
          </Label>
          <Input
            id="inspector-figma-label"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="デザイン名・説明"
            className="text-sm"
          />
        </div>
      </InspectorFields>
    </div>
  );
}
