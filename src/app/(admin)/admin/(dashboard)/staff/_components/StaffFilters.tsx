"use client";

import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Search } from "lucide-react";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

export function StaffFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      role: parseAsString.withDefault("ALL"),
      page: parseAsInteger.withDefault(1),
    },
    { history: "push", shallow: false },
  );

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="名前・メールアドレスで検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="w-full sm:w-[180px]">
        <Select
          value={params.role}
          onValueChange={(value) =>
            void setParams({ role: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="ロール" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="SUPER_ADMIN">スーパー管理者</SelectItem>
            <SelectItem value="ADMIN">管理者</SelectItem>
            <SelectItem value="EDITOR">編集者</SelectItem>
            <SelectItem value="VIEWER">閲覧者</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
