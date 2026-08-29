"use client";

/**
 * レイアウト設定フィールド（インライン Post / News 用）
 *
 * conform `FieldMetadata` ベース。コンテンツ幅の個別設定のみ。
 *
 * ## conform generic invariance 境界
 *
 * `FieldMetadata<T>` は invariant のため、Pure Component に値・error 文字列・
 * callback のみを渡し、Connected ラッパーで型ブリッジする。境界 cast は
 * `@/shared/lib/conform/control` の `useTypedControl` helper
 * 内に集約済。
 */

import { type FieldMetadata } from "@conform-to/react";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import {
  HiddenControlInput,
  useTypedControl,
} from "@/shared/lib/conform/control";

// =============================================================================
// Pure Component（conform 非依存）
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
  contentWidthCustomValue,
  contentWidthCustomId,
  contentWidthCustomError,
  onContentWidthChange,
  onContentWidthCustomChange,
  disabled,
}: {
  contentWidth: string;
  contentWidthCustomValue: string;
  contentWidthCustomId: string;
  contentWidthCustomError: string | undefined;
  onContentWidthChange: (width: string | undefined) => void;
  onContentWidthCustomChange: (value: string) => void;
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
          <Label htmlFor={contentWidthCustomId}>カスタム幅 (px)</Label>
          <Input
            id={contentWidthCustomId}
            type="number"
            min={320}
            max={1920}
            value={contentWidthCustomValue}
            onChange={(e) => onContentWidthCustomChange(e.target.value)}
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
// Connected ラッパー（conform 型ブリッジ）
// =============================================================================

/**
 * LayoutFieldsConnected — conform 接続ラッパー
 *
 * `FieldMetadata<T>` の generic invariance を Pure Component に Pure 値で
 * 透過する。境界 cast は `useTypedControl` helper 内に集約済。
 */
export function LayoutFieldsConnected<TForm extends Record<string, unknown>>({
  fields,
  disabled,
}: {
  fields: Record<string, FieldMetadata<unknown, TForm>>;
  disabled?: boolean;
}) {
  const contentWidthField = fields["contentWidth"];
  const contentWidthCustomField = fields["contentWidthCustom"];
  if (!contentWidthField || !contentWidthCustomField) {
    throw new Error(
      "LayoutFieldsConnected: contentWidth / contentWidthCustom fields が見つかりません",
    );
  }
  const contentWidthControl = useTypedControl(contentWidthField);
  const contentWidthCustomControl = useTypedControl(contentWidthCustomField);

  const contentWidth =
    typeof contentWidthControl.value === "string" && contentWidthControl.value
      ? contentWidthControl.value
      : "DEFAULT";

  const contentWidthCustomValue =
    typeof contentWidthCustomControl.value === "string"
      ? contentWidthCustomControl.value
      : "";

  return (
    <>
      <HiddenControlInput
        field={contentWidthField}
        control={contentWidthControl}
      />
      <HiddenControlInput
        field={contentWidthCustomField}
        control={contentWidthCustomControl}
      />
      <LayoutFields
        contentWidth={contentWidth}
        contentWidthCustomValue={contentWidthCustomValue}
        contentWidthCustomId={contentWidthCustomField.id}
        contentWidthCustomError={contentWidthCustomField.errors?.[0]}
        onContentWidthChange={(width) => {
          contentWidthControl.change(width ?? "");
          if (width !== "CUSTOM") {
            contentWidthCustomControl.change("");
          }
        }}
        onContentWidthCustomChange={(value) =>
          contentWidthCustomControl.change(value)
        }
        disabled={disabled}
      />
    </>
  );
}
