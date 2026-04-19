"use client";

import { useQueryStates } from "nuqs";
import { adminAuditLogSearchParamsParsers } from "@/shared/lib/nuqs";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { AUDIT_ACTION_LABELS } from "@/shared/lib/validations/enums/helpers";
import { RESOURCE_LABELS } from "@/admin/lib/admin-resources";
import { entriesOf } from "@/shared/lib/serialize";

const ACTION_OPTIONS = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(AUDIT_ACTION_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const RESOURCE_OPTIONS = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(RESOURCE_LABELS).map(([value, label]) => ({ value, label })),
];

export function AuditLogFilters() {
  const [params, setParams] = useQueryStates(adminAuditLogSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const hasFilters =
    params.action || params.resource || params.dateFrom || params.dateTo;

  const handleReset = () => {
    void setParams({
      action: null,
      resource: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">期間:</span>
        <Input
          type="date"
          aria-label="開始日"
          value={params.dateFrom}
          onChange={(e) =>
            void setParams({ dateFrom: e.target.value || null, page: 1 })
          }
          className="w-[160px]"
        />
        <span className="text-sm text-muted-foreground">〜</span>
        <Input
          type="date"
          aria-label="終了日"
          value={params.dateTo}
          onChange={(e) =>
            void setParams({ dateTo: e.target.value || null, page: 1 })
          }
          className="w-[160px]"
        />
      </div>

      <Select
        value={params.action || "ALL"}
        onValueChange={(value) =>
          void setParams({ action: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="アクション" />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.resource || "ALL"}
        onValueChange={(value) =>
          void setParams({ resource: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="リソース" />
        </SelectTrigger>
        <SelectContent>
          {RESOURCE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" onClick={handleReset}>
          クリア
        </Button>
      )}
    </div>
  );
}
