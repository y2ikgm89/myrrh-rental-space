/**
 * Space Card Plugin
 *
 * @description スペースカード挿入ダイアログ。公開済みスペースをタイトル検索して選び、
 * {@link SpaceCardNode}（参照ベース、公開描画時に写真・料金・定員・予約ボタン付きの
 * リッチカードへ解決）を挿入する。`LinkCardPlugin.tsx` の InternalTab と同じ検索 API
 * (`/admin/api/link-cards/search?contentType=space`) を再利用する。
 */

"use client";

import { useState, useTransition } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { IconAlertCircle, IconLoader2, IconPhoto } from "@tabler/icons-react";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { spaceLinkCardSearchResponseSchema } from "@/admin/lib/admin-api-response-schemas";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/admin/components/ui";
import { $createSpaceCardNode } from "../nodes/SpaceCardNode";

type SpaceCardSearchItem = {
  contentType: "space";
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

type SpaceCardPluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function SpaceCardPlugin({ isOpen, onClose }: SpaceCardPluginProps) {
  const [editor] = useLexicalComposerContext();
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
        const result = await fetchAdminJson(
          `/admin/api/link-cards/search?${params.toString()}`,
          spaceLinkCardSearchResponseSchema,
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
    editor.update(() => {
      $insertNodeToNearestRoot(
        $createSpaceCardNode({
          spaceId: item.contentId,
          spaceName: item.title,
        }),
      );
    });
    setQuery("");
    setItems([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>スペースカードを挿入</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => runSearch(query)}
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
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
