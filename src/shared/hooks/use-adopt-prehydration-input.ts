"use client";

import { useEffect, useEffectEvent, useRef } from "react";

/**
 * 水和前に打たれた入力を、水和直後に 1 度だけ拾い上げる。
 *
 * ## なぜ要るのか
 *
 * SSR された `<input>` は client JS が 1 行も走る前から**見えていて操作できる**。
 * そこへ打たれた文字は DOM の `value` には入るが、fiber がまだ付いていないので
 * React の `onChange` には**届かない**。問題はそのあとで、React は水和時に
 * その食い違いを直さない:
 *
 * - `initInput(..., isHydrating)` の
 *   `isHydrating || value === element.value || (element.value = value)`
 *   により、水和中は props の値を DOM へ書かない（react-dom 19.2.8）
 * - 続く `track(element)` が value tracker を**その時点の DOM 値**で初期化する
 * - 水和の差分検査 `diffHydratedProperties` は `case "value": continue;` で
 *   value を明示的に除外するため、**dev でも production でも警告が出ない**
 *
 * 結果は「DOM は打った文字 / React の state は空 / `onChange` 0 回」という
 * **終端状態**になる。誰も再レンダーを起こさないので、待っても直らない。
 * 同じ語を打ち直しても直らない（tracker が既にその値を持っており変化と
 * 見なされない）。回復するのは**もう 1 文字打った場合だけ**なので、
 * 「打ち終えて手を止めた人」だけが静かに被害に遭う。日本語入力では IME が
 * 変換確定まで `input` を出さないため、その 1 発が水和前に落ちると
 * **クエリ全体**が消える。
 *
 * React 公式は `hydrateRoot` のドキュメントで
 * "There are no guarantees that attribute differences will be patched up in
 * case of mismatches." と明言しており、これを直す facebook/react#12955 は
 * closed(stale) のまま未修正。**上流では直らない**ので、アプリ側で塞ぐ。
 * 処置の形は同 issue が提案しているものと同じ。
 *
 * ## 何をするか
 *
 * 返した ref を対象の要素に付けると、**マウント直後に 1 度だけ**
 * `el.value` と URL 由来の値を比べ、食い違っていたら `commit` を呼ぶ。
 * 食い違いは「水和前に誰かが打った」ことを意味する。
 *
 * 1 度だけで足りるのは、この欠陥が**水和の瞬間にしか発生しない**ため。
 * 以後の入力は fiber が付いているので通常の `onChange` 経路に乗る。
 *
 * ## `<select>` について
 *
 * この hook は `<select>` にも使えるが、**機序は input と同じではない**。
 * 水和経路の `case "select"` は `initInput` に相当する処理も `track()` も
 * 呼ばないので、tracker に値が封じ込められることは起きない。代わりに次の
 * 再レンダーで `updateOptions` が DOM の選択を props 側へ戻すため、
 * 「選択が無言で元に戻る」という別の形の失敗になる。`el.value` と URL 由来値の
 * 突き合わせという処置はどちらにも効く。
 *
 * ## 直し方
 *
 * この hook が呼ばれなくなった（= `ref` が外れた）ときに落ちるのは
 * 水和前入力を再現する e2e と unit test。**待ち時間を伸ばして直そうとしない** —
 * 状態が固定されているので、いくら待っても来ない。
 */
export function useAdoptPrehydrationInput<
  T extends HTMLInputElement | HTMLSelectElement,
>(
  urlValue: string,
  commit: (value: string) => void,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);

  // 水和直後の 1 回だけを見たいので deps は空にする。`commit` と `urlValue` を
  // deps に入れると「以後の入力で値が変わるたびに再実行」になり、見たい瞬間
  // （水和の瞬間）以外でも走る。effect event は deps から除外されるのが仕様。
  const adopt = useEffectEvent(() => {
    const element = ref.current;
    if (element === null || element.value === urlValue) return;
    commit(element.value);
  });

  useEffect(() => {
    adopt();
  }, []);

  return ref;
}
