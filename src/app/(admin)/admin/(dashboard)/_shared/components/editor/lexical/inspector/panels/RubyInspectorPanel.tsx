/**
 * Ruby Inspector Panel
 *
 * @description RubyNode の親文字・ルビをブロック設定から編集する。
 */

"use client";

import { useEffect, useState } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isRubyNode,
  rubyBaseTextState,
  rubyTextState,
  type RubyNode,
} from "../../nodes/RubyNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";

type RubyInspectorPanelProps = {
  nodeKey: string;
  node: RubyNode;
};

export function RubyInspectorPanel({ nodeKey, node }: RubyInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isRubyNode);

  const [baseText, setBaseText] = useState(() =>
    editor.read(() => $getState(node, rubyBaseTextState)),
  );
  const [rubyText, setRubyText] = useState(() =>
    editor.read(() => $getState(node, rubyTextState)),
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setBaseText($getState(node, rubyBaseTextState));
        setRubyText($getState(node, rubyTextState));
      });
    });
  }, [editor, node]);

  const handleBaseChange = (value: string) => {
    updateNode((n) => {
      $setState(n, rubyBaseTextState, value);
    });
  };

  const handleRubyChange = (value: string) => {
    updateNode((n) => {
      $setState(n, rubyTextState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="ルビ" />

      <InspectorFields title="テキスト">
        <div className="space-y-2">
          <Label htmlFor="inspector-ruby-base" className="text-xs">
            親文字
          </Label>
          <Input
            id="inspector-ruby-base"
            value={baseText}
            onChange={(e) => handleBaseChange(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inspector-ruby-text" className="text-xs">
            ルビ
          </Label>
          <Input
            id="inspector-ruby-text"
            value={rubyText}
            onChange={(e) => handleRubyChange(e.target.value)}
            className="text-sm"
          />
        </div>
      </InspectorFields>
    </div>
  );
}
