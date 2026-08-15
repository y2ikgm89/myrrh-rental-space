import { collectFormDataFromContainer } from "./shared/collect-form-data";
import type { NewsSettingsFormState } from "./use-news-editor";

/**
 * お知らせ設定フォームの FormData を組み立てる。
 *
 * `container` は設定ダイアログの `[data-settings-form-container]`
 * (SettingsDialog.tsx:252)。Radix Dialog は Portal / Content を
 * `present: forceMount || context.open` で包むので、open=false の間は
 * ダイアログごとアンマウントされ **container は null になりうる**。
 *
 * null のとき conform の fields を列挙して補うことはできない。`useForm` が
 * 返す fields は `form.getFieldset()` の戻り値 = `new Proxy({}, { get })` で
 * **ownKeys トラップを持たない**ため `Object.entries(fields)` は常に `[]` を
 * 返す。外部 state を持たない slug / title と、defaultValue にしか無い任意
 * フィールド（publishedAt / contentWidth / SEO・OGP）は呼び出し側の文字列
 * をそのまま載せる。`isPublished` だけは hook 側の外部 state が SSoT なので、
 * container の有無に関わらず最後に `"on"|""` で上書きする。
 */
export function buildNewsSettingsFormData(
  container: HTMLElement | null,
  values: NewsSettingsFormState,
): FormData {
  const formData =
    container === null
      ? new FormData()
      : collectFormDataFromContainer(container);

  if (container === null) {
    formData.set("slug", values.slug);
    formData.set("title", values.title);
    formData.set("publishedAt", values.publishedAt);
    formData.set("contentWidth", values.contentWidth);
    formData.set("contentWidthCustom", values.contentWidthCustom);
    formData.set("metaDescription", values.metaDescription);
    formData.set("metaKeywords", values.metaKeywords);
    formData.set("ogpTitle", values.ogpTitle);
    formData.set("ogpDescription", values.ogpDescription);
    formData.set("ogpImageUrl", values.ogpImageUrl);
  }

  formData.set("isPublished", values.isPublished ? "on" : "");

  return formData;
}
