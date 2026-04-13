"use client";

import { IconSearch } from "@tabler/icons-react";
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

export function ReviewFilters() {
  const [params, setParams] = useQueryStates(adminSpaceSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

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

  const handleSearchChange = (value: string) => {
    void setParams({
      rvSearch: value || null,
      rvPage: 1,
    });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="w-full sm:w-40">
        <Select
          value={params.rvPublished || "ALL"}
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

      <div className="w-full sm:w-40">
        <Select
          value={params.rvRating || "ALL"}
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

      <div className="relative flex-1">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="スペース名、顧客名で検索..."
          defaultValue={params.rvSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
