"use client";

/**
 * AddSectionDialog — Command Palette パターン（cmdk）
 *
 * WordPress Gutenberg / Notion / Linear / Framer と同系統のブロックインサーター。
 * ファジー検索 + カテゴリグルーピング + キーボードナビ（WAI-ARIA Combobox 準拠）。
 *
 * 設計メモ:
 * - `CommandDialog` は shadcn が公式提供する Dialog + Command の統合 primitive
 * - `CommandItem.value` に label + description + category を連結して日本語・英語どちらでもヒットする検索体験
 * - `onSelect` は cmdk が自動で提供（↑↓ で選択 → Enter で発火）
 */

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/admin/components/ui";
import {
  sectionTypeDescriptions,
  sectionTypeLabels,
  sectionTypesByCategory,
} from "@/shared/lib/validations/section";
import { SectionTypeIcon } from "./SectionTypeIcon";

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: string) => void;
  disabled: boolean;
}

export function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  disabled,
}: AddSectionDialogProps) {
  const handleSelect = (type: string) => {
    if (disabled) return;
    onAdd(type);
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="セクションを追加"
      description="キーワードで検索してセクションを挿入します"
      className="max-w-2xl"
    >
      <CommandInput placeholder="セクション名・カテゴリで検索…（例: ヒーロー、お知らせ、FAQ）" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>該当するセクションが見つかりません</CommandEmpty>
        {sectionTypesByCategory.map(
          ({ category, label: categoryLabel, types }) => {
            if (types.length === 0) return null;
            return (
              <CommandGroup key={category} heading={categoryLabel}>
                {types.map((type) => {
                  const typeLabel = sectionTypeLabels[type] ?? type;
                  const description = sectionTypeDescriptions[type] ?? "";
                  // ファジー検索対象: 日本語ラベル・英語 type 名・カテゴリ・description すべて
                  const searchValue = `${typeLabel} ${type} ${categoryLabel} ${description}`;
                  return (
                    <CommandItem
                      key={type}
                      value={searchValue}
                      onSelect={() => handleSelect(type)}
                      disabled={disabled}
                      className="gap-3"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <SectionTypeIcon
                          type={type}
                          className="h-4 w-4 text-primary"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium text-foreground">
                          {typeLabel}
                        </span>
                        {description && (
                          <span className="truncate text-xs text-muted-foreground">
                            {description}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          },
        )}
      </CommandList>
    </CommandDialog>
  );
}
