"use client";

/**
 * PortableTextInlineEditor — PortableTextSpan[] ベースの inline ラベルエディタ
 *
 * 業界 reference: Sanity Portable Text 公式の Span data model + JVM Rich Text Icons の
 * ツールバーピッカー UX。
 *
 * 機能:
 * - contenteditable に span（テキスト）+ iconInline chip を inline 配置
 * - ツールバー「アイコン挿入」ボタン → IconPickerDialog → カーソル位置に iconInline span 挿入
 * - icon chip クリックで削除（差し替えは削除→再挿入）
 * - input イベントで serialize → onChange(spans)
 *
 * a11y:
 * - role="textbox" + aria-multiline="false" + aria-label
 * - icon chip は role="img" + aria-label
 * - ツールバーボタン min-h-11 min-w-11 (WCAG 2.5.5 Enhanced)
 */

import { useEffect, useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
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
  const lastValueRef = useRef<PortableTextSpan[]>(value);

  // value prop → DOM 同期（外部更新時のみ。内部編集は serialize 経由で onChange）
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    if (lastValueRef.current === value) return;
    applySpans(root, value, document);
    lastValueRef.current = value;
  }, [value]);

  const handleInput = () => {
    const root = editorRef.current;
    if (!root) return;
    const spans = serializeNodes(root);
    lastValueRef.current = spans;
    onChange(spans);
  };

  const insertIconAtCaret = (iconName: string) => {
    const root = editorRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      const next: PortableTextSpan[] = [...value, createInlineIcon(iconName)];
      onChange(next);
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
        aria-multiline="false"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled}
        onInput={handleInput}
        onClick={handleEditorClick}
        className="min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-primary"
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
          カーソル位置にアイコンを挿入できます
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
