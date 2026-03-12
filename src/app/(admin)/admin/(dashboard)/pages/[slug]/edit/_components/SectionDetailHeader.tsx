"use client";

/**
 * 右パネルのヘッダー（セクション名 + タイプバッジ）
 */

import "@/admin/lib/sections/register-admin-sections";
import { Badge } from "@/admin/components/ui";
import { getAdminSectionMeta } from "@/shared/lib/sections/admin-registry";
import type { PageSectionData } from "@/admin/actions/page-section";
import { renderSectionIcon } from "@/admin/components/section-icon-resolver";

interface SectionDetailHeaderProps {
  section: PageSectionData;
}

export function SectionDetailHeader({ section }: SectionDetailHeaderProps) {
  const definition = getAdminSectionMeta(section.componentId);
  const label = definition?.meta.label ?? section.componentId;

  return (
    <div className="flex items-center gap-3 pb-4 border-b">
      <div className="p-2 rounded-md bg-primary/10">
        {renderSectionIcon(definition?.meta.icon ?? "", "h-5 w-5 text-primary")}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold truncate">
          {section.title || label}
        </h2>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <Badge variant={section.isActive ? "default" : "secondary"}>
        {section.isActive ? "表示中" : "非表示"}
      </Badge>
    </div>
  );
}
