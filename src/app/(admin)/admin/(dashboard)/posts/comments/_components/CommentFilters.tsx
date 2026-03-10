"use client";

/**
 * コメントフィルター
 */

import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Search, X } from "lucide-react";
import { Input, Button } from "@/admin/components/ui";
import { getFormString } from "@/shared/lib/utils";

interface StatusOption {
  value: string;
  label: string;
}

const STATUS_OPTIONS: readonly StatusOption[] = [
  { value: "ALL", label: "すべて" },
  { value: "ACTIVE", label: "アクティブ" },
  { value: "DELETED", label: "削除済み" },
];

export function CommentFilters() {
  const [params, setParams] = useQueryStates(
    {
      status: parseAsString.withDefault(""),
      search: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
    },
    { history: "push", shallow: false },
  );

  const currentStatus = params.status || "ALL";

  function handleStatusChange(status: string) {
    void setParams({ status: status === "ALL" ? null : status, page: 1 });
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const search = getFormString(formData, "search");
    void setParams({ search: search || null, page: 1 });
  }

  function handleClearSearch() {
    void setParams({ search: null, page: 1 });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* ステータスフィルター */}
      <div className="flex items-center gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={currentStatus === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* 検索 */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            name="search"
            placeholder="コメント内容・投稿者名で検索"
            defaultValue={params.search}
            className="pl-9 w-64"
          />
          {params.search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="outline" size="sm">
          検索
        </Button>
      </form>
    </div>
  );
}
