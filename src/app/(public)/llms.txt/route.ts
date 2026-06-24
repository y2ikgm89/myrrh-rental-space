/**
 * /llms.txt — LLM-friendly site overview (llmstxt.org 公式 spec 準拠)
 *
 * Lighthouse "Agentic Browsing" category の `llms-txt` audit 通過用。
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
 * Cloudflare エッジが s-maxage=3600 で吸収し、リクエスト毎のハンドラ実行コストは無視できる
 * (純粋な文字列生成のみで DB / I/O なし)。
 */
import { getBaseUrl, SITE_DEFAULTS } from "@/shared/lib/constants";

export function GET(): Response {
  const baseUrl = getBaseUrl();

  const body = `# ${SITE_DEFAULTS.name}

> ${SITE_DEFAULTS.description}

このサイトはレンタルスペースの予約・問い合わせを提供するウェブサイトです。利用者は空室確認・オンライン予約・イベント情報の閲覧・お問い合わせを行えます。

## 主要ページ

- [トップ](${baseUrl}/): サイトの入口・主要案内
- [サイト概要](${baseUrl}/about): 運営者・コンセプト
- [スペース一覧](${baseUrl}/spaces): 利用可能なレンタルスペース
- [イベント一覧](${baseUrl}/events): 開催予定・過去イベント
- [ブログ](${baseUrl}/blog): お知らせ・コラム
- [お知らせ](${baseUrl}/news): 重要なお知らせ・告知
- [よくある質問](${baseUrl}/faq): FAQ・利用案内
- [アクセス](${baseUrl}/access): 所在地・交通案内
- [お問い合わせ](${baseUrl}/contact): 問い合わせフォーム
- [ご予約](${baseUrl}/reservation): オンライン予約フォーム

## 機械可読リソース

- [サイトマップ](${baseUrl}/sitemap.xml): 全 URL の機械可読カタログ (XML Sitemap)
- [RSS フィード](${baseUrl}/feed.xml): ブログの最新記事フィード
- [robots.txt](${baseUrl}/robots.txt): クローラ設定

## Optional

- [利用規約](${baseUrl}/terms): 利用規約・プライバシーポリシー
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
