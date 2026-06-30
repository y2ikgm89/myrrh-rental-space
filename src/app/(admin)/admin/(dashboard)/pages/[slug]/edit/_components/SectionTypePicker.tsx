"use client";

/**
 * SectionTypePicker — 利用可能なセクションタイプを grid 表示する選択 UI。
 *
 * AddSectionDialog 内部で使う。各セクションは label + description + アイコンを
 * カード形式で表示し、クリックで `onSelect(type)` を発火する。
 */

import { getSectionDefinition } from "@/shared/lib/sections/registry";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";

interface SectionTypePickerProps {
  readonly availableTypes: readonly string[];
  readonly onSelect: (type: string) => void;
  readonly disabled?: boolean;
}

// レジストリから type → metadata を取得（registry.getSectionDefinition は client-safe）
function getMetadata(type: string) {
  return getSectionDefinition(type)?.metadata;
}

export function SectionTypePicker({
  availableTypes,
  onSelect,
  disabled,
}: SectionTypePickerProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {availableTypes.map((type) => {
        const meta = getMetadata(type);
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(type)}
            className="group flex min-h-11 items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SectionTypeIcon
              type={type}
              className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground"
            />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{meta?.label ?? type}</div>
              {meta?.description && (
                <div className="text-xs text-muted-foreground">
                  {meta.description}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
