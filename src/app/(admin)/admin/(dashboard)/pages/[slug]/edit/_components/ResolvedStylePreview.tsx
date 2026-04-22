"use client";

/**
 * ResolvedStylePreview — 4-tier cascade の最終解決値をプレビュー表示する。
 *
 * `resolveSectionStyle()` を呼び出し、spacing / background / container / typography /
 * animation / customClass と「どの層（global / page / section / override）に由来するか」
 * を informational に示す読み取り専用サマリー。編集は Style Library の StyleEditor へ。
 */

import { resolveSectionStyle } from "@/shared/domain/section-styles/style-resolver";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type {
  PageSectionData,
  PageSectionStyle,
} from "@/admin/actions/page-section-types";

/**
 * 解決に必要な最小 page / settings shape。現時点では page.pageStyle /
 * settings.globalSectionStyle は未配線（Page 編集画面 /
 * Settings 編集画面にフィールドが追加される）。
 */
interface MinimalPage {
  readonly pageStyle?: PageSectionStyle | null;
}
interface MinimalSettings {
  readonly globalSectionStyle?: PageSectionStyle | null;
}

interface ResolvedStylePreviewProps {
  readonly section: PageSectionData;
  readonly page?: MinimalPage;
  readonly settings?: MinimalSettings;
}

function fieldOrigin(
  fieldGroup:
    | "spacing"
    | "background"
    | "container"
    | "typography"
    | "animation",
  section: PageSectionData,
  page?: MinimalPage,
  settings?: MinimalSettings,
): string {
  // 最高優先度の layer から順にチェックする。resolveSectionStyle と同じ優先度:
  //   section.styleOverride > section.style > page.pageStyle > settings.globalSectionStyle > default
  const override = section.styleOverride;
  if (
    override !== null &&
    typeof override === "object" &&
    !Array.isArray(override) &&
    (override as Record<string, unknown>)[fieldGroup] !== undefined
  ) {
    return "override";
  }
  if (section.style && (section.style as Record<string, unknown>)[fieldGroup]) {
    return "section";
  }
  if (
    page?.pageStyle &&
    (page.pageStyle as Record<string, unknown>)[fieldGroup]
  ) {
    return "page";
  }
  if (
    settings?.globalSectionStyle &&
    (settings.globalSectionStyle as Record<string, unknown>)[fieldGroup]
  ) {
    return "global";
  }
  return "default";
}

const ORIGIN_LABELS: Record<string, string> = {
  override: "セクション上書き",
  section: "セクション Style",
  page: "ページ既定",
  global: "グローバル既定",
  default: "デフォルト",
};

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[invalid]";
  }
}

export function ResolvedStylePreview({
  section,
  page,
  settings,
}: ResolvedStylePreviewProps) {
  const resolved: SectionStylePayload = resolveSectionStyle(
    {
      style: section.style,
      styleOverride: section.styleOverride,
    },
    {
      pageStyle: page?.pageStyle ?? null,
    },
    {
      globalSectionStyle: settings?.globalSectionStyle ?? null,
    },
  );

  const rows = [
    {
      label: "paddingTop",
      value: resolved.spacing.paddingTop,
      origin: fieldOrigin("spacing", section, page, settings),
    },
    {
      label: "paddingBottom",
      value: resolved.spacing.paddingBottom,
      origin: fieldOrigin("spacing", section, page, settings),
    },
    {
      label: "background.type",
      value: resolved.background.type,
      origin: fieldOrigin("background", section, page, settings),
    },
    {
      label: "container.maxWidth",
      value: resolved.container.maxWidth,
      origin: fieldOrigin("container", section, page, settings),
    },
    {
      label: "typography.titleSize",
      value: resolved.typography.titleSize,
      origin: fieldOrigin("typography", section, page, settings),
    },
    {
      label: "typography.textAlign",
      value: resolved.typography.textAlign,
      origin: fieldOrigin("typography", section, page, settings),
    },
    {
      label: "animation.preset",
      value: resolved.animation.preset,
      origin: fieldOrigin("animation", section, page, settings),
    },
  ];

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
      <p className="text-xs font-semibold text-foreground">
        解決後のスタイル（プレビュー）
      </p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-2 border-b border-border/30 py-1 last:border-b-0"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="flex items-center gap-2">
              <span className="font-mono">{renderValue(row.value)}</span>
              <span className="rounded bg-background px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                {ORIGIN_LABELS[row.origin] ?? row.origin}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {resolved.customClass ? (
        <p className="text-xs text-muted-foreground">
          customClass: <code className="font-mono">{resolved.customClass}</code>
        </p>
      ) : null}
    </div>
  );
}
