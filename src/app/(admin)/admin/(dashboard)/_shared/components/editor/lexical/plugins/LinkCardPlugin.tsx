/**
 * Link Card Plugin
 *
 * @description 統一リンクカード挿入ダイアログ（2 タブ）。
 *
 * - 「サイト内」タブ: posts / news / spaces / events を検索して選び、{@link InternalLinkCardNode}
 *   （参照ベース、公開描画時に最新データへ解決）を挿入する。
 * - 「外部 URL」タブ: URL の OGP を取得して {@link BookmarkNode}（スナップショット）を挿入する。
 *
 * 旧「ブックマーク」挿入項目は本ダイアログの「外部 URL」タブに統合された。
 */

"use client";

import { useState, useTransition } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  IconAlertCircle,
  IconExternalLink,
  IconLoader2,
  IconPhoto,
} from "@tabler/icons-react";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { logger } from "@/shared/lib/errors/logger-core";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { $createBookmarkNode } from "../nodes/BookmarkNode";
import { $createInternalLinkCardNode } from "../nodes/InternalLinkCardNode";
import {
  type LinkCardContentType,
  LINK_CARD_CONTENT_TYPES,
  LINK_CARD_TYPE_LABELS,
  isLinkCardContentType,
} from "@/shared/domain/link-cards/content-types";

type LinkCardSearchItem = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

type OgpPreview = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string;
  siteName: string | null;
};

type LinkCardPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// 内部タブ
// =============================================================================

function InternalTab({ onInserted }: { onInserted: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [contentType, setContentType] = useState<LinkCardContentType>("post");
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
        const result = await fetchAdminJson<{ items: LinkCardSearchItem[] }>(
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

  const handleTypeChange = (value: string) => {
    if (!isLinkCardContentType(value)) return;
    setContentType(value);
    runSearch(value, query);
  };

  const handleSelect = (item: LinkCardSearchItem) => {
    editor.update(() => {
      $insertNodeToNearestRoot(
        $createInternalLinkCardNode({
          contentType: item.contentType,
          contentId: item.contentId,
        }),
      );
    });
    onInserted();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={contentType} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-40">
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
              runSearch(contentType, query);
            }
          }}
          placeholder="タイトルで検索"
          aria-label="コンテンツをタイトルで検索"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => runSearch(contentType, query)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin" />
          ) : (
            "検索"
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <IconAlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {items.length === 0 && !isPending && (
          <li className="py-6 text-center text-sm text-muted-foreground">
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
              <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <IconPhoto
                    className="h-5 w-5 text-muted-foreground"
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
  );
}

// =============================================================================
// 外部タブ
// =============================================================================

function ExternalTab({ onInserted }: { onInserted: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<OgpPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFetchOgp = () => {
    if (!url.trim()) return;
    setError(null);
    setPreview(null);
    startTransition(async () => {
      try {
        const result = await fetchAdminJson<OgpPreview>("/admin/api/ogp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
        setPreview(result);
      } catch (fetchError) {
        logger.warn("LinkCardPlugin: OGP fetch failed", { url });
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "OGP の取得に失敗しました",
        );
      }
    });
  };

  const handleInsert = () => {
    if (!preview) return;
    editor.update(() => {
      $insertNodeToNearestRoot(
        $createBookmarkNode({
          url: preview.url,
          ...(preview.title != null && { title: preview.title }),
          ...(preview.description != null && {
            description: preview.description,
          }),
          ...(preview.imageUrl != null && { imageUrl: preview.imageUrl }),
          faviconUrl: preview.faviconUrl,
          ...(preview.siteName != null && { siteName: preview.siteName }),
        }),
      );
    });
    onInserted();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="link-card-url">URL</Label>
        <div className="flex gap-2">
          <Input
            id="link-card-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            type="url"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleFetchOgp();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleFetchOgp}
            disabled={!url.trim() || isPending}
          >
            {isPending ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              "取得"
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <IconAlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {preview && (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex">
            <div className="min-w-0 flex-1 p-4">
              <div className="mb-2 flex items-center gap-2">
                {preview.faviconUrl ? (
                  <img
                    src={preview.faviconUrl}
                    alt=""
                    className="h-4 w-4 rounded-sm"
                  />
                ) : (
                  <IconExternalLink className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="truncate text-xs text-muted-foreground">
                  {preview.siteName ?? new URL(preview.url).hostname}
                </span>
              </div>
              <h4 className="mb-1 line-clamp-2 text-sm font-medium">
                {preview.title ?? preview.url}
              </h4>
              {preview.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {preview.description}
                </p>
              )}
            </div>
            {preview.imageUrl && (
              <div className="h-24 w-32 shrink-0">
                <img
                  src={preview.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleInsert} disabled={!preview}>
          挿入
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Dialog
// =============================================================================

export function LinkCardPlugin({ isOpen, onClose }: LinkCardPluginProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>リンクカードを挿入</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="internal">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="internal">サイト内</TabsTrigger>
            <TabsTrigger value="external">外部 URL</TabsTrigger>
          </TabsList>
          <TabsContent value="internal" className="pt-4">
            <InternalTab onInserted={onClose} />
          </TabsContent>
          <TabsContent value="external" className="pt-4">
            <ExternalTab onInserted={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
