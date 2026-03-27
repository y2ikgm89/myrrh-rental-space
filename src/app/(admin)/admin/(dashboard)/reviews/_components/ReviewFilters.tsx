"use client";

import { Search } from "lucide-react";
import { useQueryStates } from "nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";
import { adminReviewSearchParamsParsers } from "@/shared/lib/nuqs";

// =============================================================================
// Constants
// =============================================================================

const PUBLISHED_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "true", label: "公開" },
  { value: "false", label: "非公開" },
];

const RATING_OPTIONS = [
  { value: "ALL", label: "すべての評価" },
  { value: "1", label: "★1" },
  { value: "2", label: "★2" },
  { value: "3", label: "★3" },
  { value: "4", label: "★4" },
  { value: "5", label: "★5" },
];

// =============================================================================
// ReviewFilters Component
// =============================================================================

export function ReviewFilters() {
  const [params, setParams] = useQueryStates(adminReviewSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handlePublishedChange = (value: string) => {
    void setParams({
      published: value === "ALL" ? null : value,
      page: 1,
    });
  };

  const handleRatingChange = (value: string) => {
    void setParams({
      rating: value === "ALL" ? null : value,
      page: 1,
    });
  };

  const handleSearchChange = (value: string) => {
    void setParams({
      search: value || null,
      page: 1,
    });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* 公開状態フィルター */}
      <div className="w-full sm:w-40">
        <Select
          value={params.published || "ALL"}
          onValueChange={handlePublishedChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="公開状態" />
          </SelectTrigger>
          <SelectContent>
            {PUBLISHED_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 評価フィルター */}
      <div className="w-full sm:w-40">
        <Select
          value={params.rating || "ALL"}
          onValueChange={handleRatingChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="評価" />
          </SelectTrigger>
          <SelectContent>
            {RATING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 検索 */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="スペース名、顧客名で検索..."
          defaultValue={params.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
