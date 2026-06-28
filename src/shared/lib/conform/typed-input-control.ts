import { useInputControl, type FieldMetadata } from "@conform-to/react";

/**
 * `useInputControl` は公式型として string 系の metadata を要求する。
 * 動的 field から hook が読む最小 metadata だけを渡し、値は string に絞る。
 */
export function useTypedInputControl<TForm extends Record<string, unknown>>(
  field: FieldMetadata<unknown, TForm>,
): ReturnType<typeof useInputControl<string>> {
  return useInputControl<string>({
    key: field.key,
    name: field.name,
    formId: field.formId,
    initialValue:
      typeof field.initialValue === "string" ? field.initialValue : undefined,
  });
}

/**
 * 動的 field が配列 field のときだけ Conform の `getFieldList()` を委譲する。
 */
export function getTypedFieldList<TForm extends Record<string, unknown>>(
  field: FieldMetadata<unknown, TForm> & {
    readonly getFieldList?: () => Array<FieldMetadata<unknown, TForm>>;
  },
): ReadonlyArray<FieldMetadata<unknown, TForm>> {
  return field.getFieldList?.() ?? [];
}

export type TypedFieldset<TForm extends Record<string, unknown>> = Record<
  string,
  FieldMetadata<unknown, TForm> | undefined
>;

/**
 * 動的 field が object field のときだけ Conform の `getFieldset()` を委譲する。
 */
export function getTypedFieldset<TForm extends Record<string, unknown>>(
  field: FieldMetadata<unknown, TForm> & {
    readonly getFieldset?: () => TypedFieldset<TForm>;
  },
): TypedFieldset<TForm> {
  return field.getFieldset?.() ?? {};
}
