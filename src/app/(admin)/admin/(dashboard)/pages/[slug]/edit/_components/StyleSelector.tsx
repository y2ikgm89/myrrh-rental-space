"use client";

/**
 * StyleSelector — セクションに適用する SectionStyle preset を選択する Select。
 *
 * 「未選択」は cascade 継承（Page.pageStyle → Settings.globalSectionStyle →
 * DEFAULT_SECTION_STYLE）を意味する。
 *
 * applicableTypes は `isStyleApplicableToType` と同契約で
 * ① 空配列（全 type 対象）または ② `includes(sectionType)` を満たす style のみ表示。
 */

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import type { SectionStyleListItem } from "@/shared/domain/section-styles/queries";

// Radix Select は value="" を placeholder 用に予約しているため sentinel を使う。
// 詳細: gotchas.md §shadcn/ui コンポーネント
const NONE_VALUE = "__none__";

interface StyleSelectorProps {
  /** 対象セクションの type（例: "hero", "custom", "space-list"）。applicableTypes フィルタに使用 */
  readonly sectionType: string;
  /** 現在選択中の styleId（未選択は null） */
  readonly value: string | null;
  /** 選択変更時のコールバック。null は「未選択（カスケード継承）」を意味する */
  readonly onChange: (styleId: string | null) => void;
  /** 保存中等で disable したい場合 */
  readonly disabled?: boolean;
}

export function StyleSelector({
  sectionType,
  value,
  onChange,
  disabled,
}: StyleSelectorProps) {
  const [styles, setStyles] = useState<SectionStyleListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    void fetchAdminJson<SectionStyleListItem[]>("/admin/api/section-styles", {
      cache: "no-store",
      signal: abortController.signal,
    })
      .then((list) => {
        setStyles(list);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setLoadError(
          err instanceof Error ? err.message : "Style の読み込みに失敗しました",
        );
        setStyles([]);
      });

    return () => {
      abortController.abort();
    };
  }, []);

  const applicable = (styles ?? []).filter(
    (style) =>
      style.applicableTypes.length === 0 ||
      style.applicableTypes.includes(sectionType),
  );

  const selectValue = value ?? NONE_VALUE;

  return (
    <div className="space-y-1.5">
      <Select
        value={selectValue}
        onValueChange={(next) => {
          onChange(next === NONE_VALUE ? null : next);
        }}
        disabled={disabled || styles === null}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={styles === null ? "読み込み中..." : "スタイルを選択"}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>未選択（カスケード継承）</SelectItem>
          {applicable.map((style) => (
            <SelectItem key={style.id} value={style.id}>
              {style.name}
              {style.scope !== "section" ? ` (${style.scope})` : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        未選択の場合、ページ / グローバル / デフォルトの順で値が継承されます。
      </p>
      {loadError ? (
        <p className="text-xs text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
