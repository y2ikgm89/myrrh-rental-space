/**
 * HTML から目次（h2 / h3）を抽出 + heading に anchor id を自動付与する SSoT。
 *
 * GitHub-flavored markdown / rehype-slug / Notion / WordPress / Stripe Docs 等の
 * 業界標準パターンに準拠する。`contentHtml` を canonical SSoT として扱い、
 * Lexical 編集経由のデータ・seed データ・legacy データすべてに対して一貫した
 * 目次生成を行う。
 *
 * ## 仕様
 *
 * - 対象: h2 / h3 のみ（h1 はページタイトル、h4 以下は階層深すぎ）
 * - 既存 `id` 属性（Lexical `CustomHeadingNode.exportDOM` で出力された anchorId 等）は尊重
 * - 既存 id がない見出しは text を slugify して付与
 * - slug 衝突時は `-2`, `-3` で採番
 * - 純粋関数（決定論的）— SSR と Client component（SanitizedHtml）で同一結果
 *
 * ## slugify 仕様（GFM 互換）
 *
 * - 小文字化（ASCII のみ。CJK は影響なし）
 * - 空白文字を `-` に置換
 * - 文字・数字・`_-` 以外を削除（CJK 文字は `\p{L}` で保持される）
 * - 連続ハイフンを 1 つに圧縮
 * - 先頭・末尾のハイフンを除去
 */

export type HeadingEntry = {
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3;
};

const HEADING_RE = /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
const ID_ATTR_RE = /\sid=["']([^"']+)["']/i;
const RESERVED_ID_RE = /<h[23][^>]*\sid=["']([^"']+)["']/gi;

/**
 * テキストを GFM 互換の slug に変換する。
 * CJK 文字（ひらがな・カタカナ・漢字）はそのまま保持される。
 */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type RewriteContext = {
  readonly entries: HeadingEntry[];
  readonly rewrite: (
    match: string,
    level: string,
    attrs: string | undefined,
    inner: string,
  ) => string;
};

function createRewriteContext(html: string): RewriteContext {
  const used = new Set<string>();
  const entries: HeadingEntry[] = [];

  // 既存 id を予約（Lexical 経由データ等で衝突を避ける）
  for (const m of html.matchAll(RESERVED_ID_RE)) {
    if (m[1]) used.add(m[1]);
  }

  const allocateSlug = (base: string): string => {
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let counter = 2;
    let candidate = `${base}-${counter}`;
    while (used.has(candidate)) {
      counter += 1;
      candidate = `${base}-${counter}`;
    }
    used.add(candidate);
    return candidate;
  };

  const rewrite = (
    match: string,
    level: string,
    attrs: string | undefined,
    inner: string,
  ): string => {
    const text = stripTags(inner);
    if (!text) return match;

    const lvl = level === "2" ? 2 : 3;
    const existingId = attrs ? (ID_ATTR_RE.exec(attrs)?.[1] ?? null) : null;

    if (existingId) {
      entries.push({ id: existingId, text, level: lvl });
      return match;
    }

    const baseSlug = slugifyHeading(text);
    if (!baseSlug) return match;

    const id = allocateSlug(baseSlug);
    entries.push({ id, text, level: lvl });
    return `<h${level}${attrs ?? ""} id="${id}">${inner}</h${level}>`;
  };

  return { entries, rewrite };
}

/**
 * HTML 文字列から h2 / h3 見出しを抽出する（ドキュメント順序を保持）。
 *
 * `injectHeadingAnchors` と同じ slugify ロジックを共有するため、
 * Server Component（page.tsx）で抽出した id と Client Component（SanitizedHtml）で
 * inject される id は完全に一致する。
 */
export function extractHeadingsFromHtml(html: string): readonly HeadingEntry[] {
  if (!html) return [];

  const ctx = createRewriteContext(html);
  html.replace(HEADING_RE, ctx.rewrite);
  return ctx.entries;
}

/**
 * HTML 文字列の h2 / h3 に `id` 属性を自動付与する。
 *
 * 既存 id があれば尊重し、ない場合のみ slugify で生成する。
 * `extractHeadingsFromHtml` と同じ slug 採番ロジックを共有するため、
 * 目次のリンク（`#anchorId`）が確実に対応する heading にジャンプする。
 *
 * @param html サニタイズ済みの HTML 文字列
 * @returns id 属性を付与した HTML 文字列
 */
export function injectHeadingAnchors(html: string): string {
  if (!html) return html;

  const ctx = createRewriteContext(html);
  return html.replace(HEADING_RE, ctx.rewrite);
}
