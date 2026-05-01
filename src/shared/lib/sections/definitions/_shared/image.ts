/**
 * 共通画像グループ factory
 *
 * Section schema 共通の image group 表現 SSoT。
 * `{ url, alt, caption? }` 構造に揃えることで a11y / SEO を強制し、
 * Public renderer 側も `<Image alt={...} />` の値ソースを一元化できる。
 *
 * - `createImageGroupSchema`: caption を含むフル版（hero / hero-parallax / concept 等）
 * - `createCompactImageGroupSchema`: caption 不要のコンパクト版（testimonial.items[] 等）
 */

import { field } from "../../field-registry";

export function createImageGroupSchema(label = "画像") {
  return field.group(
    label,
    {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト（a11y / SEO）", {
        maxLength: 200,
        helpText: "画像が読み込めない場合や読み上げ時に使用",
      }),
      caption: field.text("キャプション（任意）", {
        maxLength: 300,
        helpText: "画像下部に表示する説明文",
      }),
    },
    { subGroup: "image" },
  );
}

export function createCompactImageGroupSchema(label = "画像") {
  return field.group(
    label,
    {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト", { maxLength: 200 }),
    },
    { subGroup: "image" },
  );
}
