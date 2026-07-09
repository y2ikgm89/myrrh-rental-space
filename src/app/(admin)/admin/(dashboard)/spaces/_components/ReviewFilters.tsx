"use client";

import { useEffect, useRef } from "react";
import { useQueryStates } from "nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from "@/admin/components/ui";
import { adminSpaceSearchParamsParsers } from "@/shared/lib/nuqs";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";

const PUBLISHED_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "true", label: PUBLISH_LABELS.published },
  { value: "false", label: PUBLISH_LABELS.unpublished },
];

const RATING_OPTIONS = [
  { value: "ALL", label: "すべての評価" },
  { value: "1", label: "★1" },
  { value: "2", label: "★2" },
  { value: "3", label: "★3" },
  { value: "4", label: "★4" },
  { value: "5", label: "★5" },
];

type ReviewFiltersProps = {
  readonly spaceOptions: ReadonlyArray<{ id: string; name: string }>;
};

export function ReviewFilters({ spaceOptions }: ReviewFiltersProps) {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [params, setParams] = useQueryStates(adminSpaceSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handlePublishedChange = (value: string) => {
    void setParams({
      rvPublished: value === "ALL" ? null : value,
      rvPage: 1,
    });
  };

  const handleRatingChange = (value: string) => {
    void setParams({
      rvRating: value === "ALL" ? null : value,
      rvPage: 1,
    });
  };

  const handleSpaceChange = (value: string) => {
    void setParams({
      rvSpaceId: value === "ALL" ? null : value,
      rvPage: 1,
    });
  };

  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      void setParams({
        rvSearch: value || null,
        rvPage: 1,
      });
    }, 300);
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="w-full sm:w-40">
        <Select
          value={params.rvPublished || "ALL"}
          onValueChange={handlePublishedChange}
        >
          <SelectTrigger aria-label="公開状態で絞り込み">
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

      <div className="w-full sm:w-40">
        <Select
          value={params.rvRating || "ALL"}
          onValueChange={handleRatingChange}
        >
          <SelectTrigger aria-label="評価で絞り込み">
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

      <div className="w-full sm:w-56">
        <Select
          value={params.rvSpaceId || "ALL"}
          onValueChange={handleSpaceChange}
        >
          <SelectTrigger aria-label="スペースで絞り込み">
            <SelectValue placeholder="スペース" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべてのスペース</SelectItem>
            {spaceOptions.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1">
        <Input
          type="search"
          placeholder="スペース名、顧客名で検索..."
          defaultValue={params.rvSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          leadingIcon="IconSearch"
        />
      </div>
    </div>
  );
}
