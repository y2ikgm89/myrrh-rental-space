/**
 * 公開フォームの form-level エラー要素は `id={form.errorId}` を持つ。
 *
 * ## なぜ（監査 A-42）
 *
 * conform の `getFormProps` は form にエラーがあるとき `aria-describedby` を**必ず**出す
 * （`aria-describedby: invalid ? metadata.errorId : ariaDescribedBy`、`errorId` は `${id}-error`）。
 * その id を持つ要素がページに無いと、参照先が存在しない `aria-describedby` になる。
 *
 * `role="alert"` があるのでエラー出現の瞬間だけは読み上がるが、**フォーム内をタブで移動して
 * 戻ってきたユーザは、なぜ送信できないのかを再取得する手段が無い**。
 *
 * 実際に公開側 7 本が抜けていた（イベント申込・キャンセル待ち確定・レビュー・プロフィール・
 * 再同意・申込変更・予約変更）。正しい形は同じリポジトリの
 * `inquiry-reply-form.tsx` / `receipt-resend-form.tsx` にあった。
 * 既存の `admin-field-error-association.test.ts` は admin dashboard しか走査しないので、
 * 公開側は無検査だった。
 *
 * ## 何を見るか
 *
 * `src/app/(public)` 配下で `getFormProps(` を使う .tsx が、`id={form.errorId}` を
 * 持つ要素を最低 1 つ持つこと。
 *
 * **フィールド単位は見ない。** `input.tsx` / `textarea.tsx` が conform と同じ
 * `${id}-error` を導出しているので健全で、壊れていたのは form レベルだけ。
 *
 * ## 直し方
 *
 * form-level エラーの `<div role="alert">` に `id={form.errorId}` を足す。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { collectSourceFiles } from "../../helpers/architecture-fs";

const PUBLIC_ROOT = join(process.cwd(), "src", "app", "(public)");

/** conform の form props を使っているか。 */
export function usesFormProps(source: string): boolean {
  return source.includes("getFormProps(");
}

/**
 * form-level エラー要素に errorId を結び付けているか。
 *
 * エラーの描画を子コンポーネントに分けているフォーム（予約フォーム）もあるので、
 * 直の `id={form.errorId}` だけでなく **`form.errorId` を prop として渡す形**も認める。
 * 「id を受け取った子が本当に `id=` に付けたか」までは追えない — 粗いが、
 * 今回の「そもそも errorId を一度も参照していない」形は確実に落とせる。
 */
export function bindsFormErrorId(source: string): boolean {
  return /form\.errorId/u.test(source);
}

function publicFormFiles(): string[] {
  return collectSourceFiles(PUBLIC_ROOT)
    .filter((file) => file.endsWith(".tsx"))
    .filter((file) => usesFormProps(readFileSync(file, "utf8")));
}

describe("公開フォームの form-level エラーは aria-describedby と結び付く", () => {
  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    const files = publicFormFiles();
    // 実測 20 本前後。0 件なら getFormProps の綴りかルートが変わっている。
    expect(files.length).toBeGreaterThan(10);
  });

  test("落ちるべき書き方: errorId を持たないエラー要素", () => {
    const source = `
      <form {...getFormProps(form)}>
        {formErrorMessage !== null && (
          <div role="alert">{formErrorMessage}</div>
        )}
      </form>
    `;
    expect(usesFormProps(source)).toBe(true);
    expect(bindsFormErrorId(source)).toBe(false);
  });

  test("落ちてはいけない書き方: id={form.errorId} を持つ", () => {
    const source = `
      <form {...getFormProps(form)}>
        {formErrorMessage !== null && (
          <div id={form.errorId} role="alert">{formErrorMessage}</div>
        )}
      </form>
    `;
    expect(bindsFormErrorId(source)).toBe(true);
  });

  test("getFormProps を使う公開フォームは全て errorId を結び付けている", () => {
    const offenders = publicFormFiles()
      .filter((file) => !bindsFormErrorId(readFileSync(file, "utf8")))
      .map((file) => file.replaceAll("\\", "/").split("/src/")[1] ?? file);

    expect(offenders).toEqual([]);
  });
});
