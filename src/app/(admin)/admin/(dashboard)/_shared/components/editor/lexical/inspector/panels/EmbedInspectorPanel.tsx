/**
 * Embed Inspector Panel (共通)
 *
 * @description X/YouTube/Instagram 等の埋め込みノード用の汎用インスペクタパネル
 */

"use client";

import type { LexicalNode, StateConfig } from "lexical";
import { $getState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { Label } from "@/admin/components/ui";

type EmbedInspectorPanelProps<T extends LexicalNode> = {
  nodeKey: string;
  node: T;
  title: string;
  idLabel: string;
  idState: StateConfig<string, string>;
  buildUrl: (id: string) => string;
};

export function EmbedInspectorPanel<T extends LexicalNode>({
  node,
  title,
  idLabel,
  idState,
  buildUrl,
}: EmbedInspectorPanelProps<T>) {
  const [editor] = useLexicalComposerContext();

  const id = editor.read(() => $getState(node, idState));
  const url = buildUrl(id);

  return (
    <div>
      <InspectorHeader title={title} />

      <InspectorFields title="情報">
        <div className="space-y-2">
          <Label className="text-xs">{idLabel}</Label>
          <p className="text-xs text-muted-foreground font-mono break-all">
            {id}
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">URL</Label>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline break-all"
          >
            {url}
          </a>
        </div>
      </InspectorFields>
    </div>
  );
}
