/**
 * /llms.txt — LLM-friendly site overview (llmstxt.org 公式 spec 準拠)
 *
 * LLM / AI クローラ向けのサイト概要。元は Lighthouse "Agentic Browsing"
 * category の `llms-txt` audit を通すために足したが、**その job は 2026-08-26 に
 * 廃止した**。route を残すのは llmstxt.org の spec 自体が生きていて、
 * クローラに読ませる価値が Lighthouse とは独立にあるため。
 * **自動で形式を検証するものはもう無い**ので、spec に沿っているかは
 * 下の要求事項を読んで手で守る。
 * 公式 spec (https://llmstxt.org/) は以下を要求:
 *   1. H1 タイトル（必須）
 *   2. > blockquote の短い要約（任意・1 段）
 *   3. 0 個以上の汎用 markdown セクション
 *   4. 0 個以上の H2 リンクリスト（`[name](url): note` 形式）
 *   - `## Optional` は spec 特殊指定: 最小コンテキストを欲する LLM が安全に無視できる二次リンク
 *
 * Cache-Control はあえて Response に書かない。next.config.ts headers() の
 * blanket `/:path*` が `public, max-age=0, must-revalidate, s-maxage=3600,
 * stale-while-revalidate=3600` を上書きするため (precedence: proxy.ts >
 * next.config > Route Handler / project_cloudflare-cdn-cache-control-2026-06-17 参照)。
 *
 * `export const dynamic` は cacheComponents 有効下では非互換のため使用不可。
 * Cloudflare エッジが s-maxage=3600 で吸収する。getSeoSettings / feature modules は
 * 'use cache' のため `await connection()` で build prerender 汚染を避ける。
 *
 * Feature OFF の publicRoutes は一覧から除外する（sitemap / nav と同パターン）。
 * `/feed.xml` は posts ON のときだけ列挙（getFeedAlternates と整合）。
 */
import { connection } from "next/server";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedSystemPageSlugs } from "@/shared/domain/sitemap/queries";
import {
  getSeoSettings,
  resolveSiteBranding,
} from "@/public/lib/seo/metadata-factory";
import {
  getFeatureFilterContext,
  isFeatureEnabled,
  isUrlDisabled,
} from "@/shared/domain/features/check";

interface LlmsLink {
  readonly path: string;
  readonly name: string;
  readonly note: string;
}

/**
 * 主要ページのリンク。**全部が公開状態の対象（監査 A-40）。**
 *
 * 以前は `/` と `/about` を無条件に出し、残りも feature フラグ（`isUrlDisabled`）だけで
 * 絞っていた。システムページを非公開にすると実ページは
 * `requireSystemPagePublished` で 404 になるのに、llms.txt だけがリンクを残していた。
 * sitemap と同じ `getPublishedSystemPageSlugs()` を SSoT にする。
 */
const MAIN_LINKS: readonly (LlmsLink & { readonly slug: string })[] = [
  { path: "/", slug: "home", name: "トップ", note: "サイトの入口・主要案内" },
  {
    path: "/about",
    slug: "about",
    name: "サイト概要",
    note: "運営者・コンセプト",
  },
  {
    path: "/spaces",
    slug: "spaces",
    name: "スペース一覧",
    note: "利用可能なレンタルスペース",
  },
  {
    path: "/events",
    slug: "events",
    name: "イベント一覧",
    note: "開催予定・過去イベント",
  },
  { path: "/blog", slug: "blog", name: "ブログ", note: "お知らせ・コラム" },
  {
    path: "/news",
    slug: "news",
    name: "お知らせ",
    note: "重要なお知らせ・告知",
  },
  {
    path: "/faq",
    slug: "faq",
    name: "よくある質問",
    note: "FAQ・利用案内",
  },
  {
    path: "/access",
    slug: "access",
    name: "アクセス",
    note: "所在地・交通案内",
  },
  {
    path: "/contact",
    slug: "contact",
    name: "お問い合わせ",
    note: "問い合わせフォーム",
  },
  {
    path: "/reservation",
    slug: "reservation",
    name: "ご予約",
    note: "オンライン予約フォーム",
  },
];

function formatLink(baseUrl: string, link: LlmsLink): string {
  return `- [${link.name}](${baseUrl}${link.path}): ${link.note}`;
}

export async function GET(): Promise<Response> {
  await connection();
  const [seoSettings, featureCtx, feedEnabled, publishedSlugs] =
    await Promise.all([
      getSeoSettings(),
      getFeatureFilterContext(),
      isFeatureEnabled("posts"),
      getPublishedSystemPageSlugs(),
    ]);
  const { siteName, description } = resolveSiteBranding(seoSettings);
  const baseUrl = getBaseUrl();
  const { disabledRoutes } = featureCtx;

  const mainLinks = MAIN_LINKS.filter(
    (link) =>
      !isUrlDisabled(link.path, disabledRoutes) &&
      publishedSlugs.has(link.slug),
  );

  const machineReadableLinks: LlmsLink[] = [
    {
      path: "/sitemap.xml",
      name: "サイトマップ",
      note: "全 URL の機械可読カタログ (XML Sitemap)",
    },
    ...(feedEnabled
      ? [
          {
            path: "/feed.xml",
            name: "RSS フィード",
            note: "ブログの最新記事フィード",
          } satisfies LlmsLink,
        ]
      : []),
    {
      path: "/robots.txt",
      name: "robots.txt",
      note: "クローラ設定",
    },
  ];

  const body = `# ${siteName}

> ${description}

このサイトはレンタルスペースの予約・問い合わせを提供するウェブサイトです。利用者は空室確認・オンライン予約・イベント情報の閲覧・お問い合わせを行えます。

## 主要ページ

${mainLinks.map((link) => formatLink(baseUrl, link)).join("\n")}

## 機械可読リソース

${machineReadableLinks.map((link) => formatLink(baseUrl, link)).join("\n")}

## Optional
${
  publishedSlugs.has("terms")
    ? `
- [利用規約](${baseUrl}/terms): 利用規約・プライバシーポリシー`
    : ""
}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
