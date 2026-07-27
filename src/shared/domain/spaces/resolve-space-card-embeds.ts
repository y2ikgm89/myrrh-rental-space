import "server-only";

import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  resolveSpaceCardEmbedData,
  type SpaceCardEmbedData,
} from "@/shared/domain/spaces/public-queries";
import { getPublicTaxSettings } from "@/shared/domain/settings/queries/tax";
import { formatUnitPriceWithTax } from "@/shared/lib/pricing/format";
import { getTaxRate } from "@/shared/lib/pricing/tax";
import { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";

/**
 * Lexical 本文中のスペースカード埋め込みプレースホルダーを公開描画時に解決する SSoT。
 *
 * `SpaceCardNode.exportDOM()` が出力する
 * `<a data-space-card-embed data-space-id data-space-name href="#"></a>` を抽出し、
 * DB から最新の写真/料金/定員を解決してリッチカードへ差し替える。参照先が削除/非公開/
 * spaces Feature Module OFF なら placeholder ごと除去する（404 カードを防ぐ）。
 *
 * `resolveInternalLinkCards` と同じく regex ベースの純粋 HTML 後処理として実装する。
 * 税率は既存の公開 SpaceCard コンポーネント（`(public)/_components/space-list/space-card.tsx`）
 * と同じ簡略化で `TaxRateType.standard` 固定（`Space.taxRateType` による分岐はしない）。
 */

const PLACEHOLDER_RE = /<a\b[^>]*\bdata-space-card-embed\b[^>]*>\s*<\/a>/gi;

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

function renderSpaceCardHtml(
  card: SpaceCardEmbedData,
  priceLabel: string,
): string {
  const detailHref = escapeHtml(`/spaces/${card.slug}`);
  const reserveHref = escapeHtml(`/reservation?spaceId=${card.id}`);
  const name = escapeHtml(card.name);
  const image = escapeHtml(card.mainImageUrl);
  const meta = escapeHtml(`${card.capacity}名 ・ ${priceLabel}`);

  return (
    `<div data-space-card-embed-resolved="true">` +
    `<a data-space-card-embed-image href="${detailHref}"><img src="${image}" alt="" loading="lazy" /></a>` +
    `<div data-space-card-embed-body>` +
    `<a data-space-card-embed-title href="${detailHref}"><h4>${name}</h4></a>` +
    `<p data-space-card-embed-meta>${meta}</p>` +
    `<a data-space-card-embed-cta href="${reserveHref}">予約する</a>` +
    `</div>` +
    `</div>`
  );
}

export async function resolveSpaceCardEmbeds(html: string): Promise<string> {
  if (!html || !html.includes("data-space-card-embed")) return html;

  try {
    const ids = new Set<string>();
    for (const match of html.matchAll(PLACEHOLDER_RE)) {
      const id = extractAttr(match[0], "data-space-id");
      if (id) ids.add(id);
    }

    if (ids.size === 0) {
      return html.replace(PLACEHOLDER_RE, "");
    }

    const [resolved, tax] = await Promise.all([
      resolveSpaceCardEmbedData(Array.from(ids)),
      getPublicTaxSettings(),
    ]);
    const taxRate = getTaxRate(TaxRateType.standard, tax);

    return html.replace(PLACEHOLDER_RE, (tag) => {
      const id = extractAttr(tag, "data-space-id");
      if (!id) return "";
      const card = resolved.get(id);
      if (!card) return "";
      const priceLabel = formatUnitPriceWithTax(
        card.hourlyPrice,
        taxRate,
        tax.displayModePublic,
        "/h",
      );
      return renderSpaceCardHtml(card, priceLabel);
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "resolveSpaceCardEmbeds" },
    });
    return html.replace(PLACEHOLDER_RE, "");
  }
}
