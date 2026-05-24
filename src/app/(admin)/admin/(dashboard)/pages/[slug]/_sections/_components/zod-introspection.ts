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
 * ZodDefault / ZodOptional / ZodPrefault 等のラッパーを再帰的にアンラップする。
 *
 * `createImageGroupSchema` / `createMediaGroupSchema` 等の `z.object(...).prefault({}).register(...)`
 * factory パターンは `_zod.def.type === "prefault"` で wrap されるため、明示的に unwrap しないと
 * AutoGroupField の sub-shape introspection が undefined を返して sub-fields が描画されない silent bug。
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

  // ZodPrefault → innerType（`createMediaGroupSchema` / `createImageGroupSchema` 等で必須）
  if (type === "prefault" && isZodType(def["innerType"])) {
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
 * registry に直接登録されていない場合は ZodDefault / ZodOptional / ZodPrefault を
 * アンラップして探索する。
 *
 * Note: Zod 4 の natural chain パターン（`.max().default().register()`）では
 * register が ZodDefault に attach されるため direct lookup が通るが、nested
 * ZodOptional / ZodPrefault 経由でアクセスされる場合（`createMediaGroupSchema` 等の
 * `z.object(...).prefault({}).register(...)` factory が attach 先）に備えて unwrap
 * フォールバックを持つ。
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

  // ZodPrefault → check innerType
  if (type === "prefault" && isZodType(def["innerType"])) {
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
 * ZodArray の min / max 制約を取得する。
 *
 * `field.array({ min, max })` で登録された制約は `_zod.def.checks` 配列に
 * `{ _zod: { def: { check: "min_length" | "max_length", value: number } } }`
 * として格納される。
 */
export interface ArrayConstraints {
  readonly min?: number;
  readonly max?: number;
}

export function getArrayConstraints(schema: z.ZodType): ArrayConstraints {
  const def = getZodDef(schema);
  if (!def) return {};

  const type = def["type"];

  // ZodDefault → innerType
  if (type === "default" && isZodType(def["innerType"])) {
    return getArrayConstraints(def["innerType"]);
  }

  // ZodArray → checks 配列を walk
  if (type === "array") {
    const checks = def["checks"];
    if (!Array.isArray(checks)) return {};

    let min: number | undefined;
    let max: number | undefined;

    for (const check of checks) {
      if (!isRecord(check)) continue;
      // ZodCheck は ZodType と同じく `_zod.def` を持つ（型は異なるが構造は共通）
      const zodMeta = check["_zod"];
      if (!isRecord(zodMeta)) continue;
      const checkDef = zodMeta["def"];
      if (!isRecord(checkDef)) continue;
      const kind = checkDef["check"];
      // Zod 4: min_length は `minimum`、max_length は `maximum` キーで値を持つ
      if (kind === "min_length" && typeof checkDef["minimum"] === "number") {
        min = checkDef["minimum"];
      } else if (
        kind === "max_length" &&
        typeof checkDef["maximum"] === "number"
      ) {
        max = checkDef["maximum"];
      }
    }

    return {
      ...(min !== undefined && { min }),
      ...(max !== undefined && { max }),
    };
  }

  return {};
}

// ─────────────────────────────────────────────────────────────
// Discriminated Union 対応
// ─────────────────────────────────────────────────────────────

/**
 * Zod 4 の `z.discriminatedUnion()` 情報。
 *
 * `_zod.def`:
 *  - `type: "union"`
 *  - `discriminator: string` （例: "variant"）
 *  - `options: ZodObject[]` （各 variant schema）
 *  - `inclusive: true`
 *
 * 各 option の `.shape[discriminator]` は `z.literal(...)` で `_zod.def.values: [literalValue]`。
 */
export interface DiscriminatedUnionInfo {
  readonly discriminator: string;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly schema: z.ZodType & { shape: Record<string, z.ZodType> };
  }>;
  readonly meta: FieldMeta | undefined;
}

/**
 * ZodDiscriminatedUnion を判定して discriminator + options を抽出する。
 * ZodDefault / ZodOptional でラップされていても unwrap して再帰探索する。
 */
export function extractDiscriminatedUnionInfo(
  schema: z.ZodType,
): DiscriminatedUnionInfo | undefined {
  const def = getZodDef(schema);
  if (!def) return undefined;

  const type = def["type"];

  // ZodDefault → unwrap
  if (type === "default" && isZodType(def["innerType"])) {
    return extractDiscriminatedUnionInfo(def["innerType"]);
  }

  // ZodOptional → unwrap
  if (type === "optional" && isZodType(def["innerType"])) {
    return extractDiscriminatedUnionInfo(def["innerType"]);
  }

  // discriminated union: type === "union" + discriminator が string
  if (type !== "union") return undefined;
  const discriminator = def["discriminator"];
  if (typeof discriminator !== "string") return undefined;

  const rawOptions = def["options"];
  if (!Array.isArray(rawOptions)) return undefined;

  const options: DiscriminatedUnionInfo["options"][number][] = [];
  for (const option of rawOptions) {
    if (!isZodType(option) || !hasShape(option)) continue;
    const literalSchema = option.shape[discriminator];
    if (!literalSchema) continue;
    const literalDef = getZodDef(literalSchema);
    if (!literalDef || literalDef["type"] !== "literal") continue;
    const values = literalDef["values"];
    if (!Array.isArray(values) || typeof values[0] !== "string") continue;
    options.push({ value: values[0], schema: option });
  }

  if (options.length === 0) return undefined;

  return {
    discriminator,
    options,
    meta: fieldRegistry.get(schema),
  };
}

/**
 * ZodObject の shape からフィールド情報を抽出する。
 * FieldMeta のないフィールドはスキップする。
 *
 * Discriminated union の場合は `currentValues[discriminator]` で active variant を選び、
 * `[discriminator field, ...activeVariantFields]` を結合返却する。discriminator field の
 * meta は registry に登録された FieldMeta を使い、options は各 variant の literal 値から
 * 動的に合成する（zod-introspection 内で `getSelectOptions` が enum schema を期待する形に
 * `z.enum()` を合成して渡す）。
 *
 * @param schema  - section の configSchema
 * @param currentValues - RHF の current form values（discriminator 値の解決に使用）
 */
export function extractSchemaFields(
  schema: z.ZodType,
  currentValues?: Record<string, unknown>,
): FieldInfo[] {
  // Discriminated union の場合は専用処理
  const duInfo = extractDiscriminatedUnionInfo(schema);
  if (duInfo) {
    return extractDiscriminatedUnionFields(duInfo, currentValues);
  }

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

/**
 * Discriminated union のフィールドを抽出する。
 * `[discriminator field, ...activeVariantFields]` を返す。
 * active variant 内の discriminator field（z.literal）は重複描画を避けるため除外する。
 */
function extractDiscriminatedUnionFields(
  duInfo: DiscriminatedUnionInfo,
  currentValues: Record<string, unknown> | undefined,
): FieldInfo[] {
  const { discriminator, options, meta } = duInfo;

  // discriminator field の current value を解決（無効値は先頭 option にフォールバック）
  const rawCurrent = currentValues?.[discriminator];
  const validValues = new Set(options.map((o) => o.value));
  const firstOption = options[0];
  if (!firstOption) return [];
  const currentValue =
    typeof rawCurrent === "string" && validValues.has(rawCurrent)
      ? rawCurrent
      : firstOption.value;

  // Active variant schema
  const activeOption =
    options.find((o) => o.value === currentValue) ?? firstOption;

  // Discriminator field を select として synthesize
  // `z.enum(values)` を作って AutoSelectField の getSelectOptions が options を取得できるようにする
  const valueTuple = options.map((o) => o.value);
  const [head, ...rest] = valueTuple;
  if (head === undefined) return [];
  const discriminatorSchema = z.enum([head, ...rest]);
  const discriminatorMeta: FieldMeta = meta ?? {
    fieldType: "select",
    label: discriminator,
    group: "content",
    subGroup: "other",
  };
  const discriminatorField: FieldInfo = {
    key: discriminator,
    schema: discriminatorSchema,
    meta: discriminatorMeta,
  };

  // Active variant の他フィールド（discriminator 自身を除外）
  const variantFields: FieldInfo[] = [];
  for (const [key, fieldSchema] of Object.entries(activeOption.schema.shape)) {
    if (key === discriminator) continue;
    const fieldMeta = extractFieldMetaDeep(fieldSchema);
    if (fieldMeta) {
      variantFields.push({ key, schema: fieldSchema, meta: fieldMeta });
    }
  }

  return [discriminatorField, ...variantFields];
}
