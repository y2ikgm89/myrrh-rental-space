"use client";

/**
 * 規約同意記録一覧の絞り込み UI（scope / 対象規約 / ゲストメール）。
 *
 * Round-4 audit Finding #19 / medium: query 層 (getAdminAgreements) は
 * scope/termsId/guestEmailKeyword を受け付けていたが、それを設定する UI が
 * 存在せず、20,000 件規模の記録から「特定のゲストメールの同意履歴」を
 * 追うには内部クエリキーを知った上で手動 URL 編集する必要があった。
 * InquiryFilters / CustomerFilters と同じ nuqs `useQueryStates` パターンで
 * 絞り込み UI を提供する。
 */

import { useQueryStates } from "nuqs";
import { adminTermsAgreementsSearchParamsParsers } from "@/shared/lib/nuqs";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
} from "@/admin/components/ui";
import { TERMS_SCOPE_LABELS } from "@/shared/lib/validations/terms";
import { entriesOf } from "@/shared/lib/serialize";

const SCOPE_OPTIONS = [
  { value: "ALL", label: "すべての画面" },
  ...entriesOf(TERMS_SCOPE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

type TermsOption = { id: string; title: string };

type TermsAgreementsFiltersProps = {
  readonly termsOptions: readonly TermsOption[];
};

export function TermsAgreementsFilters({
  termsOptions,
}: TermsAgreementsFiltersProps) {
  const [params, setParams] = useQueryStates(
    adminTermsAgreementsSearchParamsParsers,
    { history: "replace", shallow: false },
  );

  const setGuestEmailDebounced = useDebouncedCallback(
    (value: string) => void setParams({ guestEmail: value || null, page: 1 }),
    300,
  );

  const hasFilters = params.scope || params.termsId || params.guestEmail;

  const handleReset = () => {
    void setParams({ scope: null, termsId: null, guestEmail: null, page: 1 });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-full sm:w-56">
        <Select
          value={params.scope || "ALL"}
          onValueChange={(value) =>
            void setParams({ scope: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger aria-label="画面で絞り込み">
            <SelectValue placeholder="画面" />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-64">
        <Select
          value={params.termsId || "ALL"}
          onValueChange={(value) =>
            void setParams({
              termsId: value === "ALL" ? null : value,
              page: 1,
            })
          }
        >
          <SelectTrigger aria-label="対象規約で絞り込み">
            <SelectValue placeholder="対象規約" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべての規約</SelectItem>
            {termsOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Input
        key={params.guestEmail}
        type="search"
        aria-label="ゲストメールで絞り込み"
        placeholder="ゲストメールで絞り込み"
        defaultValue={params.guestEmail}
        onChange={(e) => setGuestEmailDebounced(e.target.value)}
        className="w-[220px]"
      />

      {hasFilters && (
        <Button variant="ghost" onClick={handleReset}>
          クリア
        </Button>
      )}
    </div>
  );
}
