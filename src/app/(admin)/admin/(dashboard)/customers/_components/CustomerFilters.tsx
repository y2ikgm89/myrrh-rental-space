"use client";

import { useQueryStates } from "nuqs";
import { BaseFilters, type StatusOption } from "@/admin/components/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import {
  CUSTOMER_TYPE_FILTER_ALL,
  adminCustomerSearchParamsParsers,
  type CustomerTypeFilter,
} from "@/shared/lib/nuqs";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";

const CUSTOMER_STATUS_OPTIONS: StatusOption[] = [
  { value: "ALL", label: "すべて" },
  ...entriesOf(CUSTOMER_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const CUSTOMER_TYPE_OPTIONS: { value: CustomerTypeFilter; label: string }[] = [
  { value: CUSTOMER_TYPE_FILTER_ALL, label: "すべての種別" },
  ...entriesOf(CUSTOMER_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export function CustomerFilters() {
  const [params, setParams] = useQueryStates(adminCustomerSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  const handleTypeChange = (value: string) => {
    // parseAsStringLiteral がロードで validate するため、ここは narrow して代入のみ
    const next = CUSTOMER_TYPE_OPTIONS.find((o) => o.value === value)?.value;
    if (!next) return;
    void setParams({ customerType: next, page: 1 });
  };

  return (
    <BaseFilters
      statusOptions={CUSTOMER_STATUS_OPTIONS}
      searchPlaceholder="名前、メール、電話番号、会社名で検索..."
    >
      <div className="w-full sm:w-48">
        <Select value={params.customerType} onValueChange={handleTypeChange}>
          <SelectTrigger aria-label="顧客種別">
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
  );
}
