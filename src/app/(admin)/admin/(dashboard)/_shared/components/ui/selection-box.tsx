"use client";

/**
 * SelectionBox コンポーネント
 *
 * ラジオボタンを視覚的にわかりやすいボックスリスト形式で表示するUIコンポーネント
 * アクセシビリティ対応（role="radiogroup", role="radio", aria-checked）
 */

import { useId, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

// =============================================================================
// Types
// =============================================================================

export interface SelectionBoxOption {
  /** オプションの値 */
  value: string;
  /** 表示ラベル */
  label: string;
  /** オプションの説明（任意） */
  description?: string;
  /** アイコン（任意） */
  icon?: ReactNode;
}

export interface SelectionBoxProps {
  /** 選択肢の配列 */
  options: SelectionBoxOption[];
  /** 現在の選択値 */
  value: string;
  /** 値変更時のコールバック */
  onChange: (value: string) => void;
  /** グリッド列数 */
  columns?: 1 | 2 | 3;
  /** 無効状態 */
  disabled?: boolean;
  /** aria-label用の名前 */
  name?: string;
  /** エラーメッセージを説明する要素の id */
  ariaDescribedBy?: string | undefined;
  /** 追加のクラス名 */
  className?: string;
}

// =============================================================================
// SelectionBox
// =============================================================================

function SelectionBox({
  options,
  value,
  onChange,
  columns = 1,
  disabled = false,
  name,
  ariaDescribedBy,
  className,
}: SelectionBoxProps) {
  const groupId = useId();

  const handleSelect = (optionValue: string) => {
    if (!disabled) {
      onChange(optionValue);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    optionValue: string,
  ) => {
    if (disabled) return;

    const currentIndex = options.findIndex((opt) => opt.value === optionValue);
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        nextIndex = (currentIndex + 1) % options.length;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        nextIndex = (currentIndex - 1 + options.length) % options.length;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        onChange(optionValue);
        return;
    }

    if (nextIndex !== null) {
      const nextOption = options[nextIndex];
      if (!nextOption) return;
      onChange(nextOption.value);
      // フォーカスを次の要素に移動
      const nextButton = document.querySelector(
        `[data-selection-box-id="${groupId}"][data-value="${nextOption.value}"]`,
      );
      if (nextButton instanceof HTMLElement) {
        nextButton.focus();
      }
    }
  };

  const gridColumnsClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  }[columns];

  return (
    <div
      role="radiogroup"
      aria-label={name}
      aria-describedby={ariaDescribedBy}
      className={cn("grid gap-3", gridColumnsClass, className)}
    >
      {options.map((option) => {
        const isSelected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-selection-box-id={groupId}
            data-value={option.value}
            disabled={disabled}
            onClick={() => handleSelect(option.value)}
            onKeyDown={(e) => handleKeyDown(e, option.value)}
            tabIndex={isSelected ? 0 : -1}
            className={cn(
              // ベーススタイル
              "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-all",
              // フォーカス
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              // 無効状態
              "disabled:cursor-not-allowed disabled:opacity-50",
              // 選択状態
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-input bg-background hover:border-primary/50 hover:bg-muted/50",
            )}
          >
            {/* アイコン */}
            {option.icon && (
              <div
                className={cn(
                  "flex-shrink-0 [&_svg]:size-5",
                  isSelected ? "text-primary" : "text-muted-foreground",
                )}
              >
                {option.icon}
              </div>
            )}

            {/* ラベルと説明 */}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-sm font-medium",
                  isSelected ? "text-foreground" : "text-foreground",
                )}
              >
                {option.label}
              </div>
              {option.description && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {option.description}
                </div>
              )}
            </div>

            {/* ラジオインジケーター */}
            <div
              className={cn(
                "flex-shrink-0 mt-0.5 h-4 w-4 rounded-full border",
                "flex items-center justify-center",
                isSelected
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30 bg-background",
              )}
            >
              {isSelected && (
                <div className="h-2 w-2 rounded-full bg-primary-foreground" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export { SelectionBox };
