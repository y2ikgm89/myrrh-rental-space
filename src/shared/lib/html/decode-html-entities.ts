const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * HTML エンティティをデコードする（OGP 取り込み・見出し抽出向けの最小実装）。
 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#\d+|\w+);/g,
    (entity, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const codePoint = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (body.startsWith("#")) {
        const codePoint = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return NAMED_ENTITIES[body] ?? entity;
    },
  );
}
