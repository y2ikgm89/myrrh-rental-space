/**
 * Zod 4 スキーマ introspection ヘルパー
 *
 * Zod 内部構造（_zod.def）にアクセスするため `isRecord()` 型ガードで
 * ランタイム安全にプロパティを読み取る（`as` アサーション不使用）。
 */

import { z } from "zod";
import { fieldRegistry } from "@/shared/lib/sections/field-registry";
import { isRecord } from "@/shared/lib/serialize";
import type { FieldMeta } from "@/shared/lib/sections/field-registry";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface FieldInfo {
  readonly key: string;
  readonly schema: z.ZodType;
  /**
   * `meta` は `FieldMeta` 全体を含み、`subGroup`（text / image / button / other）も
   * そのまま透過する。AutoSectionForm が `meta.subGroup` で content フィールドを
   * 分類して FieldGroupSection で見出し付き表示する。
   */
  readonly meta: FieldMeta;
}

export interface ArrayItemFieldInfo {
  readonly key: string;
  readonly schema: z.ZodType;
  readonly meta: FieldMeta | undefined;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Zod スキーマから ZodObject の shape を取得する。
 * ZodDefault, ZodPipe 等のラッパーを再帰的にアンラップする。
 */
export function getZodObjectShape(
  schema: z.ZodType,
): Record<string, z.ZodType> | undefined {
  // Direct object — has .shape
  if (hasShape(schema)) {
    return schema.shape;
  }

  const def = getZodDef(schema);
  if (!def) return undefined;

  const type = def["type"];

  // ZodDefault → innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return getZodObjectShape(def["innerType"]);
  }

  // ZodOptional → innerType
  if (type === "optional" && isZodType(def["innerType"])) {
    return getZodObjectShape(def["innerType"]);
  }

  return undefined;
}

/**
 * unknown 値が z.ZodType っぽいかどうかを判定する。
 * _zod プロパティと description プロパティの存在で判定する。
 */
export function isZodType(value: unknown): value is z.ZodType {
  if (typeof value !== "object" || value === null) return false;
  // Zod 4 のスキーマは _zod プロパティを持つ
  return "_zod" in value;
}

/**
 * Zod スキーマの _zod.def を安全に取得する。
 */
export function getZodDef(
  schema: z.ZodType,
): Record<string, unknown> | undefined {
  const raw: unknown = schema;
  if (!isRecord(raw)) return undefined;
  const zod: unknown = raw["_zod"];
  if (!isRecord(zod)) return undefined;
  const def: unknown = zod["def"];
  if (!isRecord(def)) return undefined;
  return def;
}

/**
 * ZodObject の shape プロパティがあるか型安全にチェック。
 */
export function hasShape(
  schema: z.ZodType,
): schema is z.ZodType & { shape: Record<string, z.ZodType> } {
  const raw: unknown = schema;
  if (!isRecord(raw)) return false;
  const shape: unknown = raw["shape"];
  return typeof shape === "object" && shape !== null;
}

/**
 * FieldMeta を抽出する。
 * registry に直接登録されていない場合は ZodDefault / ZodOptional をアンラップして探索する。
 *
 * Note: Zod 4 の natural chain パターン（`.max().default().register()`）では
 * register が ZodDefault に attach されるため direct lookup が通るが、nested
 * ZodOptional 経由でアクセスされる場合に備えて unwrap フォールバックを持つ。
 */
export function extractFieldMetaDeep(schema: z.ZodType): FieldMeta | undefined {
  // Direct registry lookup
  const meta = fieldRegistry.get(schema);
  if (meta) return meta;

  const def = getZodDef(schema);
  if (!def) return undefined;

  const type = def["type"];

  // ZodDefault → check innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return extractFieldMetaDeep(def["innerType"]);
  }

  // ZodOptional → check innerType
  if (type === "optional" && isZodType(def["innerType"])) {
    return extractFieldMetaDeep(def["innerType"]);
  }

  return undefined;
}

/**
 * ZodDefault/ZodOptional をアンラップして select フィールドの enum 値を取得する。
 */
export function getSelectOptions(schema: z.ZodType): string[] {
  const def = getZodDef(schema);
  if (!def) return [];

  const type = def["type"];

  // ZodEnum → entries
  if (type === "enum") {
    const entries = def["entries"];
    if (typeof entries === "object" && entries !== null) {
      return Object.keys(entries);
    }
    return [];
  }

  // ZodDefault → innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return getSelectOptions(def["innerType"]);
  }

  // ZodOptional → innerType
  if (type === "optional" && isZodType(def["innerType"])) {
    return getSelectOptions(def["innerType"]);
  }

  return [];
}

/**
 * ZodDefault/ZodArray から配列要素の ZodObject shape を取得する。
 */
export function getArrayItemShape(
  schema: z.ZodType,
): Record<string, z.ZodType> | undefined {
  const def = getZodDef(schema);
  if (!def) return undefined;

  const type = def["type"];

  // ZodArray → element
  if (type === "array") {
    const element = def["element"];
    if (isZodType(element) && hasShape(element)) {
      return element.shape;
    }
    return undefined;
  }

  // ZodDefault → innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return getArrayItemShape(def["innerType"]);
  }

  return undefined;
}

/**
 * ZodObject の shape からフィールド情報を抽出する。
 * FieldMeta のないフィールドはスキップする。
 */
export function extractSchemaFields(schema: z.ZodType): FieldInfo[] {
  const shape = getZodObjectShape(schema);
  if (!shape) return [];

  const fields: FieldInfo[] = [];
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const meta = extractFieldMetaDeep(fieldSchema);
    if (meta) {
      fields.push({ key, schema: fieldSchema, meta });
    }
  }
  return fields;
}
