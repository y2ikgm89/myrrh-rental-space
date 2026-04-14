"use client";

import { useQueryStates } from "nuqs";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { adminEventSearchParamsParsers } from "@/shared/lib/nuqs";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";

const EVENT_STATUS_OPTIONS = [
  { value: "ALL", label: "すべてのステータス" },
  { value: EventStatus.DRAFT, label: "下書き" },
  { value: EventStatus.PUBLISHED, label: "公開中" },
  { value: EventStatus.CANCELLED, label: "キャンセル" },
  { value: EventStatus.ARCHIVED, label: "アーカイブ" },
] as const;

export function EventFilters() {
  const [params, setParams] = useQueryStates(adminEventSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* ステータスフィルター */}
      <div className="w-full sm:w-48">
        <Select
          value={params.status || "ALL"}
          onValueChange={(value) =>
            void setParams({
              status: value === "ALL" ? null : value,
              page: 1,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            {EVENT_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 検索 */}
      <div className="w-full sm:w-64">
        <Input
          type="search"
          placeholder="タイトル、場所で検索..."
          defaultValue={params.search}
          onChange={(e) =>
            void setParams({ search: e.target.value || null, page: 1 })
          }
        />
      </div>

      {/* 開始日フィルター */}
      <div className="w-full sm:w-44">
        <Input
          type="date"
          value={params.dateFrom}
          onChange={(e) =>
            void setParams({ dateFrom: e.target.value || null, page: 1 })
          }
          aria-label="開始日から"
        />
      </div>

      {/* 終了日フィルター */}
      <div className="w-full sm:w-44">
        <Input
          type="date"
          value={params.dateTo}
          onChange={(e) =>
            void setParams({ dateTo: e.target.value || null, page: 1 })
          }
          aria-label="終了日まで"
        />
      </div>
    </div>
  );
}
