"use client";

import type { ChangeEvent, ReactElement } from "react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/shared/lib/cn";
import {
  SPACE_SORT_VALUES,
  spaceSearchParamsParsers,
  type SpaceSort,
} from "@/public/lib/search-params";

interface FilterOption {
  readonly id: string;
  readonly name: string;
}

interface FilterBarProps {
  readonly categories: readonly FilterOption[];
  readonly locations?: readonly FilterOption[] | undefined;
  readonly facilityOptions: readonly string[];
  readonly resultCount: number;
}

const ALL_VALUE = "";

const SORT_LABELS: Record<SpaceSort, string> = {
  recommended: "おすすめ順",
  "capacity-asc": "収容人数（少ない順）",
  "capacity-desc": "収容人数（多い順）",
  "price-asc": "料金（安い順）",
  "price-desc": "料金（高い順）",
};

/**
 * 公開スペース一覧のフィルタ toolbar。
 *
 * - 上段: 単一/複数選択 Dropdown（拠点・カテゴリ・設備・並び順）+ リセット + 件数
 * - 下段: 直接入力型 facet（最低収容人数 / 空き時間帯）
 * - すべて nuqs `useQueryStates(spaceSearchParamsParsers)` で URL 同期。
 *   任意の facet 変更で page=1 に戻す（結果セットが変わるため）。
 */
export function FilterBar({
  categories,
  locations,
  facilityOptions,
  resultCount,
}: FilterBarProps): ReactElement {
  // history: replace は nuqs 公式デフォルト（push はタブ/モーダル等ナビ風UI専用）。
  // フィルタはデータ絞り込みのため履歴を汚さない replace を採用。
  const [params, setParams] = useQueryStates(spaceSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });
  const [isPending, startTransition] = useTransition();

  const showLocationFilter = locations !== undefined && locations.length > 1;
  const hasFacilityOptions = facilityOptions.length > 0;
  const hasActiveFilter =
    params.category !== null ||
    params.location !== null ||
    params.q !== "" ||
    params.minCapacity !== null ||
    params.facilities.length > 0 ||
    params.date !== "" ||
    params.startTime !== "" ||
    params.endTime !== "" ||
    params.sort !== "recommended";

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

  function toggleFacility(name: string, checked: boolean) {
    startTransition(() => {
      const next = checked
        ? Array.from(new Set([...params.facilities, name]))
        : params.facilities.filter((f) => f !== name);
      void setParams({ facilities: next, page: 1 });
    });
  }

  function setSort(value: string) {
    startTransition(() => {
      void setParams({ sort: value as SpaceSort, page: 1 });
    });
  }

  function setMinCapacity(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value.trim();
    startTransition(() => {
      void setParams({
        minCapacity: raw === "" ? null : Number.parseInt(raw, 10) || null,
        page: 1,
      });
    });
  }

  function setDate(event: ChangeEvent<HTMLInputElement>) {
    startTransition(() => {
      void setParams({ date: event.target.value, page: 1 });
    });
  }

  function setStartTime(event: ChangeEvent<HTMLInputElement>) {
    startTransition(() => {
      void setParams({ startTime: event.target.value, page: 1 });
    });
  }

  function setEndTime(event: ChangeEvent<HTMLInputElement>) {
    startTransition(() => {
      void setParams({ endTime: event.target.value, page: 1 });
    });
  }

  function handleReset() {
    startTransition(() => {
      void setParams({
        category: null,
        location: null,
        q: "",
        minCapacity: null,
        facilities: [],
        date: "",
        startTime: "",
        endTime: "",
        sort: "recommended",
        page: 1,
      });
    });
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-6 transition-opacity duration-300",
        isPending && "opacity-60",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
          {hasFacilityOptions ? (
            <FacilityDropdown
              options={facilityOptions}
              selected={params.facilities}
              onToggle={toggleFacility}
            />
          ) : null}
          <SortDropdown value={params.sort} onSelect={setSort} />
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasActiveFilter}
            aria-label="リセット（フィルタを初期状態に戻す）"
            className="inline-flex min-h-11 items-center px-2 text-xs uppercase tracking-eyebrow text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
          >
            リセット
          </button>
        </div>
        <div className="text-sm text-muted-foreground" aria-live="polite">
          該当{" "}
          <span className="font-medium text-foreground">{resultCount}</span> 件
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
        <label className="flex min-h-11 flex-col gap-1 text-xs uppercase tracking-eyebrow text-muted-foreground">
          最低収容人数
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="人数"
            value={params.minCapacity ?? ""}
            onChange={setMinCapacity}
            className="min-h-11 w-32 border-b border-border bg-transparent px-1 py-2 text-base tracking-wide text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:outline-none"
          />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs uppercase tracking-eyebrow text-muted-foreground">
            空き時間帯（3 つとも指定時のみ絞り込み）
          </legend>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={params.date}
              onChange={setDate}
              aria-label="日付"
              className="min-h-11 w-40 border-b border-border bg-transparent px-1 py-2 text-base tracking-wide text-foreground focus-visible:border-accent focus-visible:outline-none"
            />
            <input
              type="time"
              value={params.startTime}
              onChange={setStartTime}
              aria-label="開始時刻"
              className="min-h-11 w-28 border-b border-border bg-transparent px-1 py-2 text-base tracking-wide text-foreground focus-visible:border-accent focus-visible:outline-none"
            />
            <span aria-hidden="true" className="text-muted-foreground">
              〜
            </span>
            <input
              type="time"
              value={params.endTime}
              onChange={setEndTime}
              aria-label="終了時刻"
              className="min-h-11 w-28 border-b border-border bg-transparent px-1 py-2 text-base tracking-wide text-foreground focus-visible:border-accent focus-visible:outline-none"
            />
          </div>
        </fieldset>
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
  "group relative inline-flex min-h-11 items-center gap-2 pb-2 text-base tracking-wide text-foreground transition-colors focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 data-[state=open]:after:origin-left data-[state=open]:after:scale-x-100";

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
        <span className="text-xs uppercase tracking-eyebrow text-muted-foreground">
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

