import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

const USAGE_LABEL_CAP = 5;

/**
 * `LIKE` のメタ文字を無効化する。R2 の URL には `_`（ファイル名）や `%`
 * （percent-encoding）が普通に現れるので、素で埋めると別のメディアに一致して
 * 削除できなくなる。エスケープ文字自体を先に処理する順序が必須。
 */
function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

type JsonUsageRow = {
  readonly kind: string;
  readonly label: string | null;
};

/**
 * JSONB 列に URL が埋まっている行を引く。
 *
 * **Prisma の `string_contains` はこれらの列では使えない。** JSONB 列に対して
 * 生成される SQL は
 * `col::text LIKE '%…%' AND JSONB_TYPEOF(col) = 'string'` で、対象 9 列すべてに
 * `jsonb_typeof(col) = 'object' | 'array'` の CHECK があるため第 2 項が恒偽になる
 * （`prisma/baseline/invariants.sql`。実測: 該当する CHECK は 9 列すべてに存在）。
 * データの都合ではなく **DB がその形を強制しているので絶対に当たらない**。
 *
 * path 指定（`{ path: [...], string_contains }`）でも救えない。URL は variant や
 * エディタの構造に応じて任意の深さに埋まる（`config.images[].url` /
 * `gallery[].url` / Lexical ノード木の中など）ため、位置を固定できない。
 * `array_contains` も不可 — gallery の要素は文字列ではなくオブジェクト
 * （`galleryItemSchema`）なので、URL 単体では包含にならない。
 *
 * したがって JSON 全体を text 化した部分一致で見る。取りこぼすと
 * `deleteMediaCommand` が R2 の実体ごとハード削除し、Cloudflare R2 には
 * オブジェクトバージョニングが無いため**復旧できない**。精度より
 * 「見落とさないこと」を優先する（偽陽性は「削除を断る」に倒れるだけ）。
 */
async function findJsonColumnUsages(url: string): Promise<JsonUsageRow[]> {
  const pattern = `%${escapeLikePattern(url)}%`;

  return prisma.$queryRaw<JsonUsageRow[]>`
    (SELECT 'post' AS kind, slug AS label FROM posts
      WHERE content_json::text LIKE ${pattern} ESCAPE '\\' LIMIT 1)
    UNION ALL
    (SELECT 'news', slug FROM news
      WHERE content_json::text LIKE ${pattern} ESCAPE '\\' LIMIT 1)
    UNION ALL
    (SELECT 'space', name FROM spaces
      WHERE description_json::text LIKE ${pattern} ESCAPE '\\'
         OR gallery::text LIKE ${pattern} ESCAPE '\\' LIMIT 1)
    UNION ALL
    (SELECT 'event', title FROM events
      WHERE deleted_at IS NULL
        AND (description_json::text LIKE ${pattern} ESCAPE '\\'
             OR gallery::text LIKE ${pattern} ESCAPE '\\') LIMIT 1)
    UNION ALL
    (SELECT 'section', NULL FROM sections
      WHERE config::text LIKE ${pattern} ESCAPE '\\' LIMIT 1)
    UNION ALL
    (SELECT 'terms', slug FROM terms_documents
      WHERE deleted_at IS NULL AND content_json::text LIKE ${pattern} ESCAPE '\\' LIMIT 1)
    UNION ALL
    (SELECT 'location', name FROM locations
      WHERE image_urls::text LIKE ${pattern} ESCAPE '\\' LIMIT 1)
  `;
}

/**
 * メディア URL の参照先を人間可読ラベルで返す（最大 5 件）。
 *
 * 文字列列は exact match、HTML 列は `contains`、**JSONB 列は
 * {@link findJsonColumnUsages} の生 SQL** で走査する（Prisma の `string_contains`
 * が恒偽になる理由はそちらの JSDoc）。
 *
 * MediaPicker 経由で URL が入りうる公開面をカバーする（Location / Page OGP /
 * taxonomy OGP / Lexical JSON 正本を含む）。
 */
