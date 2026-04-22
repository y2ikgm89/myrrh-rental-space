"use client";

import type { ReactElement } from "react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/shared/lib/cn";
import { spaceSearchParamsParsers } from "@/public/lib/search-params";

interface FilterOption {
  readonly id: string;
  readonly name: string;
}

interface FilterBarProps {
  readonly categories: readonly FilterOption[];
  readonly locations?: readonly FilterOption[] | undefined;
  readonly resultCount: number;
}

const ALL_VALUE = "";

/**
 * 公開スペース一覧のフィルタ toolbar。
 *
 * 設計:
 * - インライン横並び Popover トリガー（TKP / Apple / Aesop 業界標準）
 * - Radix DropdownMenu + RadioGroup（focus trap / keyboard nav / typeahead 自動）
 * - Editorial underline reveal on hover/active（`project-design-config.md` SSoT pattern）
 * - Chevron は `▾` + `data-[state=open]:rotate-180`（Disclosure SSoT pattern）
 * - 1 拠点運用時は拠点 trigger 自体を非表示
 */
export function FilterBar({
  categories,
  locations,
  resultCount,
}: FilterBarProps): ReactElement {
  const [params, setParams] = useQueryStates(spaceSearchParamsParsers, {
    history: "push",
    shallow: false,
  });
  const [isPending, startTransition] = useTransition();

  const showLocationFilter = locations !== undefined && locations.length > 1;
  const hasActiveFilter = params.category !== null || params.location !== null;

  const activeLocationName =
    params.location !== null
      ? (locations?.find((l) => l.id === params.location)?.name ?? null)
      : null;
  const activeCategoryName =
    params.category !== null
      ? (categories.find((c) => c.id === params.category)?.name ?? null)
      : null;

  function setCategory(value: string) {
    startTransition(() => {
      void setParams({
        category: value === ALL_VALUE ? null : value,
        page: 1,
      });
    });
  }

  function setLocation(value: string) {
    startTransition(() => {
      void setParams({
        location: value === ALL_VALUE ? null : value,
        page: 1,
      });
    });
  }

  function handleReset() {
    startTransition(() => {
      void setParams({ category: null, location: null, page: 1 });
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 transition-opacity duration-300 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        isPending && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        {showLocationFilter && locations ? (
          <FilterDropdown
            label="拠点"
            activeName={activeLocationName}
            allLabel="すべての拠点"
            options={locations}
            currentValue={params.location ?? ALL_VALUE}
            onSelect={setLocation}
          />
        ) : null}
        <FilterDropdown
          label="カテゴリ"
          activeName={activeCategoryName}
          allLabel="すべてのカテゴリ"
          options={categories}
          currentValue={params.category ?? ALL_VALUE}
          onSelect={setCategory}
        />
        <button
          type="button"
          onClick={handleReset}
          disabled={!hasActiveFilter}
          aria-label="フィルタを初期状態に戻す"
          className="text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
        >
          リセット
        </button>
      </div>
      <div className="text-sm text-muted-foreground" aria-live="polite">
        該当 <span className="font-medium text-foreground">{resultCount}</span>{" "}
        件
      </div>
    </div>
  );
}

interface FilterDropdownProps {
  readonly label: string;
  readonly activeName: string | null;
  readonly allLabel: string;
  readonly options: readonly FilterOption[];
  readonly currentValue: string;
  readonly onSelect: (value: string) => void;
}

const TRIGGER_CLASS =
  "group relative inline-flex items-center gap-2 pb-2 text-base tracking-wide text-foreground transition-colors focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 data-[state=open]:after:origin-left data-[state=open]:after:scale-x-100";

function FilterDropdown({
  label,
  activeName,
  allLabel,
  options,
  currentValue,
  onSelect,
}: FilterDropdownProps): ReactElement {
  const triggerValueLabel = activeName ?? allLabel;
  const isActive = activeName !== null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          TRIGGER_CLASS,
          isActive && "after:origin-left after:scale-x-100 after:bg-accent/60",
        )}
      >
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "font-medium transition-colors",
            isActive ? "text-accent" : "text-foreground",
          )}
        >
          {triggerValueLabel}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none text-sm text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
        >
          ▾
        </span>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="start"
          className="z-50 min-w-[var(--dropdown-min-width)] overflow-hidden border border-border bg-background py-1 shadow-sm focus-visible:outline-none"
        >
          <DropdownMenu.RadioGroup
            value={currentValue}
            onValueChange={onSelect}
          >
            <FilterRadioItem value={ALL_VALUE} label={allLabel} />
            {options.map((opt) => (
              <FilterRadioItem key={opt.id} value={opt.id} label={opt.name} />
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface FilterRadioItemProps {
  readonly value: string;
  readonly label: string;
}

const RADIO_ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center px-4 py-2 text-sm text-foreground outline-none transition-colors focus:bg-surface data-[state=checked]:text-accent data-[state=checked]:font-medium";

function FilterRadioItem({ value, label }: FilterRadioItemProps): ReactElement {
  return (
    <DropdownMenu.RadioItem value={value} className={RADIO_ITEM_CLASS}>
      {label}
    </DropdownMenu.RadioItem>
  );
}
