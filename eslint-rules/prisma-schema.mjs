/**
 * `prisma/schema.prisma` から一意制約を読み出す共有ヘルパー。
 *
 * ESLint rule と、その rule のテストの両方から使う。制約の SSoT は schema なので、
 * ルール側に列名の表を持たない（表を持つと schema 変更で静かに空振りする）。
 *
 * @see eslint-rules/seed-respects-unique-constraints.mjs
 */

import { readFileSync } from "node:fs";

/** `@@unique([...], where: { ... })` の述語。field → 宣言値のテキスト。 */
/** @typedef {{ fields: string[], predicate: Map<string, string> | null }} UniqueGroup */

/** 空白を潰して比較可能な形にする（`{ not: null }` と `{not:null}` を同一視）。 */
export function normalizeExpression(text) {
  return text.replace(/\s+/gu, " ").trim();
}

/** `model X { ... }` を名前 → 本文で返す。 */
function modelBodies(source) {
  const bodies = new Map();
  for (const model of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gmu)) {
    bodies.set(String(model[1]), String(model[2]));
  }
  return bodies;
}

/**
 * `@@unique(...)` の引数から `where: { ... }` を取り出す。
 *
 * ネストを数えて対応する `}` まで辿る。正規表現の `[^}]*` では
 * `where: { a: { b: 1 } }` を取りこぼす。
 */
function readPredicate(args) {
  const start = args.search(/where:\s*\{/u);
  if (start === -1) return null;

  const open = args.indexOf("{", start);
  let depth = 1;
  let index = open + 1;
  while (index < args.length && depth > 0) {
    if (args[index] === "{") depth++;
    else if (args[index] === "}") depth--;
    if (depth === 0) break;
    index++;
  }

  const body = args.slice(open + 1, index);
  const predicate = new Map();
  let entryDepth = 0;
  let current = "";
  const entries = [];
  for (const char of body) {
    if (char === "{" || char === "[" || char === "(") entryDepth++;
    if (char === "}" || char === "]" || char === ")") entryDepth--;
    if (char === "," && entryDepth === 0) {
      entries.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  entries.push(current);

  for (const entry of entries) {
    const match = /^\s*(\w+)\s*:\s*([\s\S]+)$/u.exec(entry);
    if (match?.[1]) {
      predicate.set(match[1], normalizeExpression(String(match[2])));
    }
  }
  return predicate.size > 0 ? predicate : null;
}

/**
 * model → 一意グループの一覧。
 *
 * **グループ単位で返すのが要点。** 列を平らな集合にすると
 * 「`@@unique([eventId, sortOrder])` の sortOrder は eventId と対で一意」という
 * 対応関係が消え、削除がどの範囲を空にしたのかを判定できなくなる。
 */
export function readUniqueGroups(schemaPath) {
  const source = readFileSync(schemaPath, "utf8");
  /** @type {Map<string, UniqueGroup[]>} */
  const byModel = new Map();

  for (const [model, body] of modelBodies(source)) {
    /** @type {UniqueGroup[]} */
    const groups = [];

    for (const compound of body.matchAll(/@@unique\(\[([^\]]+)\]([^)]*)\)/gu)) {
      groups.push({
        fields: String(compound[1])
          .split(",")
          .map((field) => field.trim())
          .filter((field) => field.length > 0),
        predicate: readPredicate(String(compound[2] ?? "")),
      });
    }

    for (const line of body.split("\n")) {
      const single = /^\s+(\w+)\s+\S+.*@unique/u.exec(line);
      if (single?.[1]) {
        groups.push({ fields: [single[1]], predicate: null });
      }
    }

    if (groups.length > 0) byModel.set(model, groups);
  }

  return byModel;
}

/** Prisma client のプロパティ名（`eventTicket`）→ model 名（`EventTicket`）。 */
export function readModelsByClientProperty(schemaPath) {
  const source = readFileSync(schemaPath, "utf8");
  const byProperty = new Map();
  for (const model of modelBodies(source).keys()) {
    byProperty.set(model.charAt(0).toLowerCase() + model.slice(1), model);
  }
  return byProperty;
}
