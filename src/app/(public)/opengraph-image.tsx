/**
 * デフォルト Open Graph 画像 — 動的生成（next/og）
 *
 * 公開ページのうち、generateMetadata で `openGraph.images` を明示しない
 * 全ルートの og:image / twitter:image フォールバックとして使用される。
 * これにより、OGP 画像未設定のページを SNS / LINE / Slack 共有しても
 * 画像なしプレビューにならない（業界標準のブランド既定 OG カード）。
 *
 * デザイン: Luxury White × Bronze ブランド（apple-icon / icon-192 と同系統）。
 * 日本語グリフは next/og 既定フォントで tofu 化するため、ラテン文字のみで構成する。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

import { ImageResponse } from "next/og";
import { SITE_DEFAULTS } from "@/shared/lib/constants";

// 1200x630 — Open Graph / Twitter summary_large_image 標準サイズ
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export const alt = SITE_DEFAULTS.name;

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #fafafa 0%, #f0ece4 100%)",
        fontFamily: "serif",
      }}
    >
      {/* eyebrow */}
      <div
        style={{
          fontFamily: "sans-serif",
          fontSize: 26,
          letterSpacing: 14,
          color: "#8c7a5e",
          marginBottom: 32,
        }}
      >
        RENTAL SPACE
      </div>

      {/* site name */}
      <div
        style={{
          display: "flex",
          fontSize: 104,
          fontWeight: 600,
          color: "#2b2620",
          letterSpacing: 2,
          lineHeight: 1.05,
          textAlign: "center",
          maxWidth: 1000,
        }}
      >
        {SITE_DEFAULTS.name}
      </div>

      {/* bronze hairline (Kinfolk editorial accent) */}
      <div
        style={{
          width: 80,
          height: 2,
          background: "#8c7a5e",
          marginTop: 40,
        }}
      />
    </div>,
    { ...size },
  );
}
