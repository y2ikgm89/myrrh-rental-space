"use client";

import { useQueryStates } from "nuqs";
import { adminUserSearchParamsParsers } from "@/shared/lib/nuqs";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { DASHBOARD_ROLES, ROLE_LABELS } from "@/shared/lib/admin-roles";

export function StaffFilters() {
  const [params, setParams] = useQueryStates(adminUserSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <Input
          placeholder="名前・メールアドレスで検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
        />
      </div>
      <div className="w-full sm:w-[180px]">
        <Select
          value={params.role === "" ? "ALL" : params.role}
          onValueChange={(value) =>
            void setParams({ role: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger aria-label="ロールで絞り込み">
            <SelectValue placeholder="ロール" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            {DASHBOARD_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
