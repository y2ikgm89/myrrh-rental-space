"use client";

/**
 * PortableTextBlockEditor — PortableTextBlock[] ベースの長文ラベルエディタ
 *
 * 業界 reference: Sanity Portable Text 公式の Block data model + 既存
 * `PortableTextInlineEditor` と同じ contenteditable + DOM walker パターン。
 * Lexical は使わない（spans editor と同じく軽量実装で SSR safe + dynamic import 不要）。
 *
 * 機能:
 * - contenteditable に各 block を `<p>` として配置
 * - Enter キーで block split（新しい `<p>` 作成）
 * - ツールバー「アイコン挿入」ボタン → IconPickerDialog → カーソル位置に iconInline span 挿入
 * - icon chip クリックで削除（差し替えは削除→再挿入）
 * - input イベントで serialize → onChange(blocks)
 *
 * a11y:
 * - role="textbox" + aria-multiline="true" + aria-label
 * - icon chip は role="img" + aria-label
 * - ツールバーボタン min-h-11 min-w-11 (WCAG 2.5.5 Enhanced)
 */

import { useEffect, useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
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
  const lastValueRef = useRef<PortableTextBlock[]>(value);

  // value prop → DOM 同期（外部更新時のみ。内部編集は serialize 経由で onChange）
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    if (lastValueRef.current === value) return;
    applyBlocks(root, value, document);
    lastValueRef.current = value;
  }, [value]);

  const handleInput = () => {
    const root = editorRef.current;
    if (!root) return;
    const blocks = serializeBlocks(root);
    lastValueRef.current = blocks;
    onChange(blocks);
  };

  const insertIconAtCaret = (iconName: string) => {
    const root = editorRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      // Fallback: append icon to last block (or create new block)
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
    const range = sel.getRangeAt(0);
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
    range.deleteContents();
    range.insertNode(el);
    range.setStartAfter(el);
    range.setEndAfter(el);
    sel.removeAllRanges();
    sel.addRange(range);
    handleInput();
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const iconSpan = target.closest(`[${ICON_NAME_ATTR}]`);
    if (!iconSpan || !editorRef.current?.contains(iconSpan)) return;
    iconSpan.parentNode?.removeChild(iconSpan);
    handleInput();
  };

  return (
    <div className="space-y-2">
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
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIconDialogOpen(true)}
          disabled={disabled}
          aria-label="アイコンを挿入"
        >
          <IconPlus className="mr-1 h-4 w-4" aria-hidden="true" />
          アイコン挿入
        </Button>
        <span className="text-xs text-muted-foreground">
          Enter で改段落、カーソル位置にアイコンを挿入できます
        </span>
      </div>
      <IconPickerDialog
        open={iconDialogOpen}
        onOpenChange={setIconDialogOpen}
        value=""
        onConfirm={(name) => {
          if (name) insertIconAtCaret(name);
        }}
      />
    </div>
  );
}
