"use client";

/**
 * Site Brand — Editorial Magazine 準拠のロゴ/テキスト表示。
 *
 * Header/Footer 両方で共有。Settings の `useLogo` + `logoUrl` に応じて
 * Next.js Image（LCP 最適化）またはセリフイタリックのテキストを描画する。
 *
 * - `useLogo && logoUrl` → <Image> with loading="eager" for header (above-fold), lazy for footer
 *   ヘッダーロゴは小さい SVG が多く LCP ではないため `preload` / `fetchPriority="high"`
 *   は付けない（hero LCP の preload と帯域競合させない・Next.js 16 公式推奨）
 * - SVG は unoptimized（ベクターのため最適化不要・公式推奨）
 * - ロゴ読み込み失敗時は `onError` でテキストにフォールバック
 * - alt はサイト名（WebAIM: リンク化されたロゴは会社名を alt に）
 */

import { useState, type ReactElement } from "react";
import { preconnect } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import type { SiteBrand as SiteBrandValue } from "@/shared/domain/settings/queries/display";

type BrandVariant = "header" | "footer";

interface SiteBrandProps {
  readonly brand: SiteBrandValue;
  readonly variant: BrandVariant;
  readonly onNavigate?: () => void;
}

/**
 * ロゴ高さ = タップ標的の床に揃え画像とクリック領域を 1:1 にする。
 *
 * - mobile 44px = WCAG 2.2 SC 2.5.5 (AAA) ＋ Apple HIG nav bar の規定値
 * - desktop 48px = Material 3 top app bar (64dp) の leading slot
 *
 * 画像が標的より小さい従来実装は視認性を犠牲にしていた（雑誌的余白志向）。
 * `<Link>` 側の `min-h-11` と一致するため、ヘッダー総高は据え置き〜+4px に収まる。
 */
const LOGO_HEIGHT_CLASS = "h-11 md:h-12";

/**
 * Next.js Image の `width` は aspect ratio 推論にのみ使われ、
 * 実レンダーサイズは CSS で制御（`style={{ width: "auto" }}`）。
 * 240:64 は横長ロゴの一般的なアスペクト比（3.75:1）を仮定。
 * 実ロゴの縦横比は `object-contain` で吸収され、高さ制約が視覚的に効く。
 */
const LOGO_INTRINSIC_WIDTH = 240;
const LOGO_INTRINSIC_HEIGHT = 64;

const BRAND_TEXT_CLASS =
  "font-heading whitespace-nowrap text-xl font-light italic tracking-[0.08em] text-foreground";

function isSvg(url: string): boolean {
  return url.toLowerCase().endsWith(".svg");
}

export function SiteBrand({
  brand,
  variant,
  onNavigate,
}: SiteBrandProps): ReactElement {
  const [hasError, setHasError] = useState(false);

  const shouldShowLogo = brand.useLogo && brand.logoUrl !== null && !hasError;

  // SVG ロゴは next/image の最適化を経由せずブラウザが直接 R2 オリジンから取得する
  // (`unoptimized={isSvg(...)}`)。header variant は `loading="eager"` で初期表示に
  // 出るため preconnect で TCP+TLS を先行確立し LCP を改善する。footer variant は
  // lazy load なので不要。crossOrigin は付けない (`<img>` の no-cors fetch とマッチ)。
  if (
    shouldShowLogo &&
    brand.logoUrl &&
    variant === "header" &&
    isSvg(brand.logoUrl)
  ) {
    try {
      preconnect(new URL(brand.logoUrl).origin);
    } catch {
      // URL parse 失敗時は no-op
    }
  }

  const navigateProps = onNavigate ? { onClick: onNavigate } : {};

  return (
    <Link
      href="/"
      aria-label={`${brand.siteName} — ホームへ戻る`}
      className="inline-flex min-h-11 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      {...navigateProps}
    >
      {shouldShowLogo && brand.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt={brand.siteName}
          width={LOGO_INTRINSIC_WIDTH}
          height={LOGO_INTRINSIC_HEIGHT}
          loading={variant === "header" ? "eager" : "lazy"}
          unoptimized={isSvg(brand.logoUrl)}
          onError={() => setHasError(true)}
          className={cn("w-auto object-contain", LOGO_HEIGHT_CLASS)}
          sizes="(max-width: 768px) 200px, 240px"
        />
      ) : (
        <span className={BRAND_TEXT_CLASS}>{brand.siteName}</span>
      )}
    </Link>
  );
}
