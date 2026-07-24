/**
 * Internal Link Card Inspector Panel
 *
 * @description InternalLinkCardNode のプロパティ編集パネル。
 * `plugins/LinkCardPlugin.tsx` の InternalTab と同じ検索 UI を再利用し、
 * 新規挿入ではなく既存ノードの contentType / contentId を差し替える。
 */

"use client";

import { useState, useTransition } from "react";
import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconAlertCircle, IconLoader2, IconPhoto } from "@tabler/icons-react";
import {
  $isInternalLinkCardNode,
  type InternalLinkCardNode,
  internalLinkCardContentTypeState,
  internalLinkCardContentIdState,
} from "../../nodes/InternalLinkCardNode";
import {
  type LinkCardContentType,
  LINK_CARD_CONTENT_TYPES,
  LINK_CARD_TYPE_LABELS,
  isLinkCardContentType,
} from "@/shared/domain/link-cards/content-types";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { linkCardSearchResponseSchema } from "@/admin/lib/admin-api-response-schemas";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type LinkCardSearchItem = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

type InternalLinkCardInspectorPanelProps = {
  nodeKey: string;
  node: InternalLinkCardNode;
};

// =============================================================================
// Component
// =============================================================================

export function InternalLinkCardInspectorPanel({
  nodeKey,
  node,
}: InternalLinkCardInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isInternalLinkCardNode);

  const { contentType, contentId } = editor.read(() => ({
    contentType: $getState(node, internalLinkCardContentTypeState),
    contentId: $getState(node, internalLinkCardContentIdState),
  }));

  const [searchType, setSearchType] =
    useState<LinkCardContentType>(contentType);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LinkCardSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runSearch = (nextType: LinkCardContentType, nextQuery: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          contentType: nextType,
          query: nextQuery.trim(),
        });
        const result = await fetchAdminJson(
          `/admin/api/link-cards/search?${params.toString()}`,
          linkCardSearchResponseSchema,
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

  const handleTypeChange = (value: string) => {
    if (!isLinkCardContentType(value)) return;
    setSearchType(value);
    runSearch(value, query);
  };

  const handleSelect = (item: LinkCardSearchItem) => {
    updateNode((n) => {
      $setState(n, internalLinkCardContentTypeState, item.contentType);
      $setState(n, internalLinkCardContentIdState, item.contentId);
    });
    setItems([]);
    setQuery("");
  };

  return (
    <div>
      <InspectorHeader title="サイト内リンクカード" />

      <InspectorSection title="現在の参照先">
        <div className="space-y-2">
          <Label className="text-xs">種類</Label>
          <p className="text-sm">{LINK_CARD_TYPE_LABELS[contentType]}</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">コンテンツ ID</Label>
          <p className="text-xs text-muted-foreground break-all">
            {contentId || "（未設定）"}
          </p>
        </div>
      </InspectorSection>

      <InspectorSection title="参照先を変更">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Select value={searchType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINK_CARD_CONTENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {LINK_CARD_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch(searchType, query);
                }
              }}
              placeholder="タイトルで検索"
              aria-label="コンテンツをタイトルで検索"
              className="text-sm"
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => runSearch(searchType, query)}
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
                「検索」で公開中のコンテンツを表示します
              </li>
            )}
            {items.map((item) => (
              <li key={`${item.contentType}-${item.contentId}`}>
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
                    <span className="block text-xs text-muted-foreground">
                      {LINK_CARD_TYPE_LABELS[item.contentType]}
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
