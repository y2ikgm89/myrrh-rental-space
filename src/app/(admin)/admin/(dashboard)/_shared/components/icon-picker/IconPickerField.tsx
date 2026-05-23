"use client";

/**
 * IconPickerField
 *
 * 単一行（44px）のコンパクトなアイコン選択トリガー。
 * クリックで既存 IconPickerDialog（検索 + カテゴリ別グリッド）を起動する。
 *
 * UI:
 * - 未選択時: `[+ アイコンを選択]` ghost ボタン
 * - 選択済み時: `[<icon> ラベル]` ボタン + 横に `[×]` 削除ボタン
 *
 * a11y:
 * - WCAG 2.5.5 Enhanced (AAA) — トリガー / 削除ともに 44×44 CSS px 以上
 * - 親 `<Label htmlFor>` / エラー要素 ID と紐づけるため `id` / `aria-describedby` を
 *   primary トリガーボタンに forward (conform `fields.xxx.id` / `fields.xxx.errorId` を受ける)
 */

import { createElement, useState } from "react";
import { IconPlus, IconX } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { findIconMetadata } from "@/shared/lib/icon-curation";
import { cn } from "@/shared/lib/cn";
import { getCuratedIconComponent } from "@/shared/components/icon-curation/component-map";
import { IconPickerDialog } from "./IconPickerDialog";

interface IconPickerFieldProps {
  /** 現在選択中のアイコン名（未選択時は空文字） */
  readonly value: string;
  /** 変更ハンドラ。削除時は空文字を渡す */
  readonly onChange: (name: string) => void;
  /** 入力無効化（フォーム送信中など） */
  readonly disabled?: boolean;
  /**
   * 親 `<Label htmlFor>` と紐づけるための id。conform `fields.xxx.id` を forward する。
   * primary トリガーボタンに付与され、ラベルクリックでフォーカスが移る。
   */
  readonly id?: string;
  /**
   * エラーメッセージ要素の id (conform `fields.xxx.errorId` 等)。
   * primary トリガーボタンの `aria-describedby` に forward し SR にエラー伝搬する。
   */
  readonly "aria-describedby"?: string;
}

export function IconPickerField({
  value,
  onChange,
  disabled = false,
  id,
  "aria-describedby": ariaDescribedBy,
}: IconPickerFieldProps) {
  const [open, setOpen] = useState(false);

  const hasValue = value.length > 0;
  const metadata = hasValue ? findIconMetadata(value) : undefined;
  const Component = hasValue ? getCuratedIconComponent(value) : undefined;

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-label={
            hasValue
              ? `アイコン: ${metadata?.label ?? value}（クリックで変更）`
              : "アイコンを選択"
          }
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm",
            "transition-colors hover:border-foreground/30 hover:bg-muted/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {hasValue && Component ? (
            <>
              {createElement(Component, {
                className: "h-5 w-5 shrink-0 text-foreground",
                "aria-hidden": true,
              })}
              <span className="truncate">
                {metadata?.label ?? "（キュレーション外）"}
              </span>
              <span className="ml-auto hidden shrink-0 truncate font-mono text-xs text-muted-foreground sm:inline">
                {value}
              </span>
            </>
          ) : (
            <>
              <IconPlus
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">アイコンを選択</span>
            </>
          )}
        </button>

        {hasValue && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onChange("")}
            disabled={disabled}
            aria-label="アイコンを削除"
            className={cn(
              "shrink-0",
              "border-destructive text-destructive",
              "hover:border-destructive hover:bg-destructive/10 hover:text-destructive",
              "focus-visible:ring-destructive",
              "active:bg-destructive/15",
            )}
          >
            <IconX className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <IconPickerDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        onConfirm={(name) => onChange(name)}
      />
    </>
  );
}
