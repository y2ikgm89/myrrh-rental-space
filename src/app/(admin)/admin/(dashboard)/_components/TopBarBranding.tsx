"use client";

import { useState } from "react";
import Image from "next/image";

type TopBarBrandingProps = {
  siteName: string | null;
  headerLogoUrl: string | null;
  useHeaderLogo: boolean;
};

/**
 * Next.js Image の `width` / `height` は aspect ratio 推論用の intrinsic 値。
 * 実レンダーサイズは Tailwind の `h-8 w-auto` で制御する（公式: width を CSS で
 * 変える場合は必ず height: auto も指定して aspect ratio 歪みを防ぐ）。
 * 240:64 は横長ロゴの一般的なアスペクト比 (3.75:1) を仮定。
 */
const LOGO_INTRINSIC_WIDTH = 240;
const LOGO_INTRINSIC_HEIGHT = 64;

function isSvg(url: string): boolean {
  return url.toLowerCase().endsWith(".svg");
}

export function TopBarBranding({
  siteName,
  headerLogoUrl,
  useHeaderLogo,
}: TopBarBrandingProps) {
  const [logoError, setLogoError] = useState(false);
  const displayName = siteName || "管理画面";

  if (!useHeaderLogo || !headerLogoUrl || logoError) {
    return (
      <span className="text-lg font-semibold text-foreground">
        {displayName}
      </span>
    );
  }

  return (
    <Image
      src={headerLogoUrl}
      alt={displayName}
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      priority
      unoptimized={isSvg(headerLogoUrl)}
      onError={() => setLogoError(true)}
      className="h-8 w-auto object-contain"
      sizes="120px"
    />
  );
}