interface FacilityDropdownProps {
  readonly options: readonly string[];
  readonly selected: readonly string[];
  readonly onToggle: (name: string, checked: boolean) => void;
}

function FacilityDropdown({
  options,
  selected,
  onToggle,
}: FacilityDropdownProps): ReactElement {
  const activeCount = selected.length;
  const isActive = activeCount > 0;
  const summary = isActive ? `${activeCount} 件選択中` : "すべての設備";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          TRIGGER_CLASS,
          isActive && "after:origin-left after:scale-x-100 after:bg-accent/60",
        )}
      >
        <span className="text-xs uppercase tracking-eyebrow text-muted-foreground">
          設備
        </span>
        <span
          className={cn(
            "font-medium transition-colors",
            isActive ? "text-accent" : "text-foreground",
          )}
        >
          {summary}
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
          className="z-50 max-h-80 min-w-[var(--dropdown-min-width)] overflow-y-auto border border-border bg-background py-1 shadow-sm focus-visible:outline-none"
        >
          {options.map((name) => {
            const checked = selected.includes(name);
            return (
              <DropdownMenu.CheckboxItem
                key={name}
                checked={checked}
                onCheckedChange={(next) => onToggle(name, next === true)}
                onSelect={(e) => e.preventDefault()}
                className={cn(
                  RADIO_ITEM_CLASS,
                  "pl-8",
                  checked && "text-accent",
                )}
              >
                <DropdownMenu.ItemIndicator className="absolute left-3 top-1/2 -translate-y-1/2 text-xs">
                  ✓
                </DropdownMenu.ItemIndicator>
                {name}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface SortDropdownProps {
  readonly value: SpaceSort;
  readonly onSelect: (value: string) => void;
}

function SortDropdown({ value, onSelect }: SortDropdownProps): ReactElement {
  const isActive = value !== "recommended";
  const label = SORT_LABELS[value];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          TRIGGER_CLASS,
          isActive && "after:origin-left after:scale-x-100 after:bg-accent/60",
        )}
      >
        <span className="text-xs uppercase tracking-eyebrow text-muted-foreground">
          並び順
        </span>
        <span
          className={cn(
            "font-medium transition-colors",
            isActive ? "text-accent" : "text-foreground",
          )}
        >
          {label}
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
          <DropdownMenu.RadioGroup value={value} onValueChange={onSelect}>
            {SPACE_SORT_VALUES.map((v) => (
              <FilterRadioItem key={v} value={v} label={SORT_LABELS[v]} />
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
