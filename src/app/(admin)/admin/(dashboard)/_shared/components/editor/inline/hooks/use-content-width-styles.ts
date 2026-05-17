/**
 * コンテンツ幅フック (conform 対応)
 *
 * caller が現在の contentWidth (string) と contentWidthCustom (string)
 * を渡すと、resolveWidthStyles で px 値を返す。実態は pure function。
 */

import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import { isValidLayoutWidth } from "@/shared/lib/validations/enums/guards";
import type { ContentWidth } from "@/shared/types/layout";

type UseContentWidthOptions = {
  width: string | null | undefined;
  customPx: string | null | undefined;
  fallback?: ContentWidth | undefined;
};

const DEFAULT_FALLBACK: ContentWidth = {
  width: LayoutWidth.MD,
  customPx: null,
};

/**
 * コンテンツ幅をピクセル値で返す pure function。
 *
 * @returns コンテンツ幅 (px)。FULL の場合は null。
 */
export function useContentWidth({
  width,
  customPx,
  fallback = DEFAULT_FALLBACK,
}: UseContentWidthOptions): number | null {
  const effectiveWidth =
    typeof width === "string" && isValidLayoutWidth(width)
      ? width
      : fallback.width;

  const rawCustomStr = typeof customPx === "string" ? customPx : null;
  const parsedCustom = rawCustomStr ? parseInt(rawCustomStr, 10) : null;
  const effectiveCustomPx =
    parsedCustom !== null && !Number.isNaN(parsedCustom)
      ? parsedCustom
      : fallback.customPx;

  return resolveWidthStyles({
    width: effectiveWidth,
    customPx: effectiveCustomPx,
  }).px;
}
