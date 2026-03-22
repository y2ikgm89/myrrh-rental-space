"use client";

/**
 * ページ管理フィルター
 *
 * 検索・ステータス・種別フィルターをnuqsで管理
 */

import { useEffect, useRef } from "react";
import { useQueryStates } from "nuqs";
import { Search } from "lucide-react";
import {
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/admin/components/ui";
import { adminPageSearchParamsParsers } from "@/shared/lib/nuqs";

export function PageFilters() {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [params, setParams] = useQueryStates(adminPageSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      void setParams({ q: value || null, page: 1 });
    }, 300);
  }

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="タイトル・スラッグで検索..."
          defaultValue={params.q}
          onChange={handleSearchChange}
          className="w-56 pl-9"
        />
      </div>

      {/* Status Filter */}
      <Select
        value={params.status}
        onValueChange={(v) =>
          void setParams({ status: v === "all" ? null : v, page: 1 })
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべてのステータス</SelectItem>
          <SelectItem value="published">公開中</SelectItem>
          <SelectItem value="draft">非公開</SelectItem>
        </SelectContent>
      </Select>

      {/* Type Filter */}
      <Select
        value={params.type}
        onValueChange={(v) =>
          void setParams({ type: v === "all" ? null : v, page: 1 })
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべての種別</SelectItem>
          <SelectItem value="system">システム</SelectItem>
          <SelectItem value="custom">カスタム</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
