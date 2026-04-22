"use client";

/**
 * Style Library フィルター（scope + applicableType + 検索 q）
 */

import { useQueryStates } from "nuqs";
import { IconSearch } from "@tabler/icons-react";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  adminStyleSearchParamsParsers,
  isAdminStyleScopeFilter,
} from "@/shared/lib/nuqs";

export function StyleFilters() {
  const [params, setParams] = useQueryStates(adminStyleSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ q: value || null, page: 1 }),
    300,
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="名前・説明で検索..."
          defaultValue={params.q}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="w-full sm:w-[180px]">
        <Select
          value={params.scope}
          onValueChange={(v) => {
            if (!isAdminStyleScopeFilter(v)) return;
            void setParams({ scope: v === "all" ? null : v, page: 1 });
          }}
        >
          <SelectTrigger aria-label="適用スコープ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのスコープ</SelectItem>
            <SelectItem value="global">グローバル</SelectItem>
            <SelectItem value="page">ページ</SelectItem>
            <SelectItem value="section">セクション</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-[180px]">
        <Select
          value={params.applicableType}
          onValueChange={(v) => {
            void setParams({
              applicableType: v === "all" ? null : v,
              page: 1,
            });
          }}
        >
          <SelectTrigger aria-label="適用可能セクション種別">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての種別</SelectItem>
            <SelectItem value="hero">ヒーロー</SelectItem>
            <SelectItem value="cta">CTA</SelectItem>
            <SelectItem value="features">特徴</SelectItem>
            <SelectItem value="space-list">スペース一覧</SelectItem>
            <SelectItem value="post-list">記事一覧</SelectItem>
            <SelectItem value="news-list">お知らせ一覧</SelectItem>
            <SelectItem value="faq-list">FAQ 一覧</SelectItem>
            <SelectItem value="event-list">イベント一覧</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
