/**
 * Space Card Inspector Panel
 *
 * @description SpaceCardNode のプロパティ編集パネル。`plugins/SpaceCardPlugin.tsx` と
 * 同じ検索 UI（既存 `/admin/api/link-cards/search?contentType=space` を再利用）で、
 * 新規挿入ではなく既存ノードの spaceId / spaceName を差し替える。
 */

"use client";

import { useState, useTransition } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconAlertCircle, IconLoader2, IconPhoto } from "@tabler/icons-react";
import {
  $isSpaceCardNode,
  type SpaceCardNode,
  spaceCardSpaceIdState,
  spaceCardSpaceNameState,
} from "../../nodes/SpaceCardNode";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Button, Input, Label } from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type SpaceCardSearchItem = {
  contentType: "space";
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

type SpaceCardInspectorPanelProps = {
  nodeKey: string;
  node: SpaceCardNode;
};

// =============================================================================
// Component
// =============================================================================

export function SpaceCardInspectorPanel({
  nodeKey,
  node,
}: SpaceCardInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isSpaceCardNode);

  const { spaceId, spaceName } = editor.read(() => ({
    spaceId: $getState(node, spaceCardSpaceIdState),
    spaceName: $getState(node, spaceCardSpaceNameState),
  }));

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SpaceCardSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runSearch = (nextQuery: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          contentType: "space",
          query: nextQuery.trim(),
        });
        const result = await fetchAdminJson<{ items: SpaceCardSearchItem[] }>(
          `/admin/api/link-cards/search?${params.toString()}`,
          { cache: "no-store" },
        );
        setItems(result.items);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "候補の取得に失敗しました",
        );
        setItems([]);
      }
    });
  };

  const handleSelect = (item: SpaceCardSearchItem) => {
    updateNode((n) => {
      $setState(n, spaceCardSpaceIdState, item.contentId);
      $setState(n, spaceCardSpaceNameState, item.title);
    });
    setItems([]);
    setQuery("");
  };

  return (
    <div>
      <InspectorHeader title="スペースカード" />

      <InspectorSection title="現在の参照先">
        <div className="space-y-2">
          <Label className="text-xs">スペース名</Label>
          <p className="text-sm">{spaceName || "（未設定）"}</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">スペース ID</Label>
          <p className="text-xs text-muted-foreground break-all">
            {spaceId || "（未設定）"}
          </p>
        </div>
      </InspectorSection>

      <InspectorSection title="参照先を変更">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch(query);
                }
              }}
              placeholder="スペース名で検索"
              aria-label="スペースをタイトルで検索"
              className="text-sm"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => runSearch(query)}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? (
              <IconLoader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              "検索"
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <IconAlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {items.length === 0 && !isPending && (
              <li className="py-4 text-center text-xs text-muted-foreground">
                「検索」で公開中のスペースを表示します
              </li>
            )}
            {items.map((item) => (
              <li key={item.contentId}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md border border-transparent p-2 text-left hover:border-border hover:bg-muted/50"
                >
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <IconPhoto
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </InspectorSection>
    </div>
  );
}
