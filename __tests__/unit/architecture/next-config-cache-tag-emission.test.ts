/**
 * `next.config.ts` の `headers()` が出す `Cache-Tag` / `Cache-Control` 契約を固定する。
 *
 * - 公開 per-collection ソース (`/blog/:path*`, `/spaces/:path*` 等) には `SITE_WIDE_CDN_TAGS`
 *   全量が inline されている (`headers()` は last-match-wins で REPLACE のため、省略すると
 *   site-wide purge がそのコレクションに届かない)
 * - `/` と `/about` は `home-marketing-v1` タグを含む
 * - `PRIVATE_NO_TAG_PREFIXES` (`/admin`, `/mypage` 等 PII paths) は Cache-Tag を **絶対**
 *   emit しない (代わりに `Cache-Control: private, no-store`)
 * - blanket `/:path*` は `Cache-Control` のみで `Cache-Tag` は emit しない
 *   (private match が同 tag を継承しない設計)
 * - `/sitemap.xml` は SITEMAP tag exclusive & 単一 source entry (last-match-wins 上書き bug 防止)
 *
 * 2490 行あった `architecture-boundaries.test.ts` の末尾 3 describe を per-concern に
 * 分離した際にここに切り出した。
 */

import { describe, expect, test } from "bun:test";

import nextConfig from "../../../next.config";
import {
  SITE_WIDE_CDN_TAGS,
  PRIVATE_NO_TAG_PREFIXES,
} from "@/shared/lib/constants/cdn-cache-tags";

type HeaderEntry = { key: string; value: string };
type SourceEntry = { source: string; headers: HeaderEntry[] };

async function getHeaders(): Promise<SourceEntry[]> {
  // next.config.ts exports default the config object; headers() is an async fn.
  return (await nextConfig.headers?.()) ?? [];
}

function expectSourceEntry(
  headers: SourceEntry[],
  source: string,
): SourceEntry {
  const entry = headers.find((h) => h.source === source);
  expect(entry, source).toBeDefined();
  if (entry === undefined) {
    throw new Error(`${source} header entry must exist`);
  }
  return entry;
}

function expectHeader(
  entry: SourceEntry,
  key: string,
  message?: string,
): HeaderEntry {
  const header = entry.headers.find((h) => h.key === key);
  expect(header, message).toBeDefined();
  if (header === undefined) {
    throw new Error(message ?? `${entry.source} must have ${key}`);
  }
  return header;
}

describe("next.config Cache-Tag emission contract", () => {
  test("headers() returns at least one source entry", async () => {
    const headers = await getHeaders();
    expect(headers.length).toBeGreaterThan(0);
  });

  test("every per-public-collection Cache-Tag value contains the full site-wide set", async () => {
    const headers = await getHeaders();
    const publicCollections = [
      "/blog/:path*",
      "/category/:path*",
      "/tag/:path*",
      "/spaces/:path*",
      "/news/:path*",
      "/events/:path*",
      "/faq/:path*",
      "/terms/:path*",
    ];
    for (const source of publicCollections) {
      const entry = expectSourceEntry(headers, source);
      const tagHeader = expectHeader(
        entry,
        "Cache-Tag",
        `${source} must have Cache-Tag`,
      );
      const tags = tagHeader.value.split(",");
      for (const siteWide of SITE_WIDE_CDN_TAGS) {
        expect(tags, `${source} missing site-wide tag ${siteWide}`).toContain(
          siteWide,
        );
      }
    }
  });

  test("home (/) and /about emit home-marketing-v1 in their Cache-Tag value", async () => {
    const headers = await getHeaders();
    for (const source of ["/", "/about"]) {
      const entry = expectSourceEntry(headers, source);
      const tagHeader = expectHeader(entry, "Cache-Tag");
      expect(tagHeader.value.split(",")).toContain("home-marketing-v1");
    }
  });

  test("private blocklist sources NEVER emit Cache-Tag", async () => {
    const headers = await getHeaders();
    for (const prefix of PRIVATE_NO_TAG_PREFIXES) {
      const source = `${prefix}/:path*`;
      const entry = expectSourceEntry(headers, source);
      const tagHeader = entry.headers.find((h) => h.key === "Cache-Tag");
      expect(
        tagHeader,
        `${source} must NOT have Cache-Tag (PII path)`,
      ).toBeUndefined();
      const ccHeader = entry.headers.find((h) => h.key === "Cache-Control");
      expect(ccHeader?.value).toBe("private, no-store");
    }
  });

  test("blanket /:path* emits Cache-Control only (no Cache-Tag) so private match-wins inherits no tag", async () => {
    const headers = await getHeaders();
    const blanket = expectSourceEntry(headers, "/:path*");
    const tag = blanket.headers.find((h) => h.key === "Cache-Tag");
    expect(tag).toBeUndefined();
    const cc = blanket.headers.find((h) => h.key === "Cache-Control");
    // canonical: public, max-age=0, must-revalidate, s-maxage=..., stale-while-revalidate=...
    expect(cc?.value).toMatch(/^public, max-age=0, must-revalidate, s-maxage=/);
  });

  test("/sitemap.xml emits SITEMAP Cache-Tag only (purge target for site-wide co-purge)", async () => {
    const headers = await getHeaders();
    const entry = expectSourceEntry(headers, "/sitemap.xml");
    const tag = entry.headers.find((h) => h.key === "Cache-Tag");
    expect(tag?.value).toBe("sitemap-v1");
    // Cache-Control inherited from blanket public (no per-source override).
    const cc = entry.headers.find((h) => h.key === "Cache-Control");
    expect(cc).toBeUndefined();
  });

  test("/sitemap.xml SITEMAP tag is NOT in any other public source (site-wide invalidation must only purge sitemap)", async () => {
    const headers = await getHeaders();
    const SITEMAP_TAG = "sitemap-v1";
    for (const entry of headers) {
      if (entry.source === "/sitemap.xml") continue;
      const tag = entry.headers.find((h) => h.key === "Cache-Tag");
      if (!tag) continue;
      expect(
        tag.value.split(","),
        `${entry.source} must NOT contain SITEMAP tag`,
      ).not.toContain(SITEMAP_TAG);
    }
  });

  test("/sitemap.xml source appears exactly once (Next.js headers() は last-match-wins、複数 source は Cache-Tag を上書きする)", async () => {
    const headers = await getHeaders();
    const sitemapSources = headers.filter((h) => h.source === "/sitemap.xml");
    expect(
      sitemapSources,
      "/sitemap.xml は exactly 1 つの source entry のみ持つこと（複製で SITEMAP tag 上書き bug 防止）",
    ).toHaveLength(1);
  });
});
