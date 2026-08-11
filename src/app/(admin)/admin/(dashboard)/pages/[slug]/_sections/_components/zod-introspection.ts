/**
 * Zod 4 スキーマ introspection ヘルパー
 *
 * 判別は classic クラスへの `instanceof`、値の取り出しは公開アクセサ
 * （`.shape` / `.unwrap()` / `.element` / `.options` / `.def`）だけで行う。
 *
 * **内部プロパティ `_zod.def` は使わない。** Zod の公式ドキュメントは
 * `_zod` を「Zod 4 のスキーマかどうかを判別する目印」としてしか案内しておらず、
 * その下の構造に安定の約束が無い。`schema.def` は同じオブジェクトを指す公開
 * プロパティで（実測: `schema.def === schema._zod.def`）、しかも型が付く。
 *
 * 例外は配列の min / max だけ。公開アクセサ `ZodArray.minLength` は
 * `z.array(x).min(1)` の後でも `null` を返す（実測）ため使えず、`def.checks` を
 * `z.core.$ZodCheckMinLength` / `$ZodCheckMaxLength` で判別して読む。
 * `zod/v4/core` は library author 向けの公式サブパスで、`z.core` から届く。
 */

import { z } from "zod";
import { fieldRegistry } from "@/shared/lib/sections/field-registry";
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
 * `default` / `optional` / `prefault` を 1 段だけ外す。他は `undefined`（再帰の終端）。
 *
 * `createImageGroupSchema` / `createMediaGroupSchema` 等の
 * `z.object(...).prefault({}).register(...)` factory は prefault で包まれるため、
 * ここを辿らないと sub-shape が取れず sub-fields が描画されない silent bug になる。
 *
 * `.unwrap()` の戻り型は core の `$ZodType` なので、classic として扱うために
 * `instanceof z.ZodType` で受け直す（`as` を使わずに型を確定させるため）。
 */
function unwrapWrapper(schema: z.ZodType): z.ZodType | undefined {
  if (
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodPrefault
  ) {
    const inner = schema.unwrap();
    return inner instanceof z.ZodType ? inner : undefined;
  }
  return undefined;
}

/**
 * Zod スキーマから ZodObject の shape を取得する。
 * ZodDefault / ZodOptional / ZodPrefault のラッパーを再帰的にアンラップする。
 */
export function getZodObjectShape(
  schema: z.ZodType,
): Record<string, z.ZodType> | undefined {
  if (schema instanceof z.ZodObject) return schema.shape;
  const inner = unwrapWrapper(schema);
  return inner ? getZodObjectShape(inner) : undefined;
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
  const meta = fieldRegistry.get(schema);
  if (meta) return meta;

  const inner = unwrapWrapper(schema);
  return inner ? extractFieldMetaDeep(inner) : undefined;
}

/**
 * select フィールドの enum 値を取得する。
 * ZodDefault / ZodOptional / ZodPrefault をアンラップする
 * （`z.enum(...).prefault(...)` を辿らないと空配列を返す silent bug）。
 *
 * 値は `.options` ではなく `def.entries` のキーから取る。`field.select()` が渡すのは
 * 文字列タプルなので両者は一致するが、`.options` の型は `EnumValue[]`（number を含む）
 * で戻り値の `string[]` と噛み合わない。
 */
export function getSelectOptions(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodEnum) return Object.keys(schema.def.entries);
  const inner = unwrapWrapper(schema);
  return inner ? getSelectOptions(inner) : [];
}

/**
 * ZodArray から配列要素の ZodObject shape を取得する。
 * ZodDefault / ZodOptional / ZodPrefault でラップされていても unwrap する。
 */
export function getArrayItemShape(
  schema: z.ZodType,
): Record<string, z.ZodType> | undefined {
  if (schema instanceof z.ZodArray) {
    const element = schema.element;
    return element instanceof z.ZodObject ? element.shape : undefined;
  }
  const inner = unwrapWrapper(schema);
  return inner ? getArrayItemShape(inner) : undefined;
}

/**
 * ZodArray の min / max 制約を取得する。
 *
 * `field.array({ min, max })` の制約は `def.checks` に `$ZodCheckMinLength` /
 * `$ZodCheckMaxLength` として積まれる。公開アクセサ `.minLength` / `.maxLength` は
 * `z.array(x).min(1)` の後でも `null` のままなので使えない（実測）。
 */
