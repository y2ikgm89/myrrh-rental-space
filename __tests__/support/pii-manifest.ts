/**
 * `schema.prisma` 上の `/// @pii-model` / `/// @pii` を読む。
 *
 * Prisma の DMMF / generated client に `documentation` は無い（実測）。
 * 宣言の SSoT はテキストなので、ここもテキストで parse する。
 *
 * doc 行は `/^\s*\/\/\/(.*)$/u`。素の `//` は積まない。
 * 空行や非 doc 行でバッファを切る（間に空行を挟むと帰属が切れる）。
 *
 * `columns` は `@pii-model holds` の model に付いた `@pii` だけ。
 * holds を外すと列が母集合から落ち、`columns.length > 40` が赤になる。
 */

import { readPrismaSchema } from "./prisma-sources";

export interface PiiManifestModel {
  readonly name: string;
  readonly table: string;
  readonly mode: string;
}

export interface PiiManifestColumn {
  readonly model: string;
  readonly table: string;
  readonly field: string;
  readonly column: string;
  readonly strategy: string;
}

export interface PiiManifest {
  readonly models: readonly PiiManifestModel[];
  readonly columns: readonly PiiManifestColumn[];
}

const DOC_LINE = /^\s*\/\/\/(.*)$/u;
const MODEL_OPEN = /^\s*model\s+(\w+)\s*\{/u;
const MODEL_MAP = /^\s*@@map\("([^"]+)"\)/u;
const FIELD_DECL = /^\s*(\w+)\s+(\w+)/u;
const FIELD_MAP = /@map\("([^"]+)"\)/u;
const PII_MODEL = /^@pii-model\s+(\S.*)$/u;
const PII_COLUMN = /^@pii\s+(\S.*)$/u;

function snakeCase(name: string): string {
  return name.replaceAll(/(?<!^)(?=[A-Z])/gu, "_").toLowerCase();
}

function lastTag(docs: readonly string[], pattern: RegExp): string | null {
  let found: string | null = null;
  for (const doc of docs) {
    const match = pattern.exec(doc.trim());
    if (match?.[1]) found = match[1].trim();
  }
  return found;
}

export function readPiiManifest(source?: string): PiiManifest {
  const text = source ?? readPrismaSchema();
  const models: PiiManifestModel[] = [];
  const tagged: {
    model: string;
    field: string;
    column: string;
    strategy: string;
  }[] = [];

  let docs: string[] = [];
  let model: string | null = null;
  let table = "";
  const tableOf = new Map<string, string>();

  for (const raw of text.split(/\r?\n/u)) {
    const doc = DOC_LINE.exec(raw);
    if (doc) {
      docs.push(doc[1] ?? "");
      continue;
    }

    const stripped = raw.replace(/\/\/.*$/u, "");
    const open = MODEL_OPEN.exec(stripped);
    if (open?.[1]) {
      model = open[1];
      table = model;
      const mode = lastTag(docs, PII_MODEL);
      if (mode) {
        models.push({ name: model, table, mode });
      }
      docs = [];
      continue;
    }

    if (model && /^\s*\}/u.test(stripped)) {
      tableOf.set(model, table);
      model = null;
      table = "";
      docs = [];
      continue;
    }

    if (model) {
      const mappedTable = MODEL_MAP.exec(stripped);
      if (mappedTable?.[1]) {
        table = mappedTable[1];
        docs = [];
        continue;
      }

      const field = FIELD_DECL.exec(stripped);
      if (field?.[1] && field[2] && !field[1].startsWith("@@")) {
        const strategy = lastTag(docs, PII_COLUMN);
        if (strategy) {
          const column = FIELD_MAP.exec(stripped)?.[1] ?? snakeCase(field[1]);
          tagged.push({
            model,
            field: field[1],
            column,
            strategy,
          });
        }
        docs = [];
        continue;
      }
    }

    docs = [];
  }

  const modelsWithTables = models.map((entry) => ({
    ...entry,
    table: tableOf.get(entry.name) ?? entry.table,
  }));
  const holds = new Set(
    modelsWithTables
      .filter((entry) => entry.mode === "holds")
      .map((entry) => entry.name),
  );

  const columns: PiiManifestColumn[] = tagged
    .filter((entry) => holds.has(entry.model))
    .map((entry) => ({
      ...entry,
      table: tableOf.get(entry.model) ?? entry.model,
    }));

  return { models: modelsWithTables, columns };
}
