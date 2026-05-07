/**
 * CuratedIcon — curation list の Tabler icon を render する共通 component
 *
 * Client / Server 両方の context で同期描画可能（`@tabler/icons-react` は SSR safe）。
 *
 * 設計判断:
 * - `name` が空 / curation 外なら `null` を return（呼び出し側で fallback layout を維持）
 * - `aria-hidden` が default で true（NN/g + WCAG 準拠 — icon は装飾、SR は併記 label を読む）
 * - 装飾アイコン用途のみ。SR 向けに意味を伝えたい場合は呼び出し側で `aria-label` 付き wrapper を別途用意
 *
 * 業界標準: WordPress Menu Icons by ThemeIsle / Notion / Linear / Stripe の
 * 「icon は supplementary signal、text label が primary」原則に整合。
 */

import { createElement, type ReactElement } from "react";
import type { IconProps } from "@tabler/icons-react";
import { getCuratedIconComponent } from "./component-map";

interface CuratedIconProps {
  /** curation list の Tabler icon 識別子（例: "IconHome"）。空 / curation 外は no-op */
  readonly name: string | null | undefined;
  readonly className?: string;
  readonly size?: number;
  readonly strokeWidth?: number;
  /**
   * default: `true`。SR は併記 label のみ読み上げる前提。
   * icon-only context で意味を SR に伝えたい場合のみ `false` + 呼び出し側で `aria-label` を付ける。
   */
  readonly "aria-hidden"?: boolean | "true" | "false";
}

export function CuratedIcon({
  name,
  className,
  size,
  strokeWidth,
  "aria-hidden": ariaHidden = true,
}: CuratedIconProps): ReactElement | null {
  if (!name) return null;
  const Icon = getCuratedIconComponent(name);
  if (!Icon) return null;

  const props: IconProps = {
    "aria-hidden": ariaHidden,
    ...(className !== undefined && { className }),
    ...(size !== undefined && { size }),
    ...(strokeWidth !== undefined && { strokeWidth }),
  };
  return createElement(Icon, props);
}
