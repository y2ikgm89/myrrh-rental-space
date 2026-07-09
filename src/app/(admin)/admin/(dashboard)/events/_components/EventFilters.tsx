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
import {
  adminEventSearchParamsParsers,
  EVENT_STATUS_FILTER_ALL,
  isEventStatusFilter,
} from "@/shared/lib/nuqs";
import { EVENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";

const EVENT_STATUS_OPTIONS = [
  { value: EVENT_STATUS_FILTER_ALL, label: "すべてのステータス" },
  ...entriesOf(EVENT_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export function EventFilters() {
  const [params, setParams] = useQueryStates(adminEventSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-sm font-medium text-muted-foreground">期間:</span>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <Input
            type="date"
            aria-label="開始日"
            value={params.dateFrom}
            onChange={(e) =>
              void setParams({ dateFrom: e.target.value || null, page: 1 })
            }
            className="min-w-0 sm:w-[160px]"
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <Input
            type="date"
            aria-label="終了日"
            value={params.dateTo}
            onChange={(e) =>
              void setParams({ dateTo: e.target.value || null, page: 1 })
            }
            className="min-w-0 sm:w-[160px]"
          />
        </div>
      </div>
      <div className="flex-1">
        <Input
          type="search"
          placeholder="タイトル、場所で検索..."
          defaultValue={params.search}
          onChange={(e) =>
            void setParams({ search: e.target.value || null, page: 1 })
          }
        />
      </div>
      {params.tab === "all" && (
        <div className="w-full sm:w-[180px]">
          <Select
            value={params.status}
            onValueChange={(value) => {
              if (!isEventStatusFilter(value)) return;
              void setParams({
                status: value === EVENT_STATUS_FILTER_ALL ? null : value,
                page: 1,
              });
            }}
          >
            <SelectTrigger aria-label="イベントステータスで絞り込み">
              <SelectValue />
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
      )}
    </div>
  );
}
