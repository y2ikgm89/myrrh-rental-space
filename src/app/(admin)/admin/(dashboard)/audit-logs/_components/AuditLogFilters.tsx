"use client";

import { IconDownload, IconShieldCheck } from "@tabler/icons-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { adminAuditLogSearchParamsParsers } from "@/shared/lib/nuqs";
import { useDebouncedCallback } from "@/admin/hooks";
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
import { RESOURCE_LABELS, type Resource } from "@/shared/lib/admin-resources";
import { entriesOf } from "@/shared/lib/serialize";

const ACTION_OPTIONS = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(AUDIT_ACTION_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const KNOWN_RESOURCES = new Set<string>(Object.keys(RESOURCE_LABELS));

export function isKnownResource(value: string): value is Resource {
  return KNOWN_RESOURCES.has(value);
}

// RBAC の Resource（画面の権限単位）と AuditLog.resource（ドメイン層が自由文字列で
// 書き込む実データ、例: "customer.status" / "settings.tax" / "adminAuth"）は別の語彙。
// RESOURCE_LABELS で日本語化できるものはラベルを、できないものは生の文字列を表示する。
export function resourceLabel(value: string): string {
  return isKnownResource(value) ? RESOURCE_LABELS[value] : value;
}

type AuditLogFiltersProps = {
  readonly resources: readonly string[];
};

export function AuditLogFilters({ resources }: AuditLogFiltersProps) {
  const resourceOptions = [
    { value: "ALL", label: "すべて" },
    ...resources
      .map((value) => ({ value, label: resourceLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label, "ja")),
  ];

  const [params, setParams] = useQueryStates(adminAuditLogSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  // Round-4 audit Finding #21 / medium: search/userId/ipAddress の 3 text input が
  // keystroke ごとに shallow:false の setParams を即発火し、UUID を1文字ずつ打つ
  // だけで audit_logs の count+findMany が何十回も RSC 再フェッチされていた。
  // ReservationFilters / BaseFilters と同じ 300ms debounce + `key={value}` remount
  // (クリアボタンで URL から値が消えた後も Input 表示を同期させるため) に統一する。
  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );
  const setUserIdDebounced = useDebouncedCallback(
    (value: string) => void setParams({ userId: value || null, page: 1 }),
    300,
  );
  const setIpAddressDebounced = useDebouncedCallback(
    (value: string) => void setParams({ ipAddress: value || null, page: 1 }),
    300,
  );

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
  const canExportCsv = Boolean(params.dateFrom && params.dateTo);
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
        key={params.search}
        type="search"
        aria-label="監査ログ検索"
        placeholder="ユーザー・リソース・ID"
        defaultValue={params.search}
        onChange={(e) => setSearchDebounced(e.target.value)}
        className="w-[220px]"
      />

      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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

      <Select
        value={params.action || "ALL"}
        onValueChange={(value) =>
          void setParams({ action: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]" aria-label="アクションで絞り込み">
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
        <SelectTrigger className="w-[180px]" aria-label="リソースで絞り込み">
          <SelectValue placeholder="リソース" />
        </SelectTrigger>
        <SelectContent>
          {resourceOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        key={params.userId}
        type="search"
        aria-label="ユーザーID"
        placeholder="ユーザーID (UUID)"
        defaultValue={params.userId}
        onChange={(e) => setUserIdDebounced(e.target.value)}
        className="w-[160px]"
      />

      <Input
        key={params.ipAddress}
        type="search"
        aria-label="IPアドレス"
        placeholder="IPアドレス"
        defaultValue={params.ipAddress}
        onChange={(e) => setIpAddressDebounced(e.target.value)}
        className="w-[160px]"
      />

      <div className="flex min-h-11 items-center gap-2">
        <Checkbox
          id="audit-security-only"
          checked={params.securityOnly === "1"}
          onCheckedChange={(checked) =>
            void setParams({
              securityOnly: checked ? "1" : null,
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

      {canExportCsv ? (
        <Button asChild variant="outline">
          <a href={exportHref}>
            <IconDownload aria-hidden="true" />
            CSV
          </a>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled
          title="期間（開始日と終了日）を指定してください"
        >
          <IconDownload aria-hidden="true" />
          CSV
        </Button>
      )}

      <Button asChild variant="outline">
        <Link href="/api/admin/audit-logs/integrity" prefetch={false}>
          <IconShieldCheck aria-hidden="true" />
          検証
        </Link>
      </Button>
    </div>
  );
}
