/**
 * コンテンツ幅スタイルフック
 *
 * React Hook Form公式推奨のuseWatch() + Path<T>で型安全なリアルタイム幅更新
 * 型アサーション完全排除
 */

import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import {
  resolveWidthStyles,
  type WidthStyles,
} from "@/shared/lib/styles/layout-mapper";
import { LayoutWidth } from "@/shared/types/prisma";
import { isValidLayoutWidth } from "@/shared/lib/validations/enums";
import type { ContentWidth } from "@/shared/types/layout";

// =============================================================================
// Types
// =============================================================================

type UseContentWidthStylesOptions<T extends FieldValues> = {
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
 * コンテンツ幅スタイルを計算するフック
 *
 * @description
 * - React Hook Form公式 Path<T> パターンで型安全
 * - フォーム値の変更をリアルタイムで反映
 * - フォーム値が未設定の場合はfallbackをフォールバック
 */
export function useContentWidthStyles<T extends FieldValues>({
  control,
  widthFieldName,
  customFieldName,
  fallback = DEFAULT_FALLBACK,
}: UseContentWidthStylesOptions<T>): WidthStyles {
  // Path<T> により型安全 — 型アサーション不要
  const rawWidth = useWatch({ control, name: widthFieldName });
  const rawCustom = useWatch({ control, name: customFieldName });

  // typeof ナローイング（型アサーション不要）
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
  });
}
