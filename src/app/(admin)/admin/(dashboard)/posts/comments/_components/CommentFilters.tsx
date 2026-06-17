"use client";

/**
 * コメントフィルター
 */

import { useQueryStates } from "nuqs";
import { adminPostSearchParamsParsers } from "@/shared/lib/nuqs";
import { IconX } from "@tabler/icons-react";
import { Button, Input, SubmitButton } from "@/admin/components/ui";
import { getFormString } from "@/shared/lib/form-data";
import { EDITOR_COMMENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";

interface StatusOption {
  value: string;
  label: string;
}

const STATUS_OPTIONS: readonly StatusOption[] = [
  { value: "ALL", label: "すべて" },
  { value: "ACTIVE", label: EDITOR_COMMENT_STATUS_LABELS.ACTIVE },
  { value: "DELETED", label: EDITOR_COMMENT_STATUS_LABELS.DELETED },
];

export function CommentFilters() {
  const [params, setParams] = useQueryStates(adminPostSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

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
          <Input
            name="search"
            placeholder="コメント内容・投稿者名で検索"
            defaultValue={params.search}
            className="w-64"
            leadingIcon="IconSearch"
          />
          {params.search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
        </div>
        <SubmitButton
          isPending={false}
          label="検索"
          variant="outline"
          size="sm"
        />
      </form>
    </div>
  );
}
