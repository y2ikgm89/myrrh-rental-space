"use client";

/**
 * 右パネルのヘッダー — タイプアイコン + タイトル + 表示状態
 *
 * コンパクトな1行ヘッダー。タイプ名はサイドバーと重複するため省略し、
 * タイトル（またはタイプラベルのフォールバック）のみ表示。
 */

import { sectionTypeLabels } from "@/shared/lib/validations/section";
import type { PageSectionData } from "@/admin/actions/page-section";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";

interface SectionDetailHeaderProps {
  section: PageSectionData;
}

export function SectionDetailHeader({ section }: SectionDetailHeaderProps) {
  const label = sectionTypeLabels[section.type];

  return (
    <div className="flex items-center gap-2.5 pb-3 mb-1 border-b border-border">
      <SectionTypeIcon
        type={section.type}
        className="h-4 w-4 shrink-0 text-muted-foreground"
      />
      <h2 className="flex-1 min-w-0 text-sm font-medium truncate">
        {section.title || label}
      </h2>
      {!section.isActive && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          非表示
        </span>
      )}
    </div>
  );
}
