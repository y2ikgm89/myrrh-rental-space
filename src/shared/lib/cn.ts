import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// public.css / admin.css の @theme が登録するカスタム font-size トークン（`--text-*` 名前空間）。
// デフォルトの tailwind-merge はこれらを text-color と誤分類し、色 utility と衝突させて
// 黙って drop してしまう（例: cn("text-eyebrow text-accent") で text-eyebrow が消える）。
// font-size として登録することで、同じ font-size 同士でのみ衝突解決され、色とは独立に保たれる。
// 値は `--text-<name>` の `<name>` 部分（接頭辞なし）。`--color-rating`（text-rating）は色なので含めない。
// 公式: https://github.com/dcastil/tailwind-merge/blob/main/docs/configuration.md
const CUSTOM_FONT_SIZES = [
  "hero",
  "page-hero",
  "h1",
  "h2",
  "h3",
  "h4",
  "body",
  "small",
  "label",
  "eyebrow",
  "eyebrow-lg",
  "pullquote",
];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      // `text` は `--text-*` 名前空間（= font-size）のキー。
      text: CUSTOM_FONT_SIZES,
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
