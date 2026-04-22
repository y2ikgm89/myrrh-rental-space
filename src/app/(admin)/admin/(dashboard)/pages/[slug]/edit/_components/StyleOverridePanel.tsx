"use client";

/**
 * StyleOverridePanel — セクション個別の styleOverride（部分上書き）を編集する簡易 UI。
 *
 * Full editor は StyleEditor（Style Library）側に集約されているため、ここでは
 * escape hatch として JSON textarea を提供する:
 *  - 入力を defensively parse し、invalid JSON はエラー表示して onChange を呼ばない
 *  - 「上書きをクリア」ボタンで `onChange(null)`（= 継承値に戻す）
 *  - 空 JSON（`{}`）も null 扱い（schema が「全フィールド undefined → null」を返すのと整合）
 */

import { useState } from "react";
import { Button, Label, Textarea } from "@/admin/components/ui";
import type { SectionStyleOverride } from "@/shared/lib/validations/section-style";

interface StyleOverridePanelProps {
  readonly value: SectionStyleOverride | null;
  readonly onChange: (next: SectionStyleOverride | null) => void;
  readonly disabled?: boolean;
}

function formatInitial(value: SectionStyleOverride | null): string {
  if (value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function StyleOverridePanel({
  value,
  onChange,
  disabled,
}: StyleOverridePanelProps) {
  const [draft, setDraft] = useState<string>(() => formatInitial(value));
  const [parseError, setParseError] = useState<string | null>(null);

  const handleChange = (next: string) => {
    setDraft(next);
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      setParseError(null);
      onChange(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "JSON をパースできません",
      );
      return;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      setParseError("上書きはオブジェクトで指定してください");
      return;
    }
    setParseError(null);
    // sectionStyleOverrideSchema は Server Action 側で再検証される。ここは UI 層の
    // 簡易チェックのみ（構文エラー検出）。null と空オブジェクト `{}` は Server 側で
    // null に正規化される。
    onChange(parsed as SectionStyleOverride);
  };

  const handleClear = () => {
    setDraft("");
    setParseError(null);
    onChange(null);
  };

  return (
    <details className="group rounded-lg border border-border/50 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-foreground">
        セクション個別の上書き設定（上級者向け）
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          セクション個別に上書きしたい値のみ設定します。空の場合は Style / Page
          / Global の継承値が使われます。
        </p>
        <Label htmlFor="style-override-json" className="text-xs">
          styleOverride (JSON)
        </Label>
        <Textarea
          id="style-override-json"
          rows={6}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          placeholder={'例:\n{\n  "spacing": { "paddingTop": "lg" }\n}'}
          className="font-mono text-xs"
        />
        {parseError ? (
          <p className="text-xs text-destructive" role="alert">
            {parseError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
          >
            上書きをクリア
          </Button>
        </div>
      </div>
    </details>
  );
}
