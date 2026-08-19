import {
  unstable_useControl as useControl,
  type FieldMetadata,
} from "@conform-to/react";
import type { RefCallback } from "react";

type RegisteredControlElement =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Conform `unstable_useControl` の集中ラッパ。
 *
 * `useInputControl` は mount effect で `document.forms.namedItem(formId)` を
 * 探し、見つからないと警告して終わる。Radix Portal は children を 1 render
 * 遅らせるため、Dialog 祖先で呼ぶと form 未登場のまま再実行されない。
 * 加えて同名要素が無いと dummy `<select>` を form に挿入する。
 *
 * `useControl` は form を参照せず dummy も挿入しない。呼び出し側が name
 * 持ち要素に `register` を付ける。`unstable_` と型差はここに閉じる。
 */
export function useFieldControl(field: {
  key?: string | undefined;
  initialValue?: unknown;
}) {
  return useControl<string>({
    key: field.key,
    initialValue:
      typeof field.initialValue === "string" ? field.initialValue : undefined,
  });
}

/**
 * 動的 field（`FieldMetadata<unknown, TForm>`）用。値は string に絞る。
 */
export function useTypedControl<TForm extends Record<string, unknown>>(
  field: FieldMetadata<unknown, TForm>,
) {
  return useControl<string>({
    key: field.key,
    initialValue:
      typeof field.initialValue === "string" ? field.initialValue : undefined,
  });
}

type HiddenControl = {
  register: RefCallback<RegisteredControlElement | undefined>;
  value: string | undefined;
};

/**
 * 唯一の name carrier として常時マウントする hidden input。
 *
 * `defaultValue` を描画するのは SSR / no-JS でも値が送信されるようにするため
 * （現行の controlled hidden input と同等）。mount 後の値は
 * register / change / reset が imperative に同期するため uncontrolled。
 *
 * `register` はここでだけ bind する。呼び出し側が `control.register` を
 * 同じ関数内で `control.value` と読むと `react-hooks/refs` が
 * 「ref を render 中に読んでいる」と判定する。
 */
export function HiddenControlInput({
  field,
  control,
}: {
  field: { name: string };
  control: HiddenControl;
}) {
  /* eslint-disable react-hooks/refs -- register は公式の render-time RefCallback。この component が bind の唯一の入口 */
  return (
    <input
      type="hidden"
      name={field.name}
      defaultValue={control.value ?? ""}
      ref={control.register}
    />
  );
  /* eslint-enable react-hooks/refs */
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
