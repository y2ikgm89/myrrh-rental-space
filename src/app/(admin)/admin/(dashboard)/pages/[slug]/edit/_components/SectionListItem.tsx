"use client";

/**
 * SectionListItem — SectionListSidebar 内の 1 行コンポーネント
 *
 * - drag handle（UI のみ、DnD 配線は SectionListSidebar 側で `dragHandleProps` を流し込む）
 * - セクション本体クリックで `onClick`
 * - kebab menu（DropdownMenu）で toggle / duplicate / delete
 * - 44px ヒットエリア確保（WCAG 2.5.5 Enhanced）
 */

import {
  IconCopy,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconTrash,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";

export interface SectionListItemProps {
  readonly section: PageSectionData;
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly onToggleActive: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly canDuplicate: boolean;
  readonly canDelete: boolean;
  readonly canDrag: boolean;
  readonly dragHandleProps?: Record<string, unknown>;
  /**
   * 削除ボタンを表示するが disabled にし、tooltip でこの理由を表示する。
   * `canDelete=true` のときのみ有効。`canDelete=false`（page-hero 等）の場合は
   * 従来通り削除メニューアイテム自体を非表示にする。
   * PAGE_TEMPLATES.requiredSectionTypes に含まれる section で使用。
   */
  readonly disableDeleteReason?: string;
}

export function SectionListItem({
  section,
  isActive,
  onClick,
  onToggleActive,
  onDuplicate,
  onDelete,
  canDuplicate,
  canDelete,
  canDrag,
  dragHandleProps,
  disableDeleteReason,
}: SectionListItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-1 py-1",
        "hover:bg-accent/50",
        isActive && "bg-accent",
      )}
    >
      {canDrag ? (
        <button
          type="button"
          className="flex min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
          aria-label="並び替え"
          {...dragHandleProps}
        >
          <IconGripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <span
          className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground/40"
          aria-hidden="true"
        >
          <IconGripVertical className="h-4 w-4" />
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-h-11 flex-1 items-center gap-2 rounded-sm px-1 text-left text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !section.isActive && "opacity-60",
        )}
      >
        <SectionTypeIcon
          type={section.type}
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <span className="truncate">
          {sectionTypeLabels[section.type] ?? section.type}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="セクション操作メニュー"
          >
            <IconDotsVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onToggleActive}>
            {section.isActive ? (
              <IconEyeOff className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <IconEye className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {section.isActive ? "非表示にする" : "表示する"}
          </DropdownMenuItem>
          {canDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <IconCopy className="mr-2 h-4 w-4" aria-hidden="true" />
              複製
            </DropdownMenuItem>
          )}
          {canDelete && !disableDeleteReason && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <IconTrash className="mr-2 h-4 w-4" aria-hidden="true" />
                削除
              </DropdownMenuItem>
            </>
          )}
          {canDelete && disableDeleteReason && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled
                title={disableDeleteReason}
                aria-label={`削除（${disableDeleteReason}）`}
                className="text-muted-foreground"
              >
                <IconTrash className="mr-2 h-4 w-4" aria-hidden="true" />
                削除（必須セクション）
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
