import "server-only";

import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  isLinkCardContentType,
  type LinkCardContentType,
} from "@/shared/domain/link-cards/content-types";
import {
  resolveLinkCardsByType,
  type ResolvedLinkCard,
} from "@/shared/domain/link-cards/resolve-queries";

/**
 * Lexical 本文中の内部リンクカードプレースホルダーを公開描画時に解決する SSoT。
 *
 * `InternalLinkCardNode.exportDOM()` が出力する
 * `<a data-internal-link-card data-content-type data-content-id href="#"></a>`
 * を抽出し、DB から最新のタイトル / 抜粋 / サムネ / URL を解決してカード本体へ差し替える。
 * 参照先が削除 / 非公開なら placeholder ごと除去する（404 カードを防ぐ）。
 *
 * `extractHeadingsFromHtml` / `injectHeadingAnchors` と同じく **regex ベースの純粋 HTML
 * 後処理**（決定論的）として実装する。公開詳細の Server Component で `contentHtml` を
 * `SanitizedHtml` に渡す直前に通す。
 */

// `<a ... data-internal-link-card ...></a>`（空要素プレースホルダー）
const PLACEHOLDER_RE = /<a\b[^>]*\bdata-internal-link-card\b[^>]*>\s*<\/a>/gi;

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}=["']([^"']*)["']`, "i");
  return re.exec(tag)?.[1] ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLinkCardHtml(card: ResolvedLinkCard): string {
  const href = escapeHtml(card.href);
  const title = escapeHtml(card.title);
  const thumb =
    card.thumbnailUrl != null && card.thumbnailUrl.length > 0
      ? `<span data-internal-link-card-thumb><img src="${escapeHtml(
          card.thumbnailUrl,
        )}" alt="" loading="lazy" /></span>`
      : "";
  const excerpt =
    card.excerpt != null && card.excerpt.length > 0
      ? `<span data-internal-link-card-excerpt>${escapeHtml(card.excerpt)}</span>`
      : "";

  return (
    `<a data-internal-link-card-resolved="true" data-content-type="${card.contentType}" href="${href}">` +
    thumb +
    `<span data-internal-link-card-body>` +
    `<span data-internal-link-card-title>${title}</span>` +
    excerpt +
    `</span>` +
    `</a>`
  );
}

export async function resolveInternalLinkCards(html: string): Promise<string> {
  if (!html || !html.includes("data-internal-link-card")) return html;

  try {
    // 1. プレースホルダーを抽出し種別ごとに id を集約
    const byType = new Map<LinkCardContentType, Set<string>>();
    for (const match of html.matchAll(PLACEHOLDER_RE)) {
      const tag = match[0];
      const typeAttr = extractAttr(tag, "data-content-type");
      const id = extractAttr(tag, "data-content-id");
      if (!id || !typeAttr || !isLinkCardContentType(typeAttr)) continue;
      const set = byType.get(typeAttr) ?? new Set<string>();
      set.add(id);
      byType.set(typeAttr, set);
    }

    if (byType.size === 0) {
      // 種別/id が壊れた placeholder のみ → 全除去
      return html.replace(PLACEHOLDER_RE, "");
    }

    // 2. 種別ごとにバッチ解決
    const resolved = new Map<string, ResolvedLinkCard>();
    await Promise.all(
      Array.from(byType, async ([contentType, idSet]) => {
        const cards = await resolveLinkCardsByType(
          contentType,
          Array.from(idSet),
        );
        for (const [id, card] of cards) {
          resolved.set(`${contentType}:${id}`, card);
        }
      }),
    );

    // 3. placeholder を差し替え（未解決は除去）
    return html.replace(PLACEHOLDER_RE, (tag) => {
      const typeAttr = extractAttr(tag, "data-content-type");
      const id = extractAttr(tag, "data-content-id");
      if (!id || !typeAttr || !isLinkCardContentType(typeAttr)) return "";
      const card = resolved.get(`${typeAttr}:${id}`);
      return card ? renderLinkCardHtml(card) : "";
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "resolveInternalLinkCards" },
    });
    // 解決失敗時は placeholder を除去して本文描画は継続
    return html.replace(PLACEHOLDER_RE, "");
  }
}
