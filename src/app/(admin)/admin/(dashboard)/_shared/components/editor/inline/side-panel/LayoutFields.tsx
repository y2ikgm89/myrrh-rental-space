"use client";

/**
 * レイアウト設定フィールド（インライン Post / News 用）
 *
 * コンテンツ幅の個別設定のみ。ブログ記事・お知らせに `showSidebar` カラムは無いため
 * 当 UI では扱わない。
 *
 * ## RHF 7.72 型境界の設計判断
 *
 * Control<T> が invariant になったため、異なるフォーム型（NewsFormData / PostFormData）で
 * 1つのコンポーネントを共有する公式パターンは存在しない（RHF ドキュメント確認済み）。
 *
 * 採用パターン: **Pure Component + Connected ラッパー**
 * - LayoutFields: RHF に一切依存しない Pure Component（値と callback のみ）
 * - LayoutFieldsConnected: RHF の型ブリッジ。Path<T> キャストは RHF の Path 型が
 *   ジェネリック T からリテラル文字列を解決できない既知制限への対処。
 *   `as never` や `as Control<any>` ではなく `as Path<T>` で意図を明示する。
 */

import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormSetValue,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { SidePanelSectionProps } from "../types";

// =============================================================================
// Pure Component（RHF 非依存）
// =============================================================================

interface ContentWidthOption {
  value: string;
  label: string;
  description: string;
}

const CONTENT_WIDTH_OPTIONS: readonly ContentWidthOption[] = [
  {
    value: "DEFAULT",
    label: "デフォルト（サイト設定を使用）",
    description: "",
  },
  { value: "XS", label: "極小 (640px)", description: "狭いコンテンツ向け" },
  { value: "SM", label: "小 (768px)", description: "記事コンテンツ推奨" },
  { value: "MD", label: "中 (1024px)", description: "バランスの良い幅" },
  { value: "LG", label: "大 (1280px)", description: "広めのコンテンツ" },
  { value: "CUSTOM", label: "カスタム", description: "任意の幅を指定" },
];

export function LayoutFields({
  contentWidth,
  contentWidthCustomProps,
  contentWidthCustomError,
  onContentWidthChange,
  disabled,
}: {
  contentWidth: string;
  contentWidthCustomProps: Record<string, unknown> | undefined;
  contentWidthCustomError: string | undefined;
  onContentWidthChange: (width: string | undefined) => void;
  disabled: boolean | undefined;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="contentWidth">コンテンツ幅</Label>
        <Select
          value={contentWidth}
          onValueChange={(value) => {
            onContentWidthChange(value === "DEFAULT" ? undefined : value);
          }}
          {...(disabled !== undefined && { disabled })}
        >
          <SelectTrigger id="contentWidth">
            <SelectValue placeholder="デフォルト（サイト設定を使用）" />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_WIDTH_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  {option.description && (
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          この記事のコンテンツ表示幅を個別に設定できます
        </p>
      </div>

      {contentWidth === "CUSTOM" && (
        <div className="space-y-2">
          <Label htmlFor="contentWidthCustom">カスタム幅 (px)</Label>
          <Input
            id="contentWidthCustom"
            type="number"
            min="320"
            max="1920"
            {...contentWidthCustomProps}
            placeholder="例: 900"
            disabled={disabled}
          />
          {contentWidthCustomError && (
            <p className="text-sm text-destructive">
              {contentWidthCustomError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            320px〜1920pxの範囲で入力してください
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Connected ラッパー（RHF 型ブリッジ）
// =============================================================================

/** FieldErrors から安全にメッセージを取り出すヘルパー */
function getErrorMessage<T extends FieldValues>(
  errors: FieldErrors<T>,
  name: string,
): string | undefined {
  const entry = (errors as Record<string, { message?: string } | undefined>)[
    name
  ];
  return entry?.message;
}

/**
 * LayoutFieldsConnected — RHF 接続ラッパー
 *
 * render callback からコンポーネントとしてレンダリングされるため hooks が使える。
 * Path<T> キャストは RHF の既知の TypeScript 制限への対処:
 * ジェネリック T に対して文字列リテラルが有効なパスであることを型レベルで証明できない。
 */
export function LayoutFieldsConnected<T extends FieldValues>({
  control,
  register,
  errors,
  setValue,
  disabled,
}: Omit<SidePanelSectionProps<T>, "getValues">) {
  const contentWidthPath = "contentWidth" as Path<T>;
  const contentWidthCustomPath = "contentWidthCustom" as Path<T>;

  const contentWidth =
    useWatch({ control, name: contentWidthPath }) ?? "DEFAULT";

  return (
    <LayoutFields
      contentWidth={String(contentWidth)}
      contentWidthCustomProps={
        register(contentWidthCustomPath) as Record<string, unknown>
      }
      contentWidthCustomError={getErrorMessage(errors, "contentWidthCustom")}
      onContentWidthChange={(width) => {
        (setValue as UseFormSetValue<FieldValues> | undefined)?.(
          "contentWidth",
          width,
        );
        if (width !== "CUSTOM") {
          (setValue as UseFormSetValue<FieldValues> | undefined)?.(
            "contentWidthCustom",
            undefined,
          );
        }
      }}
      disabled={disabled}
    />
  );
}
