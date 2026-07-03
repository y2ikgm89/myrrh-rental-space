"use client";

import { IconDownload, IconShieldCheck } from "@tabler/icons-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { adminAuditLogSearchParamsParsers } from "@/shared/lib/nuqs";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { AUDIT_ACTION_LABELS } from "@/shared/lib/validations/enums/helpers";
import { RESOURCE_LABELS } from "@/shared/lib/admin-resources";
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
    history: "replace",
    shallow: false,
  });

  const hasFilters =
    params.action ||
    params.resource ||
    params.userId ||
    params.dateFrom ||
    params.dateTo ||
    params.search ||
    params.ipAddress ||
    params.securityOnly;
  const exportParams = new URLSearchParams();
  if (params.action) exportParams.set("action", params.action);
  if (params.resource) exportParams.set("resource", params.resource);
  if (params.userId) exportParams.set("userId", params.userId);
  if (params.dateFrom) exportParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) exportParams.set("dateTo", params.dateTo);
  if (params.search) exportParams.set("search", params.search);
  if (params.ipAddress) exportParams.set("ipAddress", params.ipAddress);
  if (params.securityOnly) exportParams.set("securityOnly", "1");
  const exportHref = `/api/admin/export/audit-logs${
    exportParams.size > 0 ? `?${exportParams.toString()}` : ""
  }`;

  const handleReset = () => {
    void setParams({
      action: null,
      resource: null,
      userId: null,
      dateFrom: null,
      dateTo: null,
      search: null,
      ipAddress: null,
      securityOnly: null,
      page: 1,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        type="search"
        aria-label="監査ログ検索"
        placeholder="ユーザー・リソース・ID"
        value={params.search}
        onChange={(e) =>
          void setParams({ search: e.target.value || null, page: 1 })
        }
        className="w-[220px]"
      />

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

      <Input
        type="search"
        aria-label="IPアドレス"
        placeholder="IPアドレス"
        value={params.ipAddress}
        onChange={(e) =>
          void setParams({ ipAddress: e.target.value || null, page: 1 })
        }
        className="w-[160px]"
      />

      <div className="flex min-h-11 items-center gap-2">
        <Checkbox
          id="audit-security-only"
          checked={params.securityOnly === "1"}
          onCheckedChange={(checked) =>
            void setParams({
              securityOnly: checked === true ? "1" : null,
              page: 1,
            })
          }
        />
        <Label htmlFor="audit-security-only" className="text-sm">
          セキュリティのみ
        </Label>
      </div>

      {hasFilters && (
        <Button variant="ghost" onClick={handleReset}>
          クリア
        </Button>
      )}

      <Button asChild variant="outline">
        <a href={exportHref}>
          <IconDownload aria-hidden="true" />
          CSV
        </a>
      </Button>

      <Button asChild variant="outline">
        <Link href="/api/admin/audit-logs/integrity" prefetch={false}>
          <IconShieldCheck aria-hidden="true" />
          検証
        </Link>
      </Button>
    </div>
  );
}
