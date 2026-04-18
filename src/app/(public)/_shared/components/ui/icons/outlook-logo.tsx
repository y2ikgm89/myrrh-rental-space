import type { SVGProps } from "react";

/**
 * Microsoft Outlook ブランドロゴ（簡易版）
 *
 * Simple Icons (https://simpleicons.org/icons/microsoftoutlook) のパスを使用。
 * Tabler Icons に Microsoft 系ブランドアイコンが存在しないため独自 SVG を提供。
 * `currentColor` を使用してテーマ追従可能。
 */
export function OutlookLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M21.386 5H11.114v2h10.272v10.013L11.114 21v-2.013h2.568v-1.007L3 14.986V5.98L13.682 3v.987L11.114 5h10.272zM8 9.987A1.967 1.967 0 0 1 9.996 8C11.104 8 12 8.895 12 10.001A1.993 1.993 0 0 1 10.004 12 1.996 1.996 0 0 1 8 9.987z" />
    </svg>
  );
}