export async function findMediaUrlUsages(url: string): Promise<string[]> {
  if (url.length === 0) return [];

  const [
    postExact,
    postContent,
    newsExact,
    newsContent,
    spaceExact,
    spaceContent,
    eventExact,
    eventContent,
    seo,
    terms,
    location,
    page,
    postCategory,
    postTag,
    jsonUsages,
  ] = await Promise.all([
    prisma.post.findFirst({
      where: {
        OR: [{ thumbnailUrl: url }, { ogpImageUrl: url }],
      },
      select: { slug: true },
    }),
    prisma.post.findFirst({
      where: { contentHtml: { contains: url } },
      select: { slug: true },
    }),
    prisma.news.findFirst({
      where: { ogpImageUrl: url },
      select: { slug: true },
    }),
    prisma.news.findFirst({
      where: { contentHtml: { contains: url } },
      select: { slug: true },
    }),
    prisma.space.findFirst({
      where: {
        OR: [{ mainImageUrl: url }, { ogpImageUrl: url }],
      },
      select: { name: true },
    }),
    prisma.space.findFirst({
      where: { descriptionHtml: { contains: url } },
      select: { name: true },
    }),
    prisma.event.findFirst({
      where: {
        deletedAt: null,
        OR: [{ thumbnailUrl: url }, { ogpImageUrl: url }],
      },
      select: { title: true },
    }),
    prisma.event.findFirst({
      where: { deletedAt: null, descriptionHtml: { contains: url } },
      select: { title: true },
    }),
    prisma.settingsSeo.findFirst({
      where: {
        OR: [
          { headerLogoUrl: url },
          { footerLogoUrl: url },
          { faviconUrl: url },
          { defaultOgpImageUrl: url },
        ],
      },
      select: { id: true },
    }),
    prisma.termsDocument.findFirst({
      where: { deletedAt: null, contentHtml: { contains: url } },
      select: { slug: true },
    }),
    prisma.location.findFirst({
      where: { imageUrl: url },
      select: { name: true },
    }),
    prisma.page.findFirst({
      where: { ogpImageUrl: url },
      select: { slug: true },
    }),
    prisma.postCategory.findFirst({
      where: { ogpImageUrl: url },
      select: { slug: true },
    }),
    prisma.postTag.findFirst({
      where: { ogpImageUrl: url },
      select: { slug: true },
    }),
    findJsonColumnUsages(url),
  ]);

  const labels: string[] = [];
  const add = (label: string | null | undefined, prefix: string): void => {
    if (label === null || label === undefined) return;
    const rendered = prefix.length > 0 ? `${prefix}: ${label}` : label;
    if (labels.length >= USAGE_LABEL_CAP) return;
    if (!labels.includes(rendered)) {
      labels.push(rendered);
    }
  };
  // 同一ラベルは `add` が弾くので、exact / HTML / JSON の 3 経路が同じ行を
  // 指してもラベルは 1 つにまとまる。
  const json = new Map(jsonUsages.map((row) => [row.kind, row.label]));

  add(postExact?.slug, "投稿");
  add(postContent?.slug, "投稿");
  add(json.get("post"), "投稿");
  add(newsExact?.slug, "お知らせ");
  add(newsContent?.slug, "お知らせ");
  add(json.get("news"), "お知らせ");
  add(spaceExact?.name, "スペース");
  add(spaceContent?.name, "スペース");
  add(json.get("space"), "スペース");
  add(eventExact?.title, "イベント");
  add(eventContent?.title, "イベント");
  add(json.get("event"), "イベント");
  // sections は識別子を出さない（どのページのどのセクションかは URL から辿れる）。
  // label 列が NULL なので `has` で見る。
  if (json.has("section")) add("セクション", "");
  if (seo) add("サイト設定 (SEO)", "");
  add(terms?.slug, "規約");
  add(json.get("terms"), "規約");
  add(location?.name, "会場");
  add(json.get("location"), "会場");
  add(page?.slug, "ページ OGP");
  add(postCategory?.slug, "投稿カテゴリ");
  add(postTag?.slug, "投稿タグ");

  return labels.slice(0, USAGE_LABEL_CAP);
}

export async function assertMediaUrlNotInUse(url: string): Promise<void> {
  const usages = await findMediaUrlUsages(url);
  if (usages.length === 0) return;

  const summary = usages.join("、");
  throw new DomainError(
    `このメディアは使用中のため削除できません（${summary}）`,
    "CONFLICT",
  );
}
