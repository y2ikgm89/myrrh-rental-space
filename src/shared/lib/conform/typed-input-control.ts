import { useInputControl, type FieldMetadata } from "@conform-to/react";

/**
 * `useInputControl` の generic invariance 境界を helper 内に閉じ込めた wrapper。
 *
 * conform `useInputControl<Value>` の `Value` constraint は
 * `string | string[] | Array<string | undefined>` で、`null` を含む union
 * (e.g. `string | null | undefined`) は構造的に extends 不可。
 * runtime は常に string ベース (FormData transit) のため、helper 内部で
 * `FieldMetadata<string>` に固定 cast し、呼び出し側の cast を排除する。
 *
 * value の narrow が必要な場合は caller 側で typeof / instanceof で行う
 * (既存 LayoutFields / AutoBooleanField の `typeof control.value === "string"`
 * パターンと同等)。
 *
 * ledger §6 conform `FieldMetadata<T>` generic invariance の唯一の許可場所。
 * helper 外部で `as unknown as FieldMetadata<...>` を書くことは禁止。
 * 検知は `__tests__/unit/architecture-boundaries.test.ts` の grep gate。
 */
export function useTypedInputControl(
  field: FieldMetadata<unknown>,
): ReturnType<typeof useInputControl<string>> {
  // §6 generic invariance — 唯一の境界 cast
  return useInputControl(field as unknown as FieldMetadata<string>);
}

/**
 * `FieldMetadata<T[]>.getFieldList()` の generic invariance 境界を helper 内に閉じ込める。
 *
 * 動的 schema (22 種の Section type の AutoArrayField) で配列要素を反復する際、
 * `FieldMetadata<unknown>` → `FieldMetadata<T[]>` の boundary cast が必要となる。
 * 戻り値も型注釈付きで返すため `ReadonlyArray<FieldMetadata<T>>` への上 cast を併用する
 * (`as\s+unknown\s+as\s+FieldMetadata` grep gate には引っかからない)。
 */
export function getTypedFieldList<T>(
  field: FieldMetadata<unknown>,
): ReadonlyArray<FieldMetadata<T>> {
  // §6 generic invariance — 唯一の境界 cast
  const items = (field as unknown as FieldMetadata<unknown[]>).getFieldList();
  return items as unknown as ReadonlyArray<FieldMetadata<T>>;
}

/**
 * `FieldMetadata<Record<string, T>>.getFieldset()` の generic invariance 境界を helper 内に閉じ込める。
 *
 * 動的 schema (AutoGroupField / AutoArrayField の item fieldset) で object を分解する際、
 * `FieldMetadata<unknown>` → `FieldMetadata<Record<string, unknown>>` の boundary cast が必要。
 * 戻り値も型注釈付きで返すため typed shape への上 cast を併用する
 * (`as\s+unknown\s+as\s+FieldMetadata` grep gate には引っかからない)。
 */
export function getTypedFieldset<T extends Record<string, unknown>>(
  field: FieldMetadata<unknown>,
): { readonly [K in keyof T]: FieldMetadata<T[K]> } {
  // §6 generic invariance — 唯一の境界 cast
  const fieldset = (
    field as unknown as FieldMetadata<Record<string, unknown>>
  ).getFieldset();
  return fieldset as unknown as {
    readonly [K in keyof T]: FieldMetadata<T[K]>;
  };
}

/**
 * Connected wrapper パターンで Pure Component に「型注釈付き FieldMetadata」を渡したいときの helper。
 * cast を helper 内に閉じ込めて呼び出し側の cast を排除する。
 *
 * 用途: `tagsField={asTypedField<string[]>(ctx.fields.tags)}` のような prop 配送境界。
 */
export function asTypedField<T>(
  field: FieldMetadata<unknown>,
): FieldMetadata<T> {
  // §6 generic invariance — 唯一の境界 cast
  return field as unknown as FieldMetadata<T>;
}
