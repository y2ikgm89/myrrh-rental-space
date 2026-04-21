/**
 * Table Color Picker
 *
 * @description テーブル・セル背景色選択コンポーネント
 * テーマカラーパレット + ネイティブカラーピッカー + HEX入力
 */

"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";

// =============================================================================
// パレット定義
// =============================================================================

type PaletteSwatch = {
  label: string;
  value: string;
};

// admin.css の CSS 変数から引き出したテーマカラーパレット
const THEME_PALETTE: readonly PaletteSwatch[] = [
  { label: "なし", value: "" },
  { label: "白", value: "var(--color-card)" },
  { label: "ライトグレー", value: "var(--color-muted)" },
  { label: "セカンダリ", value: "var(--color-secondary)" },
  { label: "アクセント", value: "var(--color-accent)" },
  { label: "プライマリ", value: "var(--color-primary)" },
  { label: "成功", value: "var(--color-success)" },
  { label: "警告", value: "var(--color-warning)" },
  { label: "エラー", value: "var(--color-destructive)" },
];

// =============================================================================
// Types
// =============================================================================

type TableColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

// =============================================================================
// Component
// =============================================================================

export function TableColorPicker({
  value,
  onChange,
  label,
}: TableColorPickerProps) {
  // HEX 入力の一時値（確定前のバッファ）
  const [hexInput, setHexInput] = useState(value);
  // 公式「Adjusting State Directly During Render」パターン:
  // prop の変化を render 中に検知して state を同期する（useEffect 経由の二重レンダー回避）
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [previousValue, setPreviousValue] = useState(value);
  if (value !== previousValue) {
    setPreviousValue(value);
    setHexInput(value);
  }

  const handleHexBlur = () => {
    if (hexInput === "") {
      onChange("");
      return;
    }
    // "#" prefix を正規化
    const normalized = hexInput.startsWith("#") ? hexInput : `#${hexInput}`;
    // 簡易バリデーション: 3 or 6 or 8桁 HEX
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(normalized)) {
      onChange(normalized);
      setHexInput(normalized);
    } else {
      // 不正な値はリセット
      setHexInput(value);
    }
  };

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs">{label}</Label>}

      {/* テーマカラーパレット */}
      <div className="grid grid-cols-5 gap-1.5">
        {THEME_PALETTE.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            title={swatch.label}
            onClick={() => {
              onChange(swatch.value);
              setHexInput(swatch.value);
            }}
            className={cn(
              "h-6 w-full rounded border border-border transition-shadow",
              value === swatch.value && "ring-2 ring-ring ring-offset-1",
            )}
            style={
              swatch.value === ""
                ? {
                    background:
                      "repeating-conic-gradient(var(--color-muted) 0% 25%, transparent 0% 50%) 0 / 8px 8px",
                  }
                : { backgroundColor: swatch.value }
            }
            aria-label={swatch.label}
            aria-pressed={value === swatch.value}
          />
        ))}
      </div>

      {/* カスタムカラー入力 */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#ffffff"}
          onChange={(e) => {
            onChange(e.target.value);
            setHexInput(e.target.value);
          }}
          className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
          title="カスタムカラーを選択"
        />
        <Input
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleHexBlur();
          }}
          placeholder="#000000"
          className="h-7 font-mono text-xs"
        />
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              onChange("");
              setHexInput("");
            }}
          >
            なし
          </Button>
        )}
      </div>
    </div>
  );
}
