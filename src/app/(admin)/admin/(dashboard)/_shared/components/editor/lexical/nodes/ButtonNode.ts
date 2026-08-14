/**
 * Button Node
 *
 * @description ボタン/CTAを表示するDecoratorNode
 *
 * 公開 Button Primitive (`@/public/components/design-system/button`) と
 * variant / size / sharp edge / WCAG 2.5.5 (44px) を完全一致させる。
 * label は PortableTextSpan[] (text + icon 混在の rich label)。
 * AccentColor (data-color 10色) で bronze 以外の accent も指定可能。
 *
 * Lexical Rule §17 準拠: createDOM / exportDOM では CSS クラス禁止、
 * data-attribute のみで構築し `lexical-content.css` の
 * `[data-button-*]` セレクタで公開 Button Primitive と視覚一致するスタイルを適用。
 *
 * server / headless でも import 可能。編集 UI は ButtonNode.decorator.client。
 */

import type { ReactElement } from "react";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from "lexical";
import {
  $create,
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from "lexical";
import { portableTextSpanSchema } from "@/shared/lib/portable-text/schema";
import {
  createInlineIcon,
  createSpan,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import { isAccentColor, type AccentColor } from "../config/accent-colors";
import {
  createEnumGuard,
  parseBoolean,
  parseStringWithDefault,
} from "../config/type-guards";
import { renderLexicalDecorator } from "./decorator-registry";
import { sanitizeLexicalUrlScheme } from "@/shared/lib/html/lexical-html-sanitize-config";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "link" | "editorial";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonAlignment = "left" | "center" | "right";

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "link",
  "editorial",
] as const;
export const BUTTON_SIZES: readonly ButtonSize[] = ["sm", "md", "lg"] as const;
export const BUTTON_ALIGNMENTS: readonly ButtonAlignment[] = [
  "left",
  "center",
  "right",
] as const;

export const isButtonVariant = createEnumGuard<ButtonVariant>(BUTTON_VARIANTS);
export const isButtonSize = createEnumGuard<ButtonSize>(BUTTON_SIZES);
export const isButtonAlignment =
  createEnumGuard<ButtonAlignment>(BUTTON_ALIGNMENTS);

export const buttonLabelState = createState("label", {
  parse: (v: unknown): PortableTextSpan[] => {
    if (!Array.isArray(v)) return [];
    const result: PortableTextSpan[] = [];
    for (const item of v) {
      const parsed = portableTextSpanSchema.safeParse(item);
      if (parsed.success) result.push(parsed.data);
    }
    return result;
  },
});

export const buttonHrefState = createState("href", {
  parse: parseStringWithDefault("#"),
});

export const buttonVariantState = createState("variant", {
  parse: (v: unknown): ButtonVariant =>
    typeof v === "string" && isButtonVariant(v) ? v : "primary",
});

export const buttonSizeState = createState("size", {
  parse: (v: unknown): ButtonSize =>
    typeof v === "string" && isButtonSize(v) ? v : "md",
});

export const buttonAlignmentState = createState("alignment", {
  parse: (v: unknown): ButtonAlignment =>
    typeof v === "string" && isButtonAlignment(v) ? v : "center",
});

export const buttonColorState = createState("color", {
  parse: (v: unknown): AccentColor =>
    typeof v === "string" && isAccentColor(v) ? v : "default",
});

export const buttonOpenInNewTabState = createState("openInNewTab", {
  parse: parseBoolean,
});

function appendButtonIconToken(link: HTMLElement, iconName: string): void {
  const el = document.createElement("span");
  el.setAttribute("data-icon-name", iconName);
  el.setAttribute("data-button-icon", "");
  el.setAttribute("aria-hidden", "true");
  link.appendChild(el);
}

// exportDOM は label (PortableTextSpan[]) の各要素を anchor 内の子として
// text span → プレーン <span>、icon span → `data-icon-name` 付き <span>
// (appendButtonIconToken) の形で出力する。importDOM 側はこの構造を歩いて
// span 配列を再構築する。data-icon-name を持つ要素は icon span、それ以外の
// 要素/テキストは text span として扱う。span 構造を持たない (手書き HTML 等の)
// フラットテキストは後方互換として1つの text span にフォールバックする。
function $convertButtonLabelSpans(link: HTMLElement): PortableTextSpan[] {
  const spans: PortableTextSpan[] = [];
  for (const child of Array.from(link.childNodes)) {
    if (child instanceof HTMLElement) {
      const iconName = child.getAttribute("data-icon-name");
      if (iconName) {
        spans.push(createInlineIcon(iconName));
        continue;
      }
      const text = child.textContent ?? "";
      if (text) spans.push(createSpan(text));
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) spans.push(createSpan(text));
    }
  }
  if (spans.length === 0) {
    const text = link.textContent ?? "";
    if (text) spans.push(createSpan(text));
  }
  return spans;
}

