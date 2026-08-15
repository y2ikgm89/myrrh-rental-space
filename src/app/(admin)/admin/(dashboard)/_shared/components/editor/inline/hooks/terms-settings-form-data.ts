import { collectFormDataFromContainer } from "./shared/collect-form-data";
import type { TermsSettingsFormState } from "./use-terms-editor";

/**
 * 規約設定フォームの FormData を組み立てる。
 *
 * `container` は設定ダイアログの `[data-settings-form-container]`
 * (SettingsDialog.tsx:252)。Radix Dialog は Portal / Content を
 * `present: forceMount || context.open` で包むので、open=false の間は
 * ダイアログごとアンマウントされ **container は null になりうる**。
 *
 * null のとき conform の fields を列挙して補うことはできない。`useForm` が
 * 返す fields は `form.getFieldset()` の戻り値 = `new Proxy({}, { get })` で
 * **ownKeys トラップを持たない**ため `Object.entries(fields)` は常に `[]` を
 * 返す。外部 state を持たない `slug` / `title` は呼び出し側の値から入れる。
 *
 * `type` / `scopes` / `changelog` / `isPublished` / `showInFooter` は hook 側の
 * 外部 state が SSoT なので、container の有無に関わらず最後に上書きする
 * (`form.update` が dirty 連動しないケースがあるため)。
 */
export function buildTermsSettingsFormData(
  container: HTMLElement | null,
  values: TermsSettingsFormState,
): FormData {
  const formData =
    container === null
      ? new FormData()
      : collectFormDataFromContainer(container);

  if (container === null) {
    formData.set("slug", values.slug);
    formData.set("title", values.title);
  }

  formData.set("type", values.type);
  formData.delete("scopes");
  for (const scope of values.scopes) {
    formData.append("scopes", scope);
  }
  formData.set("changelog", values.changelog);
  formData.set("isPublished", values.isPublished ? "on" : "");
  formData.set("showInFooter", values.showInFooter ? "on" : "");

  return formData;
}
