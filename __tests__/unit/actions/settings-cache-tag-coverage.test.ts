/**
 * settings save actions must invalidate every cache tag whose 'use cache'
 * producer selects any of the columns the action writes.
 *
 * # 背景
 *
 * Settings の各 field は複数の 'use cache' producer に読まれる。例:
 *   - siteName は LAYOUT_SETTINGS / SEO_SETTINGS / ORGANIZATION_SETTINGS /
 *     BUSINESS_SETTINGS の 4 producer で select される
 *   - businessName は ORGANIZATION_SETTINGS / BUSINESS_SETTINGS の 2 producer で select
 *   - googleSearchConsoleId は ANALYTICS_CONFIG producer で select
 *
 * `updateBasicInfo` が LAYOUT_SETTINGS のみを invalidate すると、SEO / ORG /
 * BUSINESS 系公開 producer が数時間〜数日 stale で返り続ける (Round-3 audit
 * Findings #5 high / #13 medium / #22 low)。
 *
 * # gate
 *
 * 各 settings update action の body 内に、その action が書く列を read する
 * 全 producer の cacheTag が invalidate 対象として現れることを regex で確認
 * する。Function body の抽出は AST ではなく `export async function <name>...`
 * から次の '}' 対応までを scan する。
 *
 * # SSoT
 *
 * `SETTINGS_COLUMN_TAGS`: column → tags reverse index。queries/*.ts の
 * 'use cache' producer を audit した結果を静的に宣言している。producer に
 * 新規列 / 新規 tag が加わったら、そのタイミングでこの map も更新する
 * (git grep で `SETTINGS_COLUMN_TAGS` を検索 → PR で同時修正)。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { definite } from "../../support/definite";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

/**
 * Settings 列 → その列を select する 'use cache' producer の cacheTag(s).
 *
 * 網羅対象は現在 settings actions で update している列に限る (Cluster C
 * Round-3 audit の verified findings スコープ)。新規列を update する action
 * を追加したら、この map と該当 test entry を同時に拡張すること。
 */
const SETTINGS_COLUMN_TAGS: Record<string, readonly string[]> = {
  // Layout / branding
  siteName: [
    "LAYOUT_SETTINGS",
    "SEO_SETTINGS",
    "ORGANIZATION_SETTINGS",
    "BUSINESS_SETTINGS",
  ],
  siteDescription: [
    "SEO_SETTINGS",
    "ORGANIZATION_SETTINGS",
    "BUSINESS_SETTINGS",
  ],
  defaultOgpImageUrl: ["SEO_SETTINGS"],
  faviconUrl: ["LAYOUT_SETTINGS"],
  headerLogoUrl: ["LAYOUT_SETTINGS", "ORGANIZATION_SETTINGS"],
  footerLogoUrl: ["LAYOUT_SETTINGS"],
  footerCopyright: ["LAYOUT_SETTINGS"],
  useHeaderLogo: ["LAYOUT_SETTINGS", "ORGANIZATION_SETTINGS"],
  useFooterLogo: ["LAYOUT_SETTINGS"],

  // Business identity
  businessName: ["ORGANIZATION_SETTINGS", "BUSINESS_SETTINGS"],
  businessNameKana: ["ORGANIZATION_SETTINGS", "BUSINESS_SETTINGS"],
  representativeName: ["BUSINESS_SETTINGS"],
  establishedDate: ["ORGANIZATION_SETTINGS", "BUSINESS_SETTINGS"],
  registrationNumber: ["BUSINESS_SETTINGS"],
  invoiceNumber: ["BUSINESS_SETTINGS"],
  businessDescription: ["ORGANIZATION_SETTINGS", "BUSINESS_SETTINGS"],

  // Analytics / search verification
  googleSearchConsoleId: ["ANALYTICS_CONFIG"],
  bingWebmasterToolsId: ["ANALYTICS_CONFIG"],

  // Business hours
  businessHours: ["ORGANIZATION_SETTINGS", "BUSINESS_SETTINGS"],
};

type ActionSpec = {
  name: string;
  file: string;
  writes: readonly string[];
};

const ACTIONS: ActionSpec[] = [
  {
    name: "updateBasicInfo",
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/basic.ts",
    writes: [
      "siteName",
      "siteDescription",
      "faviconUrl",
      "defaultOgpImageUrl",
      "headerLogoUrl",
      "footerLogoUrl",
      "footerCopyright",
      "useHeaderLogo",
      "useFooterLogo",
    ],
  },
  {
    name: "updateBusinessInfo",
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/business.ts",
    writes: [
      "businessName",
      "businessNameKana",
      "representativeName",
      "establishedDate",
      "registrationNumber",
      "invoiceNumber",
      "businessDescription",
    ],
  },
  {
    name: "updateBusinessHoursSettings",
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/business.ts",
    writes: ["businessHours"],
  },
  {
    name: "updateSearchVerification",
    file: "src/app/(admin)/admin/(dashboard)/_shared/actions/settings/basic.ts",
    writes: ["googleSearchConsoleId", "bingWebmasterToolsId"],
  },
];

function extractFunctionBody(source: string, name: string): string | null {
  const declRegex = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(`);
  const declMatch = declRegex.exec(source);
  if (!declMatch) return null;

  let i = declMatch.index + declMatch[0].length;
  let paren = 1;
  while (i < source.length && paren > 0) {
    const ch = source[i];
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    i++;
  }
  while (i < source.length && source[i] !== "{") i++;
  if (source[i] !== "{") return null;
  let brace = 1;
  const bodyStart = i + 1;
  i++;
  while (i < source.length && brace > 0) {
    const ch = source[i];
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    i++;
  }
  if (brace !== 0) return null;
  return source.slice(bodyStart, i - 1);
}

describe("settings update actions cover every backing cache tag", () => {
  for (const spec of ACTIONS) {
    const requiredTags = new Set<string>();
    for (const col of spec.writes) {
      const tags = SETTINGS_COLUMN_TAGS[col];
      if (!tags) {
        throw new Error(
          `SETTINGS_COLUMN_TAGS missing entry for column '${col}' referenced by ${spec.name}`,
        );
      }
      for (const t of tags) requiredTags.add(t);
    }

    test(`${spec.name} invalidates: ${[...requiredTags].sort().join(", ")}`, () => {
      const abs = resolve(REPO_ROOT, spec.file);
      expect(existsSync(abs)).toBe(true);
      const source = readFileSync(abs, "utf8");
      const body = extractFunctionBody(source, spec.name);
      expect(body).not.toBeNull();

      const missing: string[] = [];
      for (const tag of requiredTags) {
        if (!definite(body, "action の本文").includes(`CACHE_TAGS.${tag}`)) {
          missing.push(tag);
        }
      }
      if (missing.length > 0) {
        throw new Error(
          `${spec.name} in ${spec.file} must invalidate CACHE_TAGS.${missing.join(", CACHE_TAGS.")}. ` +
            `These tags are backing columns this action writes; skipping them leaves public 'use cache' producers stale.`,
        );
      }
      expect(missing).toEqual([]);
    });
  }
});
