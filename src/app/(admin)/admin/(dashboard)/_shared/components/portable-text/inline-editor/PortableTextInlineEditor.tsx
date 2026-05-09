"use client";

/**
 * PortableTextInlineEditor — PortableTextSpan[] ベースの inline ラベルエディタ
 *
 * 業界 reference: Sanity Portable Text 公式の Span data model + Notion / Slack の
 * slash command pattern。
 *
 * 機能:
 * - contenteditable に span（テキスト）+ iconInline chip を inline 配置
 * - `/icon` と入力すると IconPickerDialog が開く（slash command）
 * - 選択するとカーソル位置に iconInline span を挿入し、`/icon` テキストを置換
 * - icon chip クリックで削除（差し替えは削除→再挿入）
 * - input イベントで serialize → onChange(spans)
 *
 * a11y:
 * - role="textbox" + aria-multiline="false" + aria-label
 * - icon chip は role="img" + aria-label
 */

import { useEffect, useRef, useState } from "react";
import { IconPickerDialog } from "@/admin/components/icon-picker/IconPickerDialog";
import {
  ICON_CHIP_CLASS_NAME,
  ICON_NAME_ATTR,
  KEY_DATA_ATTR,
  SPAN_TYPE_ATTR,
  applySpans,
  serializeNodes,
} from "./serialize-spans";
import {
  createInlineIcon,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import {
  detectSlashIconTrigger,
  replaceTriggerWithElement,
  type SlashTrigger,
} from "../slash-trigger";

/**
 * `_key` を無視して semantic に等価か判定する。
 * serializeNodes は新規テキストノードに対し毎回新しい `_key` を生成するため、
 * 内部編集後の DOM と value（onChange で送り出した値）の比較には key 無視必須。
 */
function spansEqualIgnoringKey(
  a: PortableTextSpan[],
  b: PortableTextSpan[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (!ai || !bi) return false;
    if (ai._type !== bi._type) return false;
    if (ai._type === "span") {
      if (bi._type !== "span" || ai.text !== bi.text) return false;
    } else {
      if (bi._type !== "iconInline" || ai.name !== bi.name) return false;
    }
  }
  return true;
}

interface PortableTextInlineEditorProps {
  readonly value: PortableTextSpan[];
  readonly onChange: (spans: PortableTextSpan[]) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-label"?: string;
}

export function PortableTextInlineEditor({
  value,
  onChange,
  disabled = false,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel = "テキスト + アイコン",
}: PortableTextInlineEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const triggerRef = useRef<SlashTrigger | null>(null);

  // value prop → DOM 同期（外部更新時のみ。内部編集は serialize 経由で onChange）
  //
  // 親（auto-section-form 等）が毎レンダリングで Zod safeParse を経由して
  // 新しい配列参照を返すため、reference equality チェック（旧実装）では
  // 常に false になり applySpans が毎回実行されてカーソルがリセットされる。
  // 代わりに DOM の現在状態と value を semantic 比較し、一致なら skip する。
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const currentDom = serializeNodes(root);
    if (spansEqualIgnoringKey(currentDom, value)) return;
    applySpans(root, value, document);
  }, [value]);

  const serializeAndEmit = () => {
    const root = editorRef.current;
    if (!root) return;
    const spans = serializeNodes(root);
    onChange(spans);
  };

  const handleInput = () => {
    const root = editorRef.current;
    if (!root) return;

    // `/icon` slash command 検出（dialog がまだ開いていない場合のみ）
    if (!iconDialogOpen) {
      const trigger = detectSlashIconTrigger(root);
      if (trigger) {
        triggerRef.current = trigger;
        setIconDialogOpen(true);
      }
    }

    serializeAndEmit();
  };

  const buildIconChip = (iconName: string): HTMLElement => {
    const newSpan = createInlineIcon(iconName);
    const el = document.createElement("span");
    el.setAttribute(ICON_NAME_ATTR, newSpan.name);
    el.setAttribute(KEY_DATA_ATTR, newSpan._key);
    el.setAttribute(SPAN_TYPE_ATTR, "iconInline");
    el.setAttribute("contenteditable", "false");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", newSpan.name);
    el.className = ICON_CHIP_CLASS_NAME;
    el.textContent = newSpan.name;
    return el;
  };

  const handleIconConfirm = (iconName: string) => {
    if (!iconName) return;
    const root = editorRef.current;
    if (!root) return;

    const trigger = triggerRef.current;
    triggerRef.current = null;
    const el = buildIconChip(iconName);

    if (trigger && root.contains(trigger.node)) {
      // `/icon` テキストを chip で置換
      replaceTriggerWithElement(trigger, el);
    } else {
      // Fallback: 現在の cursor 位置 or 末尾に追加
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(el);
        range.setStartAfter(el);
        range.setEndAfter(el);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        const next: PortableTextSpan[] = [...value, createInlineIcon(iconName)];
        onChange(next);
        return;
      }
    }
    serializeAndEmit();
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const iconSpan = target.closest(`[${ICON_NAME_ATTR}]`);
    if (!iconSpan || !editorRef.current?.contains(iconSpan)) return;
    iconSpan.parentNode?.removeChild(iconSpan);
    serializeAndEmit();
  };

  return (
    <>
      <div
        ref={editorRef}
        id={id}
        role="textbox"
        contentEditable={!disabled}
        suppressContentEditableWarning
        aria-multiline="false"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled}
        onInput={handleInput}
        onClick={handleEditorClick}
        className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-primary"
      />
      <IconPickerDialog
        open={iconDialogOpen}
        onOpenChange={(open) => {
          setIconDialogOpen(open);
          if (!open) triggerRef.current = null;
        }}
        value=""
        onConfirm={handleIconConfirm}
      />
    </>
  );
}
