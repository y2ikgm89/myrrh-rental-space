"use client";

/**
 * IconPickerField
 *
 * RHF agnostic な単一アイコン選択フィールド。`<FormField>` の `<FormControl>` 配下、
 * または auto-section-form / AutoArrayField の Controller 内で使う。
 *
 * UI パターン（MediaPickerField 準拠）:
 * - **未選択時**: 大きい dashed ドロップ枠全体がクリック可能 button。アイコン + 「アイコンを選択」ラベル
 * - **選択済み時**: アイコンプレビュー + 識別子表示 + 「変更 / 削除」outline ボタン
 *
 * a11y:
 * - 全 interactive 要素 ≥ 44px（WCAG 2.5.5 Enhanced）
 * - shadcn `<FormControl>` の Slot 注入（id / aria-describedby）を primary トリガーに forward
 *   （aria-invalid は button role 非対応のため意図的に受け取らない）
 */

import { createElement, useState } from "react";
import { Button } from "@/admin/components/ui";
import { IconCircleDashed, IconReplace, IconTrash } from "@tabler/icons-react";
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
   * shadcn `<FormControl>` から Slot 経由で注入される。
   * primary トリガーボタンに forward して FormLabel / FormMessage と紐づける。
   */
  readonly id?: string;
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
    <div className="space-y-2">
      {hasValue ? (
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30",
            )}
            aria-hidden="true"
          >
            {Component ? (
              createElement(Component, {
                className: "h-7 w-7 text-foreground",
              })
            ) : (
              <IconCircleDashed className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {metadata?.label ?? "キュレーション外のアイコン"}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {value}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                disabled={disabled}
                id={id}
                aria-describedby={ariaDescribedBy}
                aria-label="アイコンを変更"
              >
                <IconReplace className="mr-1 h-4 w-4" aria-hidden="true" />
                変更
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange("")}
                disabled={disabled}
                aria-label="アイコンを削除"
                className={cn(
                  "border-destructive text-destructive",
                  "hover:border-destructive hover:bg-destructive/10 hover:text-destructive",
                  "focus-visible:ring-destructive",
                  "active:bg-destructive/15",
                )}
              >
                <IconTrash className="mr-1 h-4 w-4" aria-hidden="true" />
                削除
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-label="アイコンを選択"
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-1.5 px-4 py-6",
            "rounded-lg border-2 border-dashed border-border bg-muted/30",
            "text-muted-foreground transition-colors",
            "hover:border-foreground/40 hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <IconCircleDashed className="h-7 w-7 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">アイコンを選択</span>
          <span className="text-center text-xs leading-snug text-muted-foreground">
            キュレーション一覧から選択
          </span>
        </button>
      )}

      <IconPickerDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        onConfirm={onChange}
      />
    </div>
  );
}
