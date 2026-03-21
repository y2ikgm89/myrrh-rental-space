/**
 * コンテンツ幅フック
 *
 * React Hook Form 公式推奨の useWatch() + Path<T> で型安全なリアルタイム幅更新。
 * 解決済みピクセル値を返す（エディタの contentWidth prop にそのまま渡せる）。
 */

import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { LayoutWidth } from "@/shared/types/prisma";
import { isValidLayoutWidth } from "@/shared/lib/validations/enums";
import type { ContentWidth } from "@/shared/types/layout";

// =============================================================================
// Types
// =============================================================================

type UseContentWidthOptions<T extends FieldValues> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any>;
  widthFieldName: Path<T>;
  customFieldName: Path<T>;
  fallback?: ContentWidth | undefined;
};

const DEFAULT_FALLBACK: ContentWidth = {
  width: LayoutWidth.MD,
  customPx: null,
};

// =============================================================================
// Hook
// =============================================================================

/**
 * コンテンツ幅をピクセル値で返すフック
 *
 * @returns コンテンツ幅（px）。FULL の場合は null。
 */
export function useContentWidth<T extends FieldValues>({
  control,
  widthFieldName,
  customFieldName,
  fallback = DEFAULT_FALLBACK,
}: UseContentWidthOptions<T>): number | null {
  const rawWidth = useWatch({ control, name: widthFieldName });
  const rawCustom = useWatch({ control, name: customFieldName });

  const effectiveWidth =
    typeof rawWidth === "string" && isValidLayoutWidth(rawWidth)
      ? rawWidth
      : fallback.width;

  const rawCustomStr = typeof rawCustom === "string" ? rawCustom : null;
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
