/**
 * Bookmark Inspector Panel
 *
 * @description BookmarkNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isBookmarkNode,
  type BookmarkNode,
  bookmarkUrlState,
  bookmarkTitleState,
  bookmarkDescriptionState,
  bookmarkSiteNameState,
} from "../../nodes/BookmarkNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label, Textarea } from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type BookmarkInspectorPanelProps = {
  nodeKey: string;
  node: BookmarkNode;
};

// =============================================================================
// Component
// =============================================================================

export function BookmarkInspectorPanel({
  nodeKey,
  node,
}: BookmarkInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isBookmarkNode);

  const { url, title, description, siteName } = editor
    .getEditorState()
    .read(() => ({
      url: $getState(node, bookmarkUrlState),
      title: $getState(node, bookmarkTitleState),
      description: $getState(node, bookmarkDescriptionState),
      siteName: $getState(node, bookmarkSiteNameState),
    }));

  const handleTitleChange = (value: string) =>
    updateNode((n) => {
      $setState(n, bookmarkTitleState, value);
    });
  const handleDescriptionChange = (value: string) =>
    updateNode((n) => {
      $setState(n, bookmarkDescriptionState, value);
    });
  const handleSiteNameChange = (value: string) =>
    updateNode((n) => {
      $setState(n, bookmarkSiteNameState, value);
    });

  return (
    <div>
      <InspectorHeader title="ブックマーク" />

      <InspectorFields title="基本設定">
        <div className="space-y-2">
          <Label className="text-xs">URL</Label>
          <p className="text-xs text-muted-foreground break-all">{url}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-bookmark-title" className="text-xs">
            タイトル
          </Label>
          <Input
            id="inspector-bookmark-title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-bookmark-description" className="text-xs">
            説明
          </Label>
          <Textarea
            id="inspector-bookmark-description"
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            className="text-sm min-h-[60px] resize-none"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-bookmark-sitename" className="text-xs">
            サイト名
          </Label>
          <Input
            id="inspector-bookmark-sitename"
            value={siteName}
            onChange={(e) => handleSiteNameChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </InspectorFields>
    </div>
  );
}
