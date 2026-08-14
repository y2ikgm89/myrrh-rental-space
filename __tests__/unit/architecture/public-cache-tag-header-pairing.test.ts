/**
 * public の `cacheTag(...)` producer と `next.config.ts` の Cache-Tag ヘッダを
 * 突き合わせる。
 *
 * ## なぜ
 *
 * `cacheTag()` と `headers()` は独立した 2 つの SSoT で、対応を見る gate が
 * 無かった。producer だけタグを足して header を忘れると、origin の Data Cache
 * は無効化されても Cloudflare edge は古い応答を返し続ける。
 *
 * 実測で 3 件この穴から漏れた:
 * - F-18: /access とカスタムページに Cache-Tag が無く、site-wide purge が届かない
 * - F-73: event detail の source が広すぎて Cache-Tag が付かない slug があった
 * - F-88: `cacheTag(EVENTS, LOCATIONS, SPACES)` なのに /events は EVENT だけ emit
 *
 * 既存の `next-config-cache-tag-emission.test.ts` は SITE_WIDE_CDN_TAGS の
 * inline と PRIVATE_NO_TAG_PREFIXES だけを見る。producer 側は範囲外。
 *
 * ## 何を見るか
 *
 * `src/shared/domain` の `cacheTag(CACHE_TAGS.*)` を読む（page.tsx は見ない）。
 * 各呼出のタグを CDN tag に写し、**1 つの** header source がその全量を含むか
 * を見る。含む source が 1 つも無い呼出を違反とする。
 *
 * 証明しないこと: page → producer の到達、header source の path 正規表現が
 * 実際の URL にマッチするか（F-73 の lookahead は静的には見きれない）。
 *
 * ## 直し方
 *
 * 新しい public producer に `cacheTag(CACHE_TAGS.X, …)` を足したら、
 * `next.config.ts` の `headers()` にその path の Cache-Tag を足す。
 * per-collection source は last-match-wins で REPLACE するので、
 * `joinWithSiteWide([...])` で SITE_WIDE 全量を inline すること。
 * CDN に出さないタグは `NEXTJS_TAGS_WITHOUT_CDN_MAPPING` へ（理由を隣に書く）。
 */

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isCallExpression,
  isIdentifier,
  isPropertyAccessExpression,
  type Node,
} from "typescript";

import nextConfig from "../../../next.config";
import { collectSourceFiles } from "../../helpers/architecture-fs";
import { CACHE_TAGS } from "@/shared/lib/constants/cache";
import {
  CDN_CACHE_TAGS,
  resolveCdnTag,
} from "@/shared/lib/constants/cdn-cache-tags";

const ROOT = process.cwd();
const DOMAIN_ROOT = join(ROOT, "src", "shared", "domain");

export type HeaderSource = {
  readonly source: string;
  readonly cacheTags: readonly string[];
};

export type ProducerCall = {
  readonly file: string;
  readonly cacheTagKeys: readonly string[];
};

export type UnpairedCall = {
  readonly file: string;
  readonly cacheTagKeys: readonly string[];
  readonly cdnTags: readonly string[];
};

/** `CACHE_TAGS.X` を CDN tag へ写す。写像の無いタグと admin-only は除く。 */
export function toPublicCdnTags(cacheTagKeys: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of cacheTagKeys) {
    if (!Object.hasOwn(CACHE_TAGS, key)) continue;
    const value = CACHE_TAGS[key as keyof typeof CACHE_TAGS];
    if (typeof value !== "string") continue;
    const cdn = resolveCdnTag(value);
    if (cdn === null) continue;
    if (cdn === CDN_CACHE_TAGS.INTEGRATION_SETTINGS) continue;
    if (!out.includes(cdn)) out.push(cdn);
  }
  return out;
}

/**
 * producer の cacheTag 呼出と header が対応しないものを返す。
 *
 * 1 呼出の CDN tag 全量が、どれか 1 つの source の Cache-Tag に含まれていれば
 * 対応あり。header 側が空、または一部のタグしか無い（F-88）と違反。
 */
export function findUnpairedPublicCacheTagCalls(
  calls: readonly ProducerCall[],
  headers: readonly HeaderSource[],
): UnpairedCall[] {
  const unpaired: UnpairedCall[] = [];
  for (const call of calls) {
    const cdnTags = toPublicCdnTags(call.cacheTagKeys);
    if (cdnTags.length === 0) continue;
    const paired = headers.some((header) =>
      cdnTags.every((tag) => header.cacheTags.includes(tag)),
    );
    if (!paired) {
      unpaired.push({
        file: call.file,
        cacheTagKeys: call.cacheTagKeys,
        cdnTags,
      });
    }
  }
  return unpaired;
}

