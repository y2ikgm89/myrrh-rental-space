/**
 * 水和前に打たれた入力が失われないことを、**元の欠陥の形**で固定する。
 *
 * ## なぜ
 *
 * SSR された `<input>` は client JS が走る前から操作でき、そこへ入った文字は
 * DOM の `value` に残るが React の `onChange` には届かない。React は水和時に
 * この食い違いを直さない（`initInput` の `isHydrating` 短絡 / `track()` が
 * DOM 値で tracker を初期化 / 差分検査は `value` を除外）ため、
 * 「DOM は文字入り・state は空・onChange 0 回」で固定される。
 * 待っても直らないので、待ち時間を伸ばす修正は効かない。
 *
 * ## 何を固定するか
 *
 * 1. **水和前**に値を入れる → 水和後に `commit` が打った値で 1 回呼ばれる
 * 2. **対照**: 水和**後**に同じことをする → `onChange` が発火する
 *    （＝イベント経路自体は生きていて、水和前だから届かないのだと示す）
 * 3. 何も触らずに水和 → `commit` は 0 回（余計な URL 書き込みを作らない）
 *
 * 2 が無いと、1 の失敗が「イベントが届かない」のか「この環境では
 * そもそもイベントが動かない」のか区別できない。
 *
 * ## 直し方
 *
 * 1 が落ちたら `ref` が外れているか hook が呼ばれていない。
 * **期待値を緩めない** — 打った文字が消える状態は利用者から見て壊れている。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { useAdoptPrehydrationInput } from "@/shared/hooks/use-adopt-prehydration-input";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

globalThis.NodeFilter = window.NodeFilter;

/**
 * 「人間が打った」を模す。React は value setter にパッチを当てて変更を
 * 追跡するので、`element.value = x` の代入では tracker を騙せない。
 * native の setter を直に呼んでから `input` を bubbles で流すのが、
 * ブラウザの実際の入力と同じ経路になる。
 */
function typeInto(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) {
    throw new Error("HTMLInputElement.prototype の value setter が取れない");
  }
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 実物（SearchBar / EventListFilters）と同じ形の controlled input。 */
function SearchField({
  urlValue,
  commit,
  onChange,
}: {
  readonly urlValue: string;
  readonly commit: (value: string) => void;
  readonly onChange: (value: string) => void;
}) {
  const ref = useAdoptPrehydrationInput<HTMLInputElement>(urlValue, commit);
  return (
    <input
      ref={ref}
      type="search"
      value={urlValue}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      aria-label="検索"
      readOnly
    />
  );
}

describe("水和前に打たれた入力を拾う", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(
      <SearchField urlValue="" commit={() => {}} onChange={() => {}} />,
    );
  });

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
  });

  function inputElement(): HTMLInputElement {
    const element = container.querySelector("input");
    if (element === null) throw new Error("SSR された input が無い");
    return element;
  }

  test("水和前に入った値を commit へ渡す", () => {
    const commit = mock((_value: string) => {});
    const onChange = mock((_value: string) => {});

    // 水和より前に打つ。fiber がまだ無いので onChange には届かない。
    typeInto(inputElement(), "ヨガ");
    expect(onChange).toHaveBeenCalledTimes(0);

    act(() => {
      root = hydrateRoot(
        container,
        <SearchField urlValue="" commit={commit} onChange={onChange} />,
      );
    });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[0]).toBe("ヨガ");
  });

  test("対照: 水和後に同じことをすると onChange が発火する", () => {
    const commit = mock((_value: string) => {});
    const onChange = mock((_value: string) => {});

    act(() => {
      root = hydrateRoot(
        container,
        <SearchField urlValue="" commit={commit} onChange={onChange} />,
      );
    });
    expect(commit).toHaveBeenCalledTimes(0);

    // 水和後なら通常のイベント経路が生きている。
    act(() => {
      typeInto(inputElement(), "ヨガ");
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toBe("ヨガ");
  });

  test("何も触らずに水和したら commit は呼ばれない", () => {
    const commit = mock((_value: string) => {});

    act(() => {
      root = hydrateRoot(
        container,
        <SearchField urlValue="" commit={commit} onChange={() => {}} />,
      );
    });

    expect(commit).toHaveBeenCalledTimes(0);
  });
});
