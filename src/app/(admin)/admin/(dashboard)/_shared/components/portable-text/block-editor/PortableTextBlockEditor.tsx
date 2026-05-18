"use client";

/**
 * PortableTextBlockEditor — PortableTextBlock[] ベースの長文ラベルエディタ
 *
 * 業界 reference: Sanity Portable Text 公式の Block data model + Notion / Slack の
 * slash command pattern。Lexical は使わない（spans editor と同じく軽量実装で SSR safe）。
 *
 * 機能:
 * - contenteditable に各 block を `<p>` として配置
 * - Enter キーで block split（新しい `<p>` 作成）
 * - `/icon` と入力すると IconPickerDialog が開く（slash command）
 * - 選択するとカーソル位置に iconInline span を挿入し、`/icon` テキストを置換
 * - icon chip クリックで削除（差し替えは削除→再挿入）
 * - input イベントで serialize → onChange(blocks)
 *
 * a11y:
 * - role="textbox" + aria-multiline="true" + aria-label
 * - icon chip は role="img" + aria-label
 */

import { useEffect, useRef, useState } from "react";
import { IconPickerDialog } from "@/admin/components/icon-picker/IconPickerDialog";
import {
  applyBlocks,
  serializeBlocks,
  ICON_CHIP_CLASS_NAME,
  ICON_NAME_ATTR,
  KEY_DATA_ATTR,
  SPAN_TYPE_ATTR,
} from "./serialize-blocks";
import {
  createInlineIcon,
  type PortableTextBlock,
} from "@/shared/lib/portable-text";
import {
  detectSlashIconTrigger,
  replaceTriggerWithElement,
  type SlashTrigger,
} from "../slash-trigger";

/**
 * `_key` を無視して semantic に等価か判定する。
 * serializeBlocks は新規テキストノードに対し毎回新しい `_key` を生成するため、
 * 内部編集後の DOM と value（onChange で送り出した値）の比較には key 無視必須。
 */
function blocksEqualIgnoringKey(
  a: PortableTextBlock[],
  b: PortableTextBlock[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (!ai || !bi) return false;
    if (ai.style !== bi.style) return false;
    if (ai.children.length !== bi.children.length) return false;
    for (let j = 0; j < ai.children.length; j++) {
      const aj = ai.children[j];
      const bj = bi.children[j];
      if (!aj || !bj) return false;
      if (aj._type !== bj._type) return false;
      if (aj._type === "span") {
        if (bj._type !== "span" || aj.text !== bj.text) return false;
      } else {
        if (bj._type !== "iconInline" || aj.name !== bj.name) return false;
      }
    }
  }
  return true;
}

interface PortableTextBlockEditorProps {
  readonly value: PortableTextBlock[];
  readonly onChange: (blocks: PortableTextBlock[]) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-label"?: string;
}

export function PortableTextBlockEditor({
  value,
  onChange,
  disabled = false,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel = "本文",
}: PortableTextBlockEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const triggerRef = useRef<SlashTrigger | null>(null);

  // value prop → DOM 同期（外部更新時のみ。内部編集は serialize 経由で onChange）
  //
  // 親（auto-section-form 等）が毎レンダリングで Zod safeParse を経由して
  // 新しい配列参照を返すため、reference equality チェック（旧実装）では
  // 常に false になり applyBlocks が毎回実行されてカーソルがリセットされる。
  // 代わりに DOM の現在状態と value を semantic 比較し、一致なら skip する。
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const currentDom = serializeBlocks(root);
    if (blocksEqualIgnoringKey(currentDom, value)) return;
    applyBlocks(root, value, document);
  }, [value]);

  const serializeAndEmit = () => {
    const root = editorRef.current;
    if (!root) return;
    const blocks = serializeBlocks(root);
    onChange(blocks);
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
      // Fallback: 現在の cursor 位置 or 末尾の block に追加
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
        const lastBlock = value[value.length - 1];
        const newBlocks: PortableTextBlock[] =
          lastBlock !== undefined
            ? [
                ...value.slice(0, -1),
                {
                  ...lastBlock,
                  children: [...lastBlock.children, createInlineIcon(iconName)],
                },
              ]
            : [
                {
                  _key: crypto.randomUUID(),
                  _type: "block",
                  style: "normal",
                  children: [createInlineIcon(iconName)],
                },
              ];
        onChange(newBlocks);
        return;
      }
    }
    serializeAndEmit();
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!(e.target instanceof Element)) return;
    const iconSpan = e.target.closest(`[${ICON_NAME_ATTR}]`);
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
        aria-multiline="true"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled}
        onInput={handleInput}
        onClick={handleEditorClick}
        className="min-h-[6rem] w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-primary [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
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
