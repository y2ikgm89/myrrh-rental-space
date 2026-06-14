import {
  useInputControl,
  type DefaultValue,
  type FieldMetadata,
} from "@conform-to/react";

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
 * conform `FieldMetadata<T>` generic invariance の唯一の許可場所（方針: .claude/rules/type-safety.md）。
 * helper 外部で `as unknown as FieldMetadata<...>` を書くことは禁止。
 * 検知は `__tests__/unit/architecture-boundaries.test.ts` の grep gate。
 */
export function useTypedInputControl(
  field: FieldMetadata<unknown>,
): ReturnType<typeof useInputControl<string>> {
  // generic invariance 境界 — 唯一の境界 cast
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
  // generic invariance 境界 — 唯一の境界 cast
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
  // generic invariance 境界 — 唯一の境界 cast
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
  // generic invariance 境界 — 唯一の境界 cast
  return field as unknown as FieldMetadata<T>;
}

/**
 * conform `useForm<T>({ defaultValue })` の `DefaultValue<T>` invariance 境界 helper。
 *
 * preprocess input 型 (`tags: unknown` / `contentWidth: unknown` / boolean 等) は
 * conform `DefaultValue<T>` の string-only 制約と構造的に非互換のため、helper 内部で
 * 境界 cast を集約する。runtime は FormData transit で string 化されるため実害なし。
 *
 * 用途: `defaultValue: asConformDefaultValue<PostSettingsFormData>(toSettingsFormData(post))`
 */
export function asConformDefaultValue<T>(value: unknown): DefaultValue<T> {
  // generic invariance 境界 — DefaultValue<T> の string-only 制約境界
  return value as DefaultValue<T>;
}

/**
 * conform `parseWithZod` の `submission.value` を typed schema の output 型へ narrow する helper。
 *
 * `parseWithZod` の submission.value 型は schema の `z.output<T>` だが、
 * preprocess を持つ schema では output 型と input 型 (`z.input<T>`) が異なり、
 * caller の TForm 型と structural mismatch を起こす。helper 内部で境界 cast を集約。
 *
 * 用途: `return asConformSubmissionValue<PostSettingsFormData>(submission.value)`
 */
export function asConformSubmissionValue<T>(value: unknown): T {
  // generic invariance 境界 — preprocess input/output mismatch 境界
  return value as T;
}

/**
 * conform `form.insert.getButtonProps` / `form.remove.getButtonProps` の動的 schema 境界 helper。
 *
 * conform の Intent / FieldName は branded type のため、動的 schema (22 種 Section type) の
 * AutoArrayField で `name: string` / `defaultValue: Record<string, unknown>` を渡す場合、
 * 緩めた function signature への cast が必要。helper 内部で集約。
 *
 * 用途: `const insert = asConformButtonGetter<InsertButtonGetter>(form.insert.getButtonProps)`
 */
export function asConformButtonGetter<T>(getter: unknown): T {
  // generic invariance 境界 — branded Intent / FieldName 境界
  return getter as T;
}

/**
 * conform `defaultValue` / `form.update({ value })` の動的 schema 用 record 境界 helper。
 *
 * AutoSectionForm の動的 schema (22 種) では `Record<string, unknown>` 形式の config を
 * conform `DefaultValue<Record<string, string | null | undefined>>` に渡す必要がある
 * (runtime は boolean / number / array / object も FormData serialize で string 化される)。
 *
 * 用途: `defaultValue: asConformLooseRecord(defaultConfig)` / `form.update({ value: asConformLooseRecord(data) })`
 */
export function asConformLooseRecord(
  value: unknown,
): Record<string, string | null | undefined> {
  // generic invariance 境界 — runtime string serialization 境界
  return value as Record<string, string | null | undefined>;
}

/**
 * conform `fields` (FormMetadata 戻り値) を typed Fieldset object へ narrow する helper。
 *
 * `useForm<TForm>` の戻り `fields` は `Required<{[K in keyof TForm]: FieldMetadata<TForm[K]>}>` だが、
 * preprocess を持つ schema や TForm が `Record<string, unknown>` 型のとき
 * caller の typed Fieldset 型 (e.g. `ReservationFormFields`) と structural mismatch を起こす。
 *
 * 用途: `<CustomerStep fields={asConformFieldset<ReservationFormFields>(fields)} />`
 */
export function asConformFieldset<T>(fields: unknown): T {
  // generic invariance 境界 — Fieldset object 全体の cast
  return fields as T;
}
