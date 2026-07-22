"use client";

import type { ChangeEvent, ReactElement } from "react";
import { useQueryStates } from "nuqs";
import { useState, useTransition } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/public/components/design-system/button";
import { Select } from "@/public/components/design-system/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/public/components/design-system/dialog";
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
  "price-asc": "料金（安い順）",
  "price-desc": "料金（高い順）",
};

const TRIGGER_CLASS =
  "group relative inline-flex min-h-11 items-center gap-2 pb-2 text-base tracking-wide text-foreground transition-colors focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 data-[state=open]:after:origin-left data-[state=open]:after:scale-x-100";

/**
 * 公開スペース一覧のフィルタ toolbar。
 *
 * - 拠点・カテゴリ・設備・並び順・最低収容人数・空き時間帯のすべてを
 *   単一の「絞り込み」Dialog（モーダル）に統合する。ヘッダー行はトリガー +
 *   リセット + 件数のみで、デスクトップ・モバイルとも常に 1 行に収まる
 * - モーダル内の単一選択（拠点・カテゴリ・並び順）は、Dialog の中で
 *   さらにポップアップを開く二重構造を避けるためネイティブ select
 *   （design-system Select）を使う。設備は複数選択のためチェックボックス
 * - 項目順は「重要度」基準（拠点/カテゴリ → 空き時間帯（実際に予約と重複判定
 *   する本質的な facet）→ 最低収容人数 → 並び順 → 設備（副次的な絞り込み））。
 *   拠点+カテゴリ・最低収容人数+並び順はそれぞれ形状が近いペアとして
 *   `grid-cols-1 sm:grid-cols-2`（`profile-form.tsx` と同じ house pattern）で
 *   デスクトップ幅では横並びにし、可変幅の空き時間帯・設備はそれぞれ
 *   単独で全幅の行を占める
 * - すべて nuqs `useQueryStates(spaceSearchParamsParsers)` で URL 同期。
 *   任意の facet 変更で page=1 に戻す（結果セットが変わるため）
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  const categoryOptions = [
    { value: ALL_VALUE, label: "すべてのカテゴリ" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];
  const locationOptions = locations
    ? [
        { value: ALL_VALUE, label: "すべての拠点" },
        ...locations.map((l) => ({ value: l.id, label: l.name })),
      ]
    : [];
  const sortOptions = SPACE_SORT_VALUES.map((v) => ({
    value: v,
    label: SORT_LABELS[v],
  }));

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 transition-opacity duration-300",
        isPending && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isDialogOpen}
        data-state={isDialogOpen ? "open" : "closed"}
        className={cn(
          TRIGGER_CLASS,
          hasActiveFilter &&
            "after:origin-left after:scale-x-100 after:bg-accent/60",
        )}
      >
        <span className="text-xs uppercase tracking-eyebrow text-muted-foreground">
          絞り込み
        </span>
        <span
          className={cn(
            "font-medium transition-colors",
            hasActiveFilter ? "text-accent" : "text-foreground",
          )}
        >
          {hasActiveFilter ? "適用中" : "条件を指定"}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none text-sm text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
        >
          ▾
        </span>
      </button>
      <button
        type="button"
        onClick={handleReset}
        disabled={!hasActiveFilter}
        aria-label="リセット（フィルタを初期状態に戻す）"
        className="inline-flex min-h-11 items-center px-2 text-xs uppercase tracking-eyebrow text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
      >
        リセット
      </button>
      <div className="text-sm text-muted-foreground" aria-live="polite">
        該当 <span className="font-medium text-foreground">{resultCount}</span>{" "}
        件
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          footer={
            <DialogFooter className="sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground" aria-live="polite">
                該当{" "}
                <span className="font-medium text-foreground">
                  {resultCount}
                </span>{" "}
                件
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsDialogOpen(false)}
                className="w-full sm:w-auto"
              >
                閉じる
              </Button>
            </DialogFooter>
          }
        >
          <DialogHeader>
            <DialogTitle>絞り込み</DialogTitle>
            <DialogDescription>
              {showLocationFilter
                ? "拠点・カテゴリ・空き時間帯・収容人数・並び順・設備でスペースを絞り込みます。"
                : "カテゴリ・空き時間帯・収容人数・並び順・設備でスペースを絞り込みます。"}
            </DialogDescription>
          </DialogHeader>

          {showLocationFilter && locations ? (
            // grid-cols-2 は Dialog 既定の max-w-lg（512px）幅が前提。sm: は
            // viewport 基準なので、より狭い max-w を DialogContent に渡す
            // 消費者ができた場合はこの前提を再検討すること。
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="拠点"
                options={locationOptions}
                value={params.location ?? ALL_VALUE}
                onChange={(e) => setLocation(e.target.value)}
              />
              <Select
                label="カテゴリ"
                options={categoryOptions}
                value={params.category ?? ALL_VALUE}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          ) : (
            <Select
              label="カテゴリ"
              options={categoryOptions}
              value={params.category ?? ALL_VALUE}
              onChange={(e) => setCategory(e.target.value)}
            />
          )}

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

          {/* grid-cols-2 は max-w-lg 前提（上の拠点・カテゴリと同じ注意点）。 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Select
              label="並び順"
              options={sortOptions}
              value={params.sort}
              onChange={(e) => setSort(e.target.value)}
            />
          </div>

          {hasFacilityOptions ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs uppercase tracking-eyebrow text-muted-foreground">
                設備
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {facilityOptions.map((name) => (
                  <label
                    key={name}
                    className="flex min-h-11 min-w-11 items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={params.facilities.includes(name)}
                      onChange={(e) => toggleFacility(name, e.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
