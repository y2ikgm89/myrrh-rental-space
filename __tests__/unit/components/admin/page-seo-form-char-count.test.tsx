/**
 * PageSeoForm の文字数カウントは `fields.title.value` を購読する。
 * 旧 `useInputControl().value` は `data-conform` observer しか見ないため
 * 打鍵で更新されなかった。fields.X.value 化後は document の input で追従する。
 *
 * PageSeoForm 本体は media picker / next/image 依存が重いので、同じ
 * shouldRevalidate: "onInput" + fields.X.value 購読だけを切り出して固定する。
 *
 * Bun の global `FormData` は JSDOM の `<form>` を読まない。Conform の
 * `updateFormValue` は `new FormData(form)` で値を取るため、このファイルでは
 * JSDOM の `FormData` に差し替える。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { z } from "zod";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
});

const titleSchema = z.object({ title: z.string() });

function TitleCharCountForm() {
  const [form, fields] = useForm({
    id: "page-seo-title-char-count",
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: titleSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: { title: "Hi" },
  });
  const title = fields.title.value ?? "";

  return (
    <form {...getFormProps(form)}>
      <input {...getInputProps(fields.title, { type: "text" })} />
      <span data-testid="char-count">{title.length}/60</span>
    </form>
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) {
    throw new Error("HTMLInputElement value setter is missing");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  Object.defineProperty(globalThis, "FormData", {
    configurable: true,
    writable: true,
    value: window.FormData,
  });
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
});

describe("PageSeoForm char count", () => {
  test("タイトル入力の打鍵で文字数カウントが更新される", () => {
    act(() => {
      root?.render(<TitleCharCountForm />);
    });

    const titleInput = container?.querySelector('input[name="title"]');
    if (!(titleInput instanceof HTMLInputElement)) {
      throw new Error("title input が見つからない");
    }
    expect(
      container?.querySelector("[data-testid='char-count']")?.textContent,
    ).toBe("2/60");

    act(() => {
      setInputValue(titleInput, "Hello");
    });

    expect(
      container?.querySelector("[data-testid='char-count']")?.textContent,
    ).toBe("5/60");
  });
});
