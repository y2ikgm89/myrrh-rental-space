/**
 * Dynamic Icon Route Handler — DB driven favicon
 *
 * 公開 layout の `generateMetadata` から `icons: { icon: "/icon" }` で静的注入される。
 * Route Handler 内で DB から Settings.faviconUrl を取得し、R2 オブジェクトの binary を
 * pass-through で返す。DB が空、または upstream fetch 失敗時は ImageResponse で default
 * fallback (apple-icon と統一感のある "M" デザイン) を返す。
 *
 * 設計上の重要事項:
 * - `await connection()` で runtime 動的化を保証（rule .claude/rules/db-and-domain.md §6）。
 *   `getFaviconUrl()` は `'use cache' + safeFetch` 構造のため、connection() なしだと
 *   build prerender で placeholder DATABASE_URL での fallback null が永続 baking される。
 * - `generateMetadata` 経由ではなく Route Handler で DB を扱うため、PR #699 が懸念した
 *   metadata layer の build-time bake 不確実性は物理的に発生しない。
 * - Cache-Control は public + 1h max-age + 1d SWR。LAYOUT_SETTINGS タグの revalidate と
 *   組み合わせて、admin 保存後はソフト再検証 + edge HIT のキャッシュ整合を担保する。
 * - upstream content-type は R2 の Object Metadata 経由で渡される (PNG/SVG/ICO 等)。
 *   pass-through で正しい MIME を返却するため、ブラウザの favicon parser に SVG/ICO の
 *   多形式が透過に届く。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/route
 */

import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getFaviconUrl } from "@/shared/domain/settings/queries/display";
import { fetchPublicHttpResource } from "@/shared/lib/ssrf-guard";

const CACHE_HEADERS = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
};

const FALLBACK_SIZE = { width: 64, height: 64 } as const;

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
          fontSize: 40,
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
