/**
 * Portable Text — client-safe types (zero runtime).
 *
 * Sanity Portable Text 公式仕様の TS 型のみ。Zod schema は `./schema` に分離し、
 * barrel (`./index`) は schema 値を re-export しない。client bundle から portable-text
 * の型を引くときは barrel か `./types` を type-only import すること。Zod schema 値が必要な
 * server / admin client コードは `./schema` を直接 deep-import する。
 *
 * 形状は `./schema` の `z.infer` 出力と 1:1 一致させ、`satisfies z.ZodType<...>` で
 * lockstep を build-time に保証する。
 *
 * 重要 (TypeScript quirk): `interface` ではなく `type` を使う。`interface` は
 * 「将来の宣言マージで他型プロパティが追加されうる」semantics のため `Prisma.InputJsonValue`
 * のような `{[key: string]: ...}` 型に assignable にならない (default-page-sections.ts 等で
 * Prisma の Section config を構築する箇所が破綻する)。`type` 別名は閉じた object shape なので
 * 互換性が保たれる。
 *
 * 業界 reference:
 * - https://portabletext.org/
 * - https://www.sanity.io/docs/block-content
 */

export type SpanTextToken = {
  _key: string;
  _type: "span";
  text: string;
};

export type SpanIconToken = {
  _key: string;
  _type: "iconInline";
  name: string;
};

export type PortableTextSpan = SpanTextToken | SpanIconToken;

export type PortableTextBlock = {
  _key: string;
  _type: "block";
  style: "normal";
  children: PortableTextSpan[];
};