export interface ArrayConstraints {
  readonly min?: number;
  readonly max?: number;
}

export function getArrayConstraints(schema: z.ZodType): ArrayConstraints {
  if (!(schema instanceof z.ZodArray)) {
    const inner = unwrapWrapper(schema);
    return inner ? getArrayConstraints(inner) : {};
  }

  let min: number | undefined;
  let max: number | undefined;

  for (const check of schema.def.checks ?? []) {
    if (check instanceof z.core.$ZodCheckMinLength) {
      min = check._zod.def.minimum;
    } else if (check instanceof z.core.$ZodCheckMaxLength) {
      max = check._zod.def.maximum;
    }
  }

  return {
    ...(min !== undefined && { min }),
    ...(max !== undefined && { max }),
  };
}

// ─────────────────────────────────────────────────────────────
// Discriminated Union 対応
// ─────────────────────────────────────────────────────────────

/**
 * Zod 4 の `z.discriminatedUnion()` 情報。
 *
 * `discriminator` は `def.discriminator`、variant は `.options`、各 variant の
 * 判別値は `option.shape[discriminator]`（`ZodLiteral`）の `.values`（Set）から取る。
 */
export interface DiscriminatedUnionInfo {
  readonly discriminator: string;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly schema: z.ZodObject;
  }>;
  readonly meta: FieldMeta | undefined;
}

/**
 * ZodDiscriminatedUnion を判定して discriminator + options を抽出する。
 * ZodDefault / ZodOptional / ZodPrefault でラップされていても unwrap して再帰探索する。
 *
 * page-hero `backgroundMedia` のような `z.discriminatedUnion(...).prefault({...})`
 * を unwrap しないと info が undefined 返りで variant select が出ない silent bug。
 *
 * **FieldMeta は unwrap の外側で登録されている。** `.register(fieldRegistry, …)` は
 * ラッパー側に付くので、再帰で内側へ降りてから `fieldRegistry.get` を呼ぶと
 * `undefined` になり、discriminator の label が生キー（`variant`）に落ちて helpText も
 * 消える。見つけた最も外側の meta を `outerMeta` で持ち回る。
 */
export function extractDiscriminatedUnionInfo(
  schema: z.ZodType,
  outerMeta?: FieldMeta,
): DiscriminatedUnionInfo | undefined {
  const registeredMeta = outerMeta ?? fieldRegistry.get(schema);

  if (!(schema instanceof z.ZodDiscriminatedUnion)) {
    const inner = unwrapWrapper(schema) ?? unwrapPipeOutput(schema);
    return inner
      ? extractDiscriminatedUnionInfo(inner, registeredMeta)
      : undefined;
  }

  const discriminator = schema.def.discriminator;
  const options: DiscriminatedUnionInfo["options"][number][] = [];

  for (const option of schema.options) {
    if (!(option instanceof z.ZodObject)) continue;
    // `ZodObject` の既定 shape は `Record<string, any>` なので、要素を直接読むと
    // `any` が漏れる。戻り型が確定している `getZodObjectShape` を通して封じる。
    const literal = getZodObjectShape(option)?.[discriminator];
    if (!(literal instanceof z.ZodLiteral)) continue;
    const [value] = literal.values;
    if (typeof value !== "string") continue;
    options.push({ value, schema: option });
  }

  if (options.length === 0) return undefined;

  return {
    discriminator,
    options,
    meta: registeredMeta,
  };
}

/**
 * `z.preprocess` の実体である ZodPipe の出力側を返す。
 *
 * page-hero は `safeParse({})` を成立させるため union を preprocess で包んでいる
 * （schema.ts の JSDoc 参照）。ここを辿らないと variant の select が描画されない。
 * 他の helper は pipe を辿らない（辿るのは discriminated union の探索だけ）。
 */
function unwrapPipeOutput(schema: z.ZodType): z.ZodType | undefined {
  if (!(schema instanceof z.ZodPipe)) return undefined;
  const out = schema.def.out;
  return out instanceof z.ZodType ? out : undefined;
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
  const variantShape = getZodObjectShape(activeOption.schema) ?? {};
  for (const [key, fieldSchema] of Object.entries(variantShape)) {
    if (key === discriminator) continue;
    const fieldMeta = extractFieldMetaDeep(fieldSchema);
    if (fieldMeta) {
      variantFields.push({ key, schema: fieldSchema, meta: fieldMeta });
    }
  }

  return [discriminatorField, ...variantFields];
}
