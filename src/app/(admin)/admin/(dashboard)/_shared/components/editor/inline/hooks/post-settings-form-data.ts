import { collectFormDataFromContainer } from "./shared/collect-form-data";
import type { PostSettingsFormState } from "./use-post-editor";

/**
 * 投稿設定フォームの FormData を組み立てる。
 *
 * `container` は設定ダイアログの `[data-settings-form-container]`
 * (SettingsDialog.tsx:252)。Radix Dialog は Portal / Content を
 * `present: forceMount || context.open` で包むので、open=false の間は
 * ダイアログごとアンマウントされ **container は null になりうる**。
 *
 * null のとき conform の fields を列挙して補うことはできない。`useForm` が
 * 返す fields は `form.getFieldset()` の戻り値 = `new Proxy({}, { get })` で
 * **ownKeys トラップを持たない**ため `Object.entries(fields)` は常に `[]` を
 * 返す。未マウント時は呼び出し側の値から入れる。
 *
 * 配列は JSON.stringify（`tagsFormSchema` の JSON string transit）。boolean
 * の "on" 変換はしない（投稿設定に checkbox フィールドは無い）。
 *
 * `status` は hook 側の外部 state が SSoT なので、container の有無に関わらず
 * 最後に上書きする。
 */
export function buildPostSettingsFormData(
  container: HTMLElement | null,
  values: PostSettingsFormState,
): FormData {
  const formData =
    container === null
      ? new FormData()
      : collectFormDataFromContainer(container);

  if (container === null) {
    for (const [key, value] of Object.entries(values)) {
      if (Array.isArray(value)) {
        formData.set(key, JSON.stringify(value));
      } else if (value != null) {
        formData.set(key, value);
      }
    }
  }

  formData.set("status", values.status);

  return formData;
}
