"use client";

import { useEffect, useState, useTransition, type ReactElement } from "react";
import Image from "next/image";
import {
  IconArticle,
  IconChevronDown,
  IconChevronUp,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/admin/components/ui";
import { searchPostsForRelationAction } from "@/admin/actions/event";
import { useDebouncedCallback } from "@/admin/hooks";

export type RelatedPostOption = {
  id: string;
  title: string;
  slug: string;
  thumbnailUrl: string;
  publishedAt: string | Date | null;
};

type RelatedPostsFieldProps = {
  /** 既に選択済みの Post.id 配列（順序保持）。 */
  selectedIds: readonly string[];
  /** 初期表示用に親 SC で fetch した Post 情報（既選択分の表示用）。 */
  initialOptions: readonly RelatedPostOption[];
  onChange: (next: string[]) => void;
  isPending: boolean;
};

export function RelatedPostsField({
  selectedIds,
  initialOptions,
  onChange,
  isPending,
}: RelatedPostsFieldProps): ReactElement {
  const [optionCache, setOptionCache] = useState<
    Map<string, RelatedPostOption>
  >(() => new Map(initialOptions.map((opt) => [opt.id, opt])));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RelatedPostOption[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const [showResults, setShowResults] = useState(false);

  // 既選択 ID から表示用 option をキャッシュ経由で解決
  const selectedOptions = selectedIds.flatMap((id) => {
    const opt = optionCache.get(id);
    return opt ? [opt] : [];
  });

  const performSearch = useDebouncedCallback((query: string) => {
    startSearchTransition(async () => {
      const result = await searchPostsForRelationAction({
        query,
        includeIds: selectedIds,
      });
      if (result.success) {
        setSearchResults(result.data);
        setOptionCache((prev) => {
          const next = new Map(prev);
          for (const opt of result.data) next.set(opt.id, opt);
          return next;
        });
      }
    });
  }, 250);

  useEffect(() => {
    if (showResults) performSearch(searchQuery);
  }, [searchQuery, showResults, performSearch]);

  function addPost(id: string): void {
    if (selectedIds.includes(id)) return;
    if (selectedIds.length >= 12) return;
    onChange([...selectedIds, id]);
  }

  function removePost(id: string): void {
    onChange(selectedIds.filter((existing) => existing !== id));
  }

  function movePost(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;
    onChange(next);
  }

  const availableResults = searchResults.filter(
    (r) => !selectedIds.includes(r.id),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>関連記事</CardTitle>
        <p className="text-sm text-muted-foreground">
          このイベントに関連するブログ記事を最大 12 件登録できます（業界標準:
          Airbnb / Eventbrite / Peatix 等の curated relations）。
          公開ページ末尾に 3 列カードグリッドで表示され、JSON-LD の{" "}
          <code className="font-mono text-xs">mentions</code> にも反映されます。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 選択済みリスト */}
        {selectedOptions.length > 0 ? (
          <ol className="space-y-2">
            {selectedOptions.map((post, index) => (
              <li
                key={post.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
              >
                <span className="shrink-0 text-sm font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded border border-border">
                  {post.thumbnailUrl ? (
                    <Image
                      src={post.thumbnailUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted">
                      <IconArticle
                        className="h-5 w-5 text-muted-foreground"
                        aria-hidden
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{post.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    /{post.slug}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => movePost(index, -1)}
                    disabled={isPending || index === 0}
                    aria-label="上へ移動"
                  >
                    <IconChevronUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => movePost(index, 1)}
                    disabled={isPending || index === selectedOptions.length - 1}
                    aria-label="下へ移動"
                  >
                    <IconChevronDown className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    onClick={() => removePost(post.id)}
                    disabled={isPending}
                    aria-label={`${post.title} を関連記事から外す`}
                  >
                    <IconTrash className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            関連記事が登録されていません。下の検索ボックスから記事を追加してください。
          </p>
        )}

        {/* 検索 + 追加 */}
        <div className="space-y-2">
          <Label htmlFor="event-related-post-search">記事を検索して追加</Label>
          <div className="relative">
            <IconSearch
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="event-related-post-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowResults(true)}
              placeholder="タイトルで検索（空欄なら最新公開順）"
              disabled={isPending || selectedIds.length >= 12}
              className="pl-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="検索をクリア"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>

          {selectedIds.length >= 12 && (
            <p className="text-xs text-warning">
              関連記事は最大 12 件まで登録できます。
            </p>
          )}

          {showResults && selectedIds.length < 12 && (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-card">
              {isSearching ? (
                <p className="p-3 text-sm text-muted-foreground">検索中…</p>
              ) : availableResults.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  該当する公開記事がありません。
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {availableResults.map((post) => (
                    <li key={post.id}>
                      <button
                        type="button"
                        onClick={() => addPost(post.id)}
                        disabled={isPending}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                      >
                        <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded border border-border">
                          {post.thumbnailUrl ? (
                            <Image
                              src={post.thumbnailUrl}
                              alt=""
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted">
                              <IconArticle
                                className="h-4 w-4 text-muted-foreground"
                                aria-hidden
                              />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {post.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            /{post.slug}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
