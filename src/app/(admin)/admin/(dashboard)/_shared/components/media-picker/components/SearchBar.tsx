"use client";

/**
 * SearchBar
 *
 * メディア検索入力。shared `<Input leadingIcon>` SSoT に一本化しており、
 * h-11 タッチ標的と `text-base md:text-sm` (iOS Safari のフォーカス時
 * オートズーム回避) が自動的に適用される。
 */

import { Input } from "@/admin/components/ui";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "画像を検索...",
  "aria-label": ariaLabel = "画像を検索",
}: SearchBarProps) {
  return (
    <div className="flex-1">
      <Input
        type="search"
        leadingIcon="IconSearch"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      />
    </div>
  );
}
