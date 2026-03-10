/**
 * Instagram Inspector Panel
 *
 * @description InstagramNodeの情報表示パネル（読み取り専用）
 */

"use client";

import type { InstagramNode } from "../../nodes/InstagramNode";
import { postIdState } from "../../nodes/InstagramNode";
import { EmbedInspectorPanel } from "./EmbedInspectorPanel";

type InstagramInspectorPanelProps = {
  nodeKey: string;
  node: InstagramNode;
};

export function InstagramInspectorPanel({
  nodeKey,
  node,
}: InstagramInspectorPanelProps) {
  return (
    <EmbedInspectorPanel
      nodeKey={nodeKey}
      node={node}
      title="Instagram"
      idLabel="投稿ID"
      idState={postIdState}
      buildUrl={(id) => `https://www.instagram.com/p/${id}/`}
    />
  );
}
