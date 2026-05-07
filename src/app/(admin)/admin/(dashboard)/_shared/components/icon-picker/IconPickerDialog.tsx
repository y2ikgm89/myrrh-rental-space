"use client";

/**
 * IconPickerDialog
 *
 * キュレーション済み Tabler icon を grid 表示する選択ダイアログ。
 * 業界標準（Sanity Studio Icon Field / Storyblok Icon Field / Notion）の icon picker と同様、
 * curation list（100 個程度）に絞った grid + 検索 + カテゴリ別グルーピング。
 *
 * - 各タイル 44×44 px（WCAG 2.5.5 Enhanced AAA 準拠）
 * - 検索: name / label / keywords を部分一致
 * - 選択中はハイライト + Confirm/Cancel で 2-step 確定（誤クリック防止）
 */

import { createElement, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/admin/components/ui";
import { Button } from "@/admin/components/ui";
import { ICON_CATEGORIES, searchIcons } from "@/shared/lib/icon-curation";
import type { IconMetadata } from "@/shared/lib/icon-curation";
import { cn } from "@/shared/lib/cn";
import { getCuratedIconComponent } from "@/shared/components/icon-curation/component-map";

interface IconPickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly value: string;
  readonly onConfirm: (name: string) => void;
}

export function IconPickerDialog({
  open,
  onOpenChange,
  value,
  onConfirm,
}: IconPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(value);

  // Dialog open ごとに draft を current value で reset
  // （`Resetting state with key` は Dialog 自体が unmount されないため使えない。
  //   open ↔ closed transition の片方向のみ sync すれば良いので open prop を watch する）
  const [previousOpen, setPreviousOpen] = useState(open);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setDraft(value);
      setQuery("");
    }
  }

  const filtered = query.trim() === "" ? null : searchIcons(query);

  const handleConfirm = () => {
    if (draft) {
      onConfirm(draft);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>アイコンを選択</DialogTitle>
          <DialogDescription>
            利用シーンに合わせてアイコンを選んでください。検索またはカテゴリから探せます。
          </DialogDescription>
        </DialogHeader>

        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="アイコンを検索（例: clock, ハート, wifi）"
          aria-label="アイコンを検索"
          leadingIcon="IconSearch"
        />

        <div className="max-h-[60vh] overflow-y-auto pr-2">
          {filtered ? (
            <IconGrid icons={filtered} draft={draft} onSelect={setDraft} />
          ) : (
            <div className="space-y-6">
              {ICON_CATEGORIES.map((category) => (
                <section key={category.id}>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {category.label}
                  </h3>
                  <IconGrid
                    icons={category.icons}
                    draft={draft}
                    onSelect={setDraft}
                  />
                </section>
              ))}
            </div>
          )}
          {filtered && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              「{query}」に該当するアイコンが見つかりません
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {draft ? (
              <>
                選択中: <code className="font-mono">{draft}</code>
              </>
            ) : (
              "アイコンを選択してください"
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={!draft}
            >
              選択
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface IconGridProps {
  readonly icons: readonly IconMetadata[];
  readonly draft: string;
  readonly onSelect: (name: string) => void;
}

function IconGrid({ icons, draft, onSelect }: IconGridProps) {
  return (
    <div
      role="group"
      aria-label="アイコン一覧"
      className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5"
    >
      {icons.map((icon) => {
        const Component = getCuratedIconComponent(icon.name);
        const isSelected = icon.name === draft;
        return (
          <button
            key={icon.name}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${icon.label}（${icon.name}）`}
            title={`${icon.label}\n${icon.name}`}
            onClick={() => onSelect(icon.name)}
            className={cn(
              "flex h-11 w-full min-w-11 items-center justify-center rounded-md border text-foreground transition-colors",
              "hover:border-foreground/40 hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isSelected
                ? "border-primary bg-primary/10 ring-2 ring-primary"
                : "border-border",
            )}
          >
            {Component ? (
              createElement(Component, {
                className: "h-5 w-5",
                "aria-hidden": true,
              })
            ) : (
              <span className="text-xs text-muted-foreground">?</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