function $convertButtonElement(
  element: HTMLElement,
): null | DOMConversionOutput {
  const link = element.querySelector("a");
  if (!link) return null;

  const label = $convertButtonLabelSpans(link);
  // 修正: 従来は href を無検証で読んでいたため、data-button 属性を持つ
  // 貼り付け HTML を細工されると javascript: 等の危険スキームがそのまま
  // buttonHrefState に格納されていた（LinkNode.sanitizeUrl 相当の検証欠如）。
  // @lexical/link の LinkNode.sanitizeUrl と同じパターンで import 時に無害化する。
  const href = sanitizeLexicalUrlScheme(link.getAttribute("href") ?? "#");
  const variantAttr = element.getAttribute("data-button-variant");
  const sizeAttr = element.getAttribute("data-button-size");
  const alignmentAttr = element.getAttribute("data-button-alignment");
  const colorAttr = element.getAttribute("data-color");
  const openInNewTab = link.getAttribute("target") === "_blank";

  const variant: ButtonVariant =
    variantAttr && isButtonVariant(variantAttr) ? variantAttr : "primary";
  const size: ButtonSize = sizeAttr && isButtonSize(sizeAttr) ? sizeAttr : "md";
  const alignment: ButtonAlignment =
    alignmentAttr && isButtonAlignment(alignmentAttr)
      ? alignmentAttr
      : "center";
  const color: AccentColor =
    colorAttr && isAccentColor(colorAttr) ? colorAttr : "default";

  const node = $createButtonNode({
    label,
    href,
    variant,
    size,
    alignment,
    color,
    openInNewTab,
  });
  return { node };
}

export class ButtonNode extends DecoratorNode<ReactElement | null> {
  override $config() {
    return this.config("button", {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: buttonLabelState },
        { flat: true, stateConfig: buttonHrefState },
        { flat: true, stateConfig: buttonVariantState },
        { flat: true, stateConfig: buttonSizeState },
        { flat: true, stateConfig: buttonAlignmentState },
        { flat: true, stateConfig: buttonColorState },
        { flat: true, stateConfig: buttonOpenInNewTabState },
      ],
    });
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute("data-button")) {
          return {
            conversion: $convertButtonElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  override exportDOM(): DOMExportOutput {
    const label = $getState(this, buttonLabelState);
    const href = $getState(this, buttonHrefState);
    const variant = $getState(this, buttonVariantState);
    const size = $getState(this, buttonSizeState);
    const alignment = $getState(this, buttonAlignmentState);
    const color = $getState(this, buttonColorState);
    const openInNewTab = $getState(this, buttonOpenInNewTabState);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-button", "true");
    wrapper.setAttribute("data-button-alignment", alignment);
    wrapper.setAttribute("data-button-variant", variant);
    wrapper.setAttribute("data-button-size", size);
    if (color !== "default") {
      wrapper.setAttribute("data-color", color);
    }

    const link = document.createElement("a");
    link.setAttribute("href", href);
    if (openInNewTab) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noreferrer");
    }

    for (const span of label) {
      if (span._type === "span") {
        const el = document.createElement("span");
        el.textContent = span.text;
        link.appendChild(el);
      } else {
        appendButtonIconToken(link, span.name);
      }
    }

    wrapper.appendChild(link);
    return { element: wrapper };
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-button", "true");
    div.setAttribute(
      "data-button-alignment",
      $getState(this, buttonAlignmentState),
    );
    return div;
  }

  override updateDOM(): false {
    return false;
  }

  /**
   * block DOM を出す DecoratorNode は block として扱わせる（監査 F-26）。
   *
   * Lexical の DecoratorNode 既定は `isInline() === true`。inline のままだと
   * `$insertNodes` が ParagraphNode の**子**として splice するので、exportDOM は
   * `<p>前半<div>…</div>後半</p>` を出す。保存パイプラインの enrich が DOMParser で
   * 再パースするため、HTML 仕様どおり `<div>` の直前で `<p>` が閉じられ、
   * **画像より後ろの本文が `<p>` の外へ出て段落スタイルを失い、末尾に空段落が残る**。
   * 編集画面は Lexical が DOM を programmatic に組むので再パースが起きず、
   * 管理者には正常に見える。
   */
  override isInline(): false {
    return false;
  }

  override decorate(): ReactElement | null {
    return renderLexicalDecorator("button", {
      nodeKey: this.getKey(),
    });
  }
}

export function $createButtonNode({
  label = [],
  href = "#",
  variant = "primary",
  size = "md",
  alignment = "center",
  color = "default",
  openInNewTab = false,
}: {
  label?: PortableTextSpan[];
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  alignment?: ButtonAlignment;
  color?: AccentColor;
  openInNewTab?: boolean;
} = {}): ButtonNode {
  const node = $create(ButtonNode);
  $setState(node, buttonLabelState, label);
  $setState(node, buttonHrefState, href);
  $setState(node, buttonVariantState, variant);
  $setState(node, buttonSizeState, size);
  $setState(node, buttonAlignmentState, alignment);
  $setState(node, buttonColorState, color);
  $setState(node, buttonOpenInNewTabState, openInNewTab);
  return node;
}

export function $isButtonNode(
  node: LexicalNode | null | undefined,
): node is ButtonNode {
  return node instanceof ButtonNode;
}
