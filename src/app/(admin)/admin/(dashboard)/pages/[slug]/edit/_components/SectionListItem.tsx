"use client";

/**
 * セクションリストアイテム（DnD対応）
 *
 * 番号付きリスト + ホバーでドラッグハンドル表示
 * 280px幅のパネルに最適化
 */

import { useSortable } from "@dnd-kit/sortable";
import { cn } from "@/shared/lib/cn";
import { toTranslate3d } from "@/admin/components/ui/sortable";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/admin/components/ui";
import {
  IconGripVertical,
  IconDots,
  IconEye,
  IconEyeOff,
  IconCopy,
  IconTrash,
} from "@tabler/icons-react";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import type { PageSectionData } from "@/admin/actions/page-section";
import { isRecord } from "@/shared/lib/serialize";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";

function sectionPreviewText(section: PageSectionData): string | null {
  const config: unknown = section.config;
  if (!isRecord(config)) return null;
  const candidates = ["title", "subtitle", "description", "heading", "label"];
  for (const key of candidates) {
    const val = config[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
}

interface SectionListItemProps {
  section: PageSectionData;
  index: number;
  isSelected: boolean;
  isLast: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}

export function SectionListItem({
  section,
  index,
  isSelected,
  isLast,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
  disabled,
}: SectionListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const label = sectionTypeLabels[section.type];
  const preview = sectionPreviewText(section);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-2 px-2.5 py-2.5 cursor-pointer transition-colors",
        !isLast && "border-b border-border/40",
        isSelected
          ? "bg-primary/5 border-l-2 border-l-primary"
          : "bg-transparent hover:bg-muted/50",
        !section.isActive && "opacity-40",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20 bg-card",
      )}
      onClick={() => onSelect(section.id)}
    >
      {/* 番号 -- ホバーでドラッグハンドルに切り替え */}
      <div className="relative shrink-0 flex items-center justify-center w-5 h-5">
        <span
          className={cn(
            "text-[10px] tabular-nums transition-opacity",
            "group-hover:opacity-0",
            isSelected
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          {index + 1}
        </span>
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center cursor-grab touch-none text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          {...attributes}
          {...listeners}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        >
          <IconGripVertical className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* アイコン */}
      <SectionTypeIcon
        type={section.type}
        className={cn(
          "h-4 w-4 shrink-0",
          isSelected ? "text-foreground" : "text-muted-foreground",
        )}
      />

      {/* ラベル */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm truncate",
            isSelected
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {section.title || label}
        </p>
        {preview !== null && (
          <p className="text-[11px] text-muted-foreground truncate">
            {preview}
          </p>
        )}
      </div>

      {/* 非表示インジケータ */}
      {!section.isActive && (
        <IconEyeOff className="h-3 w-3 text-muted-foreground shrink-0" />
      )}

      {/* メニュー */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <IconDots className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onToggle(section.id, !section.isActive);
            }}
          >
            {section.isActive ? (
              <>
                <IconEyeOff className="h-4 w-4 mr-2" />
                非表示にする
              </>
            ) : (
              <>
                <IconEye className="h-4 w-4 mr-2" />
                表示する
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(section.id);
            }}
          >
            <IconCopy className="h-4 w-4 mr-2" />
            複製
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(section.id);
            }}
          >
            <IconTrash className="h-4 w-4 mr-2" />
            削除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
