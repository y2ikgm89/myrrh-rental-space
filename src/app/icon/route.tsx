/**
 * Dynamic Icon Route Handler — DB driven favicon
 *
 * 公開 layout の `generateMetadata` から `icons: { icon: "/icon" }` で静的注入される。
 * Route Handler 内で DB から Settings.faviconUrl を取得し、R2 オブジェクトの binary を
 * pass-through で返す。DB が空、または upstream fetch 失敗時は ImageResponse で default
 * fallback (apple-icon と統一感のある "M" デザイン) を返す。
 *
 * 設計上の重要事項:
 * - `await connection()` で runtime 動的化を保証（build prerender の焼き込み防止）。
 *   `getFaviconUrl()` は `'use cache' + safeFetch` 構造のため、connection() なしだと
 *   build prerender で placeholder DATABASE_URL での fallback null が永続 baking される。
 * - `generateMetadata` 経由ではなく Route Handler で DB を扱うため、PR #699 が懸念した
 *   metadata layer の build-time bake 不確実性は物理的に発生しない。
 * - Cache-Control は public + 1h max-age + 1d SWR。LAYOUT_SETTINGS タグの revalidate と
 *   組み合わせて、admin 保存後はソフト再検証 + edge HIT のキャッシュ整合を担保する。
 * - **pass-through は fail-closed**（監査 A-46）。以前は上流の `Content-Type` を
 *   無検査で転送していたので、DB の `faviconUrl` が外部ホストを指していれば
 *   自ドメイン上で `text/html` を配れた。現在は
 *   `fetchManagedImagePassthrough` が「管理メディア origin の https」かつ
 *   「`SUPPORTED_IMAGE_MIME_TYPES` に載る Content-Type」だけを通す
 *   （R2 の object は `uploadFile` が magic-byte で確定した 4 形式しか持ちえない）。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/route
 */

import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getFaviconUrl } from "@/shared/domain/settings/queries/display";
import { fetchManagedImagePassthrough } from "@/shared/lib/media/managed-image-passthrough";

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

  const passthrough = await fetchManagedImagePassthrough(faviconUrl);
  if (passthrough === null) {
    return renderFallbackIcon();
  }

  return new Response(passthrough.body, {
    headers: {
      "content-type": passthrough.contentType,
      ...CACHE_HEADERS,
    },
  });
}
