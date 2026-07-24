"use client";

import { useQueryStates } from "nuqs";
import { BaseFilters } from "@/admin/components/table";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/admin/components/ui";
import {
  CUSTOMER_TYPE_FILTER_ALL,
  adminInquirySearchParamsParsers,
} from "@/shared/lib/nuqs";
import type { InquiryCustomerTypeFilter } from "@/shared/lib/nuqs";
import {
  CUSTOMER_TYPE_LABELS,
  INQUIRY_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";
import type {
  AssignableStaffOption,
  InquiryTagOption,
} from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

const STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(INQUIRY_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const CUSTOMER_TYPE_OPTIONS: {
  value: InquiryCustomerTypeFilter;
  label: string;
}[] = [
  { value: CUSTOMER_TYPE_FILTER_ALL, label: "すべての種別" },
  ...entriesOf(CUSTOMER_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const UNASSIGNED_VALUE = "__ALL__";

type InquiryFiltersProps = {
  staff: Serialized<AssignableStaffOption>[];
  tags: Serialized<InquiryTagOption>[];
};

export function InquiryFilters({ staff, tags }: InquiryFiltersProps) {
  const [params, setParams] = useQueryStates(adminInquirySearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  return (
    <div className="space-y-3">
      <BaseFilters
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="名前、メール、件名、本文で検索..."
      >
        <div className="w-full sm:w-44">
          <Select
            value={params.assigneeId || UNASSIGNED_VALUE}
            onValueChange={(value) =>
              void setParams({
                assigneeId: value === UNASSIGNED_VALUE ? null : value,
                page: 1,
              })
            }
          >
            <SelectTrigger aria-label="担当者で絞り込み">
              <SelectValue placeholder="担当者" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED_VALUE}>すべての担当者</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-40">
          <Select
            value={params.tagId || UNASSIGNED_VALUE}
            onValueChange={(value) =>
              void setParams({
                tagId: value === UNASSIGNED_VALUE ? null : value,
                page: 1,
              })
            }
          >
            <SelectTrigger aria-label="タグで絞り込み">
              <SelectValue placeholder="タグ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED_VALUE}>すべてのタグ</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-40">
          <Select
            value={params.customerType}
            onValueChange={(value) => {
              const next = CUSTOMER_TYPE_OPTIONS.find(
                (o) => o.value === value,
              )?.value;
              if (!next) return;
              void setParams({ customerType: next, page: 1 });
            }}
          >
            <SelectTrigger aria-label="送信者種別で絞り込み">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOMER_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </BaseFilters>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="inquiry-sla-expired"
            checked={params.slaExpired}
            onCheckedChange={(checked) =>
              void setParams({ slaExpired: checked, page: 1 })
            }
          />
          <Label htmlFor="inquiry-sla-expired" className="whitespace-nowrap">
            SLA超過のみ
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">受付日:</span>
          <Input
            type="date"
            aria-label="受付日 (開始)"
            value={params.createdFrom}
            onChange={(e) =>
              void setParams({ createdFrom: e.target.value || null, page: 1 })
            }
            className="w-[150px]"
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <Input
            type="date"
            aria-label="受付日 (終了)"
            value={params.createdTo}
            onChange={(e) =>
              void setParams({ createdTo: e.target.value || null, page: 1 })
            }
            className="w-[150px]"
          />
        </div>
      </div>
    </div>
  );
}