/** `cacheTag(CACHE_TAGS.X, …)` のプロパティ名を呼出ごとに返す。 */
export function extractCacheTagKeys(source: string): string[][] {
  if (!source.includes("cacheTag")) return [];

  const file = createSourceFile(
    "fixture.ts",
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  );
  const calls: string[][] = [];

  const walk = (node: Node): void => {
    if (
      isCallExpression(node) &&
      isIdentifier(node.expression) &&
      node.expression.text === "cacheTag"
    ) {
      const keys: string[] = [];
      for (const arg of node.arguments) {
        if (
          isPropertyAccessExpression(arg) &&
          isIdentifier(arg.expression) &&
          arg.expression.text === "CACHE_TAGS" &&
          isIdentifier(arg.name)
        ) {
          keys.push(arg.name.text);
        }
      }
      if (keys.length > 0) calls.push(keys);
    }
    forEachChild(node, walk);
  };
  forEachChild(file, walk);
  return calls;
}

function producerFiles(): string[] {
  return collectSourceFiles(DOMAIN_ROOT).filter((file) =>
    readFileSync(file, "utf8").includes("cacheTag"),
  );
}

function collectProducerCalls(): ProducerCall[] {
  const calls: ProducerCall[] = [];
  for (const file of producerFiles()) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    for (const cacheTagKeys of extractCacheTagKeys(
      readFileSync(file, "utf8"),
    )) {
      calls.push({ file: rel, cacheTagKeys });
    }
  }
  return calls;
}

async function readHeaderSources(): Promise<HeaderSource[]> {
  const entries = (await nextConfig.headers?.()) ?? [];
  return entries.map((entry) => ({
    source: entry.source,
    cacheTags: (
      entry.headers.find((header) => header.key === "Cache-Tag")?.value ?? ""
    )
      .split(",")
      .filter((tag) => tag.length > 0),
  }));
}

const F88_KEYS = ["EVENTS", "LOCATIONS", "SPACES"] as const;

describe("public cacheTag producers pair with CDN headers", () => {
  test("判定の見本: producer だけの呼出は違反（header が無い）", () => {
    const unpaired = findUnpairedPublicCacheTagCalls(
      [{ file: "fixture/producer-only.ts", cacheTagKeys: F88_KEYS }],
      [],
    );
    expect(unpaired.length).toBeGreaterThan(0);
    expect(unpaired[0]?.cdnTags).toEqual([
      "event-v1",
      "location-v1",
      "space-v1",
    ]);
  });

  test("判定の見本: header が primary だけだと違反（F-88 の形）", () => {
    const unpaired = findUnpairedPublicCacheTagCalls(
      [{ file: "fixture/events-producer.ts", cacheTagKeys: F88_KEYS }],
      [{ source: "/events", cacheTags: ["event-v1"] }],
    );
    expect(unpaired.length).toBeGreaterThan(0);
  });

  test("判定の見本: producer と header が揃えば違反ではない", () => {
    const unpaired = findUnpairedPublicCacheTagCalls(
      [{ file: "fixture/both-sides.ts", cacheTagKeys: F88_KEYS }],
      [
        {
          source: "/events",
          cacheTags: ["event-v1", "location-v1", "space-v1"],
        },
      ],
    );
    expect(unpaired).toEqual([]);
  });

  test("走査規模の下限と、本番 producer が header と対応している", async () => {
    const files = producerFiles();
    expect(files.length).toBeGreaterThan(20);

    const calls = collectProducerCalls();
    const publicCalls = calls.filter(
      (call) => toPublicCdnTags(call.cacheTagKeys).length > 0,
    );
    expect(publicCalls.length).toBeGreaterThan(30);

    const headers = await readHeaderSources();
    const taggedHeaders = headers.filter((h) => h.cacheTags.length > 0);
    expect(taggedHeaders.length).toBeGreaterThan(8);

    const unpaired = findUnpairedPublicCacheTagCalls(publicCalls, headers);
    expect(
      unpaired.map(
        (call) =>
          `${call.file}: cacheTag(${call.cacheTagKeys.join(", ")}) → missing a header that emits ${call.cdnTags.join(",")}. next.config.ts の headers() にその path の Cache-Tag を足すこと（per-collection は joinWithSiteWide で SITE_WIDE 全量を inline）`,
      ),
    ).toEqual([]);
  });
});
