/**
 * サイト共通の動的 OG / Twitter カード画像（next/og）
 */

import { ImageResponse } from "next/og";

export const DEFAULT_OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

export const DEFAULT_OG_IMAGE_CONTENT_TYPE = "image/png";

const OG_IMAGE_CACHE_HEADERS = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
} as const;

export function createDefaultBrandOgImageResponse(
  siteName: string,
): ImageResponse {
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
        {siteName}
      </div>
      <div
        style={{
          width: 80,
          height: 2,
          background: "#8c7a5e",
          marginTop: 40,
        }}
      />
    </div>,
    {
      ...DEFAULT_OG_IMAGE_SIZE,
      headers: OG_IMAGE_CACHE_HEADERS,
    },
  );
}
