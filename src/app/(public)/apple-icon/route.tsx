/**
 * Dynamic Apple Touch Icon Route Handler — DB driven favicon pass-through
 *
 * 公開 layout の `generateMetadata` から `icons: { apple: "/apple-icon" }` で静的注入される。
 * Route Handler 内で DB から Settings.faviconUrl を取得し、R2 オブジェクトの binary を
 * pass-through で返す。DB が空、または upstream fetch 失敗時は ImageResponse で default
 * fallback (`/icon` と統一感のある "M" デザイン、180×180) を返す。
 *
 * @see src/app/icon/route.tsx
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/route
 */

import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getFaviconUrl } from "@/shared/domain/settings/queries/display";
import { fetchPublicHttpResource } from "@/shared/lib/ssrf-guard";

const CACHE_HEADERS = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
};

const FALLBACK_SIZE = { width: 180, height: 180 } as const;

function renderFallbackIcon(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #fafafa 0%, #f0ece4 100%)",
        fontFamily: "serif",
      }}
    >
      <div
        style={{
          fontSize: 112,
          fontWeight: 700,
          color: "#8c7a5e",
          letterSpacing: "0.05em",
        }}
      >
        M
      </div>
    </div>,
    {
      ...FALLBACK_SIZE,
      headers: CACHE_HEADERS,
    },
  );
}

export async function GET(): Promise<Response> {
  await connection();

  const faviconUrl = await getFaviconUrl();

  if (!faviconUrl) {
    return renderFallbackIcon();
  }

  try {
    const upstream = await fetchPublicHttpResource(faviconUrl);
    if (!upstream.ok || !upstream.body) {
      return renderFallbackIcon();
    }

    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        ...CACHE_HEADERS,
      },
    });
  } catch {
    return renderFallbackIcon();
  }
}
