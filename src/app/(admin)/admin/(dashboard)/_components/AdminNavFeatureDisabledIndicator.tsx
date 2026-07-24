"use client";

import Link from "next/link";
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/admin/components/ui";
import {
  ADMIN_FEATURE_SETTINGS_HREF,
  ADMIN_NAV_DISABLED_BADGE_LABEL,
  formatAdminNavDisabledTooltip,
} from "@/shared/lib/features/admin-nav";
import type { FeatureModule } from "@/shared/lib/features/registry";
import { toAppRoute } from "@/shared/lib/typed-routes";

type AdminNavFeatureDisabledIndicatorProps = {
  readonly featureModule: FeatureModule;
  /** command palette 等、コンパクト表示向け */
  readonly compact?: boolean;
};

export function AdminNavFeatureDisabledIndicator({
  featureModule,
  compact = false,
}: AdminNavFeatureDisabledIndicatorProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className={
            compact
              ? "shrink-0 border-transparent bg-muted px-1.5 py-0 text-[0.625rem] font-medium text-muted-foreground"
              : "ml-auto shrink-0 border-transparent bg-sidebar-nav-hover px-1.5 py-0 text-[0.625rem] font-medium text-sidebar-text-muted"
          }
        >
          {ADMIN_NAV_DISABLED_BADGE_LABEL}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs space-y-2">
        <p>{formatAdminNavDisabledTooltip(featureModule)}</p>
        <Link
          href={toAppRoute(ADMIN_FEATURE_SETTINGS_HREF)}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          機能モジュール設定を開く
        </Link>
      </TooltipContent>
    </Tooltip>
  );
}
